begin;

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

  insert into public.stock_transactions(type, reference, notes, created_at, created_by, transaction_date)
  values (p_type, p_reference, p_notes, now(), auth.uid(), now())
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

    insert into public.stock_movements(material_id, delta_qty, type, reference, notes, created_at, created_by)
    values (v_material_id, v_delta_qty, v_movement_type, p_reference, p_notes, now(), auth.uid());

    update public.materials_inventory
    set qty_on_hand = v_new_qty,
        updated_at = now()
    where id = v_material_id;
  end loop;

  return v_transaction_id;
end;
$$;

commit;

