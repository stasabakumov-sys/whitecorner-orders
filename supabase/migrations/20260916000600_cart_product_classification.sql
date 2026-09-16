-- Product cards imported before Cart classification existed can still carry
-- a stale type. Repair them and keep the material RPC safe for future imports.

update public.wc_shipping_products
set product_type='Cart',updated_at=clock_timestamp()
where active and product_type is distinct from 'Cart'
 and product_name ~* '(\mcart\M|\mmobile bar\M|\mserving table\M|\mevent bar\M)';

create or replace function public.wc_save_cart_material_profile(
 p_product uuid,
 p_size text,
 p_kind text,
 p_lines jsonb,
 p_confirmed boolean,
 p_expected timestamptz
) returns void language plpgsql security definer set search_path=public as $$
declare
 v_product_name text;
 profile_key text;
 profile_options jsonb;
 option_name text;
 prior timestamptz;
 r record;
begin
 if auth.uid() is null then raise exception 'Authentication required';end if;
 if p_size is null or length(btrim(p_size)) not between 1 and 300 then raise exception 'Choose a Cart size';end if;
 select product_name into v_product_name from wc_shipping_products where id=p_product and active
  and (product_type='Cart' or product_name~*'(\mcart\M|\mmobile bar\M|\mserving table\M|\mevent bar\M)');
 if v_product_name is null then raise exception 'Cart product not found';end if;

 if p_kind='main' then
  profile_key=jsonb_build_array('catalog-v4-cart-base',p_product,btrim(p_size),'complete')::text;
  profile_options=jsonb_build_object('Size',btrim(p_size));
 elsif p_kind in('option:Internal Shelf','option:Side shelves') then
  option_name=substring(p_kind from 8);
  profile_key=jsonb_build_array('catalog-v4-cart-option',p_product,btrim(p_size),lower(option_name),'yes')::text;
  profile_options=jsonb_build_object('Size',btrim(p_size),option_name,'Yes');
 else
  raise exception 'Unsupported Cart cost part';
 end if;

 if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines)>100 then raise exception 'Invalid materials';end if;
 if exists(select 1 from jsonb_array_elements(p_lines) l where (l->>'quantity')::numeric is null or (l->>'quantity')::numeric<=0 or (l->>'quantity')::numeric>100000 or not exists(select 1 from wc_materials where id=(l->>'material_id')::uuid and active)) then raise exception 'Invalid material quantity';end if;
 if (select count(*) from jsonb_array_elements(p_lines))<>(select count(distinct l->>'material_id') from jsonb_array_elements(p_lines) l) then raise exception 'Duplicate materials';end if;

 perform pg_advisory_xact_lock(hashtextextended(profile_key,0));
 select updated_at into prior from wc_material_profiles where variant_key=profile_key;
 if prior is distinct from p_expected then raise exception 'Profile changed; refresh';end if;

 insert into wc_material_profiles(variant_key,product_name,options,lines,updated_by,shipping_product_id,template_item,work_costs,pans_cost_gst,materials_confirmed,costing_version)
 values(profile_key,v_product_name,profile_options,p_lines,auth.uid(),p_product,
  jsonb_build_object('profile_scope','cart-size-materials','kind',p_kind,'multiplier',1,'size_key',btrim(p_size),'options',profile_options,'has_pans',false,'standard_top_excluded',false),
  '{}'::jsonb,0,coalesce(p_confirmed,false),2)
 on conflict(variant_key) do update set
  lines=excluded.lines,
  materials_confirmed=excluded.materials_confirmed,
  updated_by=auth.uid(),
  updated_at=clock_timestamp();

 for r in select id from wc_order_items where wc_cost_main(id)=id loop
  perform wc_calculate_material_item(r.id);
 end loop;
end $$;

revoke all on function public.wc_save_cart_material_profile(uuid,text,text,jsonb,boolean,timestamptz) from public,anon;
grant execute on function public.wc_save_cart_material_profile(uuid,text,text,jsonb,boolean,timestamptz) to authenticated;
