begin;

alter table public.stock_transactions
  add column if not exists reference text;

update public.stock_transactions
set reference = reference_id
where reference is null
  and reference_id is not null;

create index if not exists idx_stock_transactions_reference on public.stock_transactions(reference);
create index if not exists idx_stock_transactions_created_at on public.stock_transactions(created_at);

alter table public.stock_transaction_line_items
  add column if not exists delta_qty numeric;

update public.stock_transaction_line_items
set delta_qty = quantity
where delta_qty is null;

create index if not exists idx_stock_transaction_items_transaction_id on public.stock_transaction_line_items(transaction_id);
create index if not exists idx_stock_transaction_items_material_id on public.stock_transaction_line_items(material_id);

do $$
begin
  drop policy if exists "Allow read access to authenticated users" on public.materials_inventory;
  drop policy if exists "Allow write access to authenticated users" on public.materials_inventory;
  drop policy if exists "Admin can write inventory" on public.materials_inventory;

  create policy "Allow read access to authenticated users"
    on public.materials_inventory
    for select
    to authenticated
    using (true);

  create policy "Admin can write inventory"
    on public.materials_inventory
    for all
    to authenticated
    using (public.get_user_role(auth.uid()) in ('ceo','admin'))
    with check (public.get_user_role(auth.uid()) in ('ceo','admin'));

  drop policy if exists "Allow read access to authenticated users" on public.product_material_usage;
  drop policy if exists "Allow write access to authenticated users" on public.product_material_usage;
  drop policy if exists "Admin can write bom" on public.product_material_usage;

  create policy "Allow read access to authenticated users"
    on public.product_material_usage
    for select
    to authenticated
    using (true);

  create policy "Admin can write bom"
    on public.product_material_usage
    for all
    to authenticated
    using (public.get_user_role(auth.uid()) in ('ceo','admin'))
    with check (public.get_user_role(auth.uid()) in ('ceo','admin'));

  drop policy if exists "Allow read access to authenticated users" on public.stock_movements;
  drop policy if exists "Allow insert access to authenticated users" on public.stock_movements;
  drop policy if exists "Admin can read stock movements" on public.stock_movements;
  drop policy if exists "Admin can insert stock movements" on public.stock_movements;

  create policy "Allow read access to authenticated users"
    on public.stock_movements
    for select
    to authenticated
    using (true);

  create policy "Admin can write stock movements"
    on public.stock_movements
    for all
    to authenticated
    using (public.get_user_role(auth.uid()) in ('ceo','admin'))
    with check (public.get_user_role(auth.uid()) in ('ceo','admin'));

  drop policy if exists "Allow read access to authenticated users" on public.stock_transactions;
  drop policy if exists "Allow insert access to authenticated users" on public.stock_transactions;
  drop policy if exists "Admin can read stock transactions" on public.stock_transactions;
  drop policy if exists "Admin can insert stock transactions" on public.stock_transactions;

  create policy "Allow read access to authenticated users"
    on public.stock_transactions
    for select
    to authenticated
    using (true);

  create policy "Admin can write stock transactions"
    on public.stock_transactions
    for all
    to authenticated
    using (public.get_user_role(auth.uid()) in ('ceo','admin'))
    with check (public.get_user_role(auth.uid()) in ('ceo','admin'));

  drop policy if exists "Allow read access to authenticated users" on public.stock_transaction_line_items;
  drop policy if exists "Allow insert access to authenticated users" on public.stock_transaction_line_items;
  drop policy if exists "Admin can read stock transaction line items" on public.stock_transaction_line_items;
  drop policy if exists "Admin can insert stock transaction line items" on public.stock_transaction_line_items;

  create policy "Allow read access to authenticated users"
    on public.stock_transaction_line_items
    for select
    to authenticated
    using (true);

  create policy "Admin can write stock transaction line items"
    on public.stock_transaction_line_items
    for all
    to authenticated
    using (public.get_user_role(auth.uid()) in ('ceo','admin'))
    with check (public.get_user_role(auth.uid()) in ('ceo','admin'));
end $$;

create or replace function public.stock_apply_transaction(
  p_type text,
  p_reference text,
  p_notes text,
  p_line_items jsonb
)
returns uuid
language plpgsql
security invoker
as $$
declare
  v_transaction_id uuid;
  v_item jsonb;
  v_material_id uuid;
  v_delta_qty numeric;
  v_movement_type text;
  v_current_qty numeric;
  v_new_qty numeric;
