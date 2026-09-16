-- Wix may expose painting as a dedicated Paint/Painting option instead of
-- Colour or Finish. Keep the production finish resolver aligned with the UI:
-- an affirmative paint selection is Painted, while No/Raw remains Raw.
create or replace function public.wc_shop_order_finish(options jsonb,missing_default text) returns text
language sql immutable set search_path=public as $$
 with normalized as(
  select lower(btrim(key)) key,lower(btrim(wc_shop_option_text(value))) value
  from jsonb_each(case when jsonb_typeof(options)='object' then options else '{}'::jsonb end)
  where lower(btrim(key)) ~ '^(colou?r|finish|paint|painting)$'
 ),classified as(
  select case
   when value='' then null
   when value ~ '^(raw|unpainted|natural)([[:space:]]*/|$)' then 'raw'
   when key in('paint','painting') and value ~ '^(no|none|false|0|not selected|not required|without paint)([[:space:]]*/|$)' then 'raw'
   else 'painted' end finish
  from normalized
 ),resolved as(
  select count(distinct finish) count,min(finish) finish from classified where finish is not null
 )
 select case when count=0 then case when missing_default in('raw','painted') then missing_default end
  when count=1 then finish end from resolved
$$;

revoke all on function public.wc_shop_order_finish(jsonb,text) from public,anon,authenticated;
