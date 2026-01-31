-- 2️⃣ Stock System — Atomic Deduction RPC (idempotent, transaction-safe)

ALTER TABLE public.stock_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_transaction_line_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow read access to authenticated users" ON public.stock_transactions;
DROP POLICY IF EXISTS "Allow insert access to authenticated users" ON public.stock_transactions;
DROP POLICY IF EXISTS "Allow read access to authenticated users" ON public.stock_transaction_line_items;
DROP POLICY IF EXISTS "Allow insert access to authenticated users" ON public.stock_transaction_line_items;

CREATE POLICY "stock_transactions_read_authenticated"
  ON public.stock_transactions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "stock_transactions_write_admin"
  ON public.stock_transactions FOR ALL
  TO authenticated
  USING (public.get_user_role(auth.uid()) IN ('admin', 'ceo'))
  WITH CHECK (public.get_user_role(auth.uid()) IN ('admin', 'ceo'));

CREATE POLICY "stock_transaction_items_read_authenticated"
  ON public.stock_transaction_line_items FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "stock_transaction_items_write_admin"
  ON public.stock_transaction_line_items FOR ALL
  TO authenticated
  USING (public.get_user_role(auth.uid()) IN ('admin', 'ceo'))
  WITH CHECK (public.get_user_role(auth.uid()) IN ('admin', 'ceo'));

CREATE OR REPLACE FUNCTION public.deduct_stock_for_job(
  p_job_id uuid,
  p_items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead_id uuid;
  v_already_deducted timestamptz;
  v_tx_id uuid;
  v_item jsonb;
  v_product_type text;
  v_size text;
  v_qty numeric;
  v_material record;
  v_required numeric;
  v_on_hand numeric;
  v_has_bom boolean;
BEGIN
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'p_items must be a JSON array';
  END IF;

  SELECT lead_id
  INTO v_lead_id
  FROM public.jobs
  WHERE id = p_job_id
  FOR UPDATE;

  IF v_lead_id IS NULL THEN
    RAISE EXCEPTION 'Job not found: %', p_job_id;
  END IF;

  SELECT printing_stock_deducted_at
  INTO v_already_deducted
  FROM public.leads
  WHERE id = v_lead_id
  FOR UPDATE;

  IF v_already_deducted IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'skipped', 'reason', 'already_deducted', 'printing_stock_deducted_at', v_already_deducted);
  END IF;

  INSERT INTO public.stock_transactions (
    type,
    reference_id,
    notes,
    status,
    transaction_date,
    created_by
  )
  VALUES (
    'production_deduction',
    p_job_id::text,
    'Auto deduction at printing stage',
    'completed',
    now(),
    auth.uid()
  )
  RETURNING id INTO v_tx_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_type := nullif(trim(v_item->>'product_type'), '');
    v_size := nullif(trim(v_item->>'size'), '');
    v_qty := (v_item->>'quantity')::numeric;
    v_has_bom := false;

    IF v_product_type IS NULL THEN
      RAISE EXCEPTION 'Missing product_type in item: %', v_item;
    END IF;
    IF v_qty IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'Invalid quantity for product %: %', v_product_type, v_item->>'quantity';
    END IF;

    FOR v_material IN
      WITH size_match AS (
        SELECT material_id, qty_per_unit
        FROM public.product_material_usage
        WHERE product_type = v_product_type
          AND size IS NOT NULL
          AND size = v_size
      ),
      generic_match AS (
        SELECT material_id, qty_per_unit
        FROM public.product_material_usage
        WHERE product_type = v_product_type
          AND size IS NULL
      )
      SELECT * FROM size_match
      UNION ALL
      SELECT * FROM generic_match
      WHERE NOT EXISTS (SELECT 1 FROM size_match)
    LOOP
      v_has_bom := true;
      v_required := v_material.qty_per_unit * v_qty;
      IF v_required = 0 THEN
        CONTINUE;
      END IF;

      SELECT qty_on_hand
      INTO v_on_hand
      FROM public.materials_inventory
      WHERE id = v_material.material_id
      FOR UPDATE;

      IF v_on_hand IS NULL THEN
        RAISE EXCEPTION 'Material not found in inventory: %', v_material.material_id;
      END IF;

      IF v_on_hand < v_required THEN
        RAISE EXCEPTION 'Insufficient stock for material %, required %, on_hand %', v_material.material_id, v_required, v_on_hand;
      END IF;

      UPDATE public.materials_inventory
      SET qty_on_hand = qty_on_hand - v_required,
          updated_at = now()
      WHERE id = v_material.material_id;

      INSERT INTO public.stock_movements (
        material_id,
        delta_qty,
        type,
        reference,
        notes,
        created_by
      )
      VALUES (
        v_material.material_id,
        -v_required,
        'consumed',
        p_job_id::text,
        format('Printing deduction: %s%s x %s', v_product_type, COALESCE(' (' || v_size || ')', ''), v_qty),
        auth.uid()
      );

      INSERT INTO public.stock_transaction_line_items (
        transaction_id,
        material_id,
        quantity,
        notes
      )
      VALUES (
        v_tx_id,
        v_material.material_id,
        -v_required,
        format('%s%s x %s', v_product_type, COALESCE(' (' || v_size || ')', ''), v_qty)
      );
    END LOOP;

    IF v_has_bom = false THEN
      RAISE EXCEPTION 'No BOM configured for product % (size %)', v_product_type, COALESCE(v_size, '');
    END IF;
  END LOOP;

  UPDATE public.leads
  SET printing_stock_deducted_at = now(),
      stock_updated = true,
      updated_at = now()
  WHERE id = v_lead_id;

  RETURN jsonb_build_object('status', 'ok', 'transaction_id', v_tx_id);
END;
$$;
