-- Preserve Cart matching semantics while enforcing the existing Hub membership boundary.
do $$
declare signature text; function_oid oid; definition text; body text;
begin
 foreach signature in array array[
  'public.wc_cart_standard_base_package(text,integer)',
  'public.wc_cart_addon_rule(text,integer)',
  'public.wc_cart_base_package(text,integer)'
 ] loop
  function_oid:=to_regprocedure(signature);
  if function_oid is null then raise exception 'Cart mapping prerequisite missing: %',signature; end if;
  select pg_get_functiondef(function_oid),prosrc into definition,body from pg_proc where oid=function_oid;
  body:=regexp_replace(body,'\mbegin\M','begin' || chr(10) ||
   ' if not public.wc_is_active_hub_member() then raise exception ''Active Hub membership required''; end if;','i');
  execute replace(definition,(select prosrc from pg_proc where oid=function_oid),body);
  execute format('revoke all on function %s from public,anon',function_oid::regprocedure);
  execute format('grant execute on function %s to authenticated',function_oid::regprocedure);
 end loop;
end $$;

create or replace function public.wc_cart_packing_file_boxes()
returns table(signature text,box_index integer,package_id uuid)
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
 if not public.wc_is_active_hub_member() then raise exception 'Active Hub membership required'; end if;
 return query select p.signature,(b.n-1)::integer,wc_cart_base_package(p.signature,(b.n-1)::integer)
 from wc_delivery_packaging_profiles p cross join lateral jsonb_array_elements(p.packages) with ordinality b(box,n)
 where wc_is_hub_manager();
end $$;
revoke all on function public.wc_cart_packing_file_boxes() from public,anon;
grant execute on function public.wc_cart_packing_file_boxes() to authenticated;
