-- Add the five Finance business categories whose tax mappings have been
-- explicitly confirmed. The name column is the table's unique identifier, so
-- rerunning this migration updates the same five rows rather than duplicating them.

insert into public.business_categories (name, tax_attribute, tax_category, active)
values
  ('TAX PAYG', 'Operating Expenses', 'TAX', true),
  ('TAX GST', 'Operating Expenses', 'TAX', true),
  ('TAX Profit', 'Operating Expenses', 'TAX', true),
  ('Company Insurance', 'Operating Expenses', 'Insurance', true),
  ('Transaction Fee', 'Operating Expenses', 'Others', true)
on conflict (name) do update
set
  tax_attribute = excluded.tax_attribute,
  tax_category = excluded.tax_category,
  active = excluded.active;
