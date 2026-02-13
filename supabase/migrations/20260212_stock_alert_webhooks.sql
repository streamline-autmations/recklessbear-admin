begin;

alter table public.materials_inventory
  add column if not exists low_alert_sent_at timestamptz;

alter table public.materials_inventory
  add column if not exists critical_alert_sent_at timestamptz;

commit;

