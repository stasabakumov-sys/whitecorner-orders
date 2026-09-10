-- JSON text preserves escaped characters that PostgreSQL JSONB cannot represent.
-- Existing snapshots and the table's authenticated read-only RLS stay unchanged.
alter table public.wc_wix_order_history add column if not exists source_json text;
