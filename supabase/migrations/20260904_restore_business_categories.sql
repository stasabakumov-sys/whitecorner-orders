-- Restore categories which are still evidenced by transaction classifications or
-- classification rules.  The Finance UI reads business_categories when connected
-- to Supabase, so a category referenced only by those tables otherwise disappears
-- from every category selector and from the Assets views.
--
-- Deliberately do not rewrite transaction classifications or existing category
-- tax mappings.  A missing category is inserted only when every recorded source
-- agrees on its tax mapping; an ambiguity aborts the migration instead of guessing.

do $$
declare
  ambiguous_categories text;
begin
  with recorded_mappings as (
    select
      btrim(t.business_category) as name,
      btrim(t.tax_attribute) as tax_attribute,
      btrim(t.tax_category) as tax_category
    from public.transactions t
    where nullif(btrim(t.business_category), '') is not null
      and btrim(t.business_category) not in ('Uncategorised', 'Other')
      and nullif(btrim(t.tax_attribute), '') is not null
      and nullif(btrim(t.tax_category), '') is not null

    union all

    select
      btrim(r.business_category) as name,
      btrim(r.tax_attribute) as tax_attribute,
      btrim(r.tax_category) as tax_category
    from public.classification_rules r
    where nullif(btrim(r.business_category), '') is not null
      and btrim(r.business_category) not in ('Uncategorised', 'Other')
      and nullif(btrim(r.tax_attribute), '') is not null
      and nullif(btrim(r.tax_category), '') is not null
  ), ambiguous as (
    select name
    from recorded_mappings
    group by name
    having count(distinct (tax_attribute, tax_category)) > 1
  )
  select string_agg(name, ', ' order by name)
  into ambiguous_categories
  from ambiguous;

  if ambiguous_categories is not null then
    raise exception
      'Cannot restore business categories with conflicting recorded tax mappings: %',
      ambiguous_categories;
  end if;
end
$$;

with recorded_mappings as (
  select
    btrim(t.business_category) as name,
    btrim(t.tax_attribute) as tax_attribute,
    btrim(t.tax_category) as tax_category
  from public.transactions t
  where nullif(btrim(t.business_category), '') is not null
    and btrim(t.business_category) not in ('Uncategorised', 'Other')
    and nullif(btrim(t.tax_attribute), '') is not null
    and nullif(btrim(t.tax_category), '') is not null

  union all

  select
    btrim(r.business_category) as name,
    btrim(r.tax_attribute) as tax_attribute,
    btrim(r.tax_category) as tax_category
  from public.classification_rules r
  where nullif(btrim(r.business_category), '') is not null
    and btrim(r.business_category) not in ('Uncategorised', 'Other')
    and nullif(btrim(r.tax_attribute), '') is not null
    and nullif(btrim(r.tax_category), '') is not null
), recoverable_categories as (
  select
    name,
    min(tax_attribute) as tax_attribute,
    min(tax_category) as tax_category
  from recorded_mappings
  group by name
  having count(distinct (tax_attribute, tax_category)) = 1
)
insert into public.business_categories (name, tax_attribute, tax_category, active)
select name, tax_attribute, tax_category, true
from recoverable_categories
on conflict (name) do update
set active = true
where business_categories.active is distinct from true;