begin
  if public.get_user_role(auth.uid()) not in ('ceo','admin') then
    raise exception 'forbidden';
  end if;

  if p_type not in ('purchase_order','production_deduction','adjustment','return','initial_balance') then
    raise exception 'invalid_transaction_type';
  end if;

  if jsonb_typeof(p_line_items) <> 'array' then
    raise exception 'invalid_line_items';
  end if;

  insert into public.stock_transactions(type, reference, notes, created_at)
  values (p_type, p_reference, p_notes, now())
  returning id into v_transaction_id;

  for v_item in select * from jsonb_array_elements(p_line_items)
  loop
    v_material_id := (v_item->>'material_id')::uuid;
    v_delta_qty := (v_item->>'delta_qty')::numeric;
    v_movement_type := nullif(v_item->>'type','');

    if v_delta_qty = 0 then
      raise exception 'zero_quantity_not_allowed';
    end if;

    if v_movement_type is null then
      v_movement_type := case when v_delta_qty > 0 then 'restocked' else 'consumed' end;
    end if;

    if v_movement_type not in ('consumed','restocked','audit') then
      raise exception 'invalid_movement_type';
    end if;

    select qty_on_hand
    into v_current_qty
    from public.materials_inventory
    where id = v_material_id
    for update;

    if v_current_qty is null then
      raise exception 'material_not_found';
    end if;

    v_new_qty := v_current_qty + v_delta_qty;

    if v_new_qty < 0 then
      raise exception 'insufficient_stock';
    end if;

    insert into public.stock_transaction_line_items(transaction_id, material_id, delta_qty, created_at)
    values (v_transaction_id, v_material_id, v_delta_qty, now());

    insert into public.stock_movements(material_id, delta_qty, type, reference, created_at, created_by)
    values (v_material_id, v_delta_qty, v_movement_type, p_reference, now(), auth.uid());

    update public.materials_inventory
    set qty_on_hand = v_new_qty,
        updated_at = now()
    where id = v_material_id;
  end loop;

  return v_transaction_id;
end;
$$;

create or replace function public.deduct_stock_for_job(p_job_id uuid)
returns jsonb
language plpgsql
security invoker
as $$
declare
  v_existing uuid;
  v_job record;
  v_items jsonb;
  v_item jsonb;
  v_product_type text;
  v_size text;
  v_quantity numeric;
  v_bom record;
  v_totals_map jsonb := '{}'::jsonb;
  v_material_id uuid;
  v_delta numeric;
  v_line_items jsonb := '[]'::jsonb;
  v_key text;
  v_transaction_id uuid;
  v_bom_count integer;
  v_has_specific boolean;
begin
  if public.get_user_role(auth.uid()) not in ('ceo','admin') then
    raise exception 'forbidden';
  end if;

  perform pg_advisory_xact_lock(hashtext('deduct_stock_for_job:' || p_job_id::text));

  select id
  into v_existing
  from public.stock_transactions
  where type = 'production_deduction'
    and coalesce(reference, reference_id) = p_job_id::text
    and coalesce(status, 'completed') = 'completed'
  limit 1;

  if v_existing is not null then
    return jsonb_build_object('status','already_deducted','transaction_id',v_existing);
  end if;

  select id, lead_id, product_list
  into v_job
  from public.jobs
  where id = p_job_id;

  if v_job.id is null then
    raise exception 'job_not_found';
  end if;

  v_items := coalesce(v_job.product_list, '[]'::jsonb);
  if jsonb_typeof(v_items) <> 'array' then
    raise exception 'invalid_job_product_list';
  end if;

  for v_item in select * from jsonb_array_elements(v_items)
  loop
    v_product_type := nullif(v_item->>'product_type','');
    if v_product_type is null then
      v_product_type := nullif(v_item->>'product_name','');
    end if;
    v_size := nullif(v_item->>'size','');
    v_quantity := nullif(v_item->>'quantity','')::numeric;

    if v_product_type is null or v_quantity is null then
      raise exception 'invalid_job_item';
    end if;

    v_bom_count := 0;
    if v_size is null then
      v_has_specific := false;
    else
      select exists(
        select 1
        from public.product_material_usage
        where product_type = v_product_type
          and size = v_size
      ) into v_has_specific;
    end if;

    for v_bom in
      select material_id, qty_per_unit
      from public.product_material_usage
      where product_type = v_product_type
        and (
          (v_has_specific and size = v_size)
          or
          ((not v_has_specific) and size is null)
        )
    loop
      v_bom_count := v_bom_count + 1;
      v_material_id := v_bom.material_id;
      v_delta := -1 * (v_bom.qty_per_unit * v_quantity);

      if v_delta = 0 then
        continue;
      end if;

      v_key := v_material_id::text;
      if (v_totals_map ? v_key) then
        v_totals_map := jsonb_set(v_totals_map, array[v_key], to_jsonb((v_totals_map->>v_key)::numeric + v_delta));
      else
        v_totals_map := jsonb_set(v_totals_map, array[v_key], to_jsonb(v_delta));
      end if;
    end loop;

    if v_bom_count = 0 then
      raise exception 'bom_missing_for_item';
    end if;
  end loop;

  if v_totals_map = '{}'::jsonb then
    raise exception 'bom_missing';
  end if;

  v_line_items := '[]'::jsonb;
  for v_key in select key from jsonb_each_text(v_totals_map)
  loop
    v_line_items := v_line_items || jsonb_build_object(
      'material_id', v_key,
      'delta_qty', (v_totals_map->>v_key)::numeric,
      'type', 'consumed'
    );
  end loop;

  v_transaction_id := public.stock_apply_transaction(
    'production_deduction',
    p_job_id::text,
    'auto_deduct_for_job:' || p_job_id::text,
    v_line_items
  );

  return jsonb_build_object(
    'status','deducted',
    'transaction_id', v_transaction_id,
    'job_id', p_job_id::text,
    'line_items', v_line_items
  );
end;
$$;

commit;
