-- Product planning materials for Backdrops are scoped by size and folding option.
-- Existing order cost snapshots and exact order-variant profiles remain unchanged.
create function public.wc_save_backdrop_material_profile(p_product uuid,p_size text,p_folding text,p_lines jsonb,p_confirmed boolean,p_expected timestamptz)
returns void language plpgsql security definer set search_path=public as $$
declare profile_key text;prior timestamptz;v_product_name text;options jsonb;
begin
 if auth.uid() is null then raise exception 'Authentication required';end if;
 if p_size is null or p_size !~ '^[1-9][0-9]{0,4}x[1-9][0-9]{0,4}$' or split_part(p_size,'x',1)::int<split_part(p_size,'x',2)::int or split_part(p_size,'x',1)::int>10000 then raise exception 'Choose a valid product size';end if;
 if p_folding is null or p_folding not in ('foldable','nonfoldable') then raise exception 'Choose Foldable or Non-foldable';end if;
 select p.product_name into v_product_name from wc_shipping_products p where p.id=p_product and p.product_name ~* 'backdrop';
 if v_product_name is null then raise exception 'Backdrop product not found';end if;
 if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines)>100 then raise exception 'Invalid materials';end if;
 if exists(select 1 from jsonb_array_elements(p_lines) l where (l->>'quantity')::numeric is null or (l->>'quantity')::numeric<=0 or (l->>'quantity')::numeric>100000 or not exists(select 1 from wc_materials where id=(l->>'material_id')::uuid and active)) then raise exception 'Invalid material quantity';end if;
 if (select count(*) from jsonb_array_elements(p_lines))<>(select count(distinct l->>'material_id') from jsonb_array_elements(p_lines) l) then raise exception 'Duplicate materials';end if;
 profile_key=jsonb_build_array('backdrop-structure-v1',p_product,p_size,p_folding)::text;
 perform pg_advisory_xact_lock(hashtextextended(profile_key,0));
 select updated_at into prior from wc_material_profiles where variant_key=profile_key;
 if prior is distinct from p_expected then raise exception 'Profile changed; refresh';end if;
 options=jsonb_build_object('Size',split_part(p_size,'x',1)::numeric/10||'cm x '||split_part(p_size,'x',2)::numeric/10||'cm','Foldable',case when p_folding='foldable' then 'YES' else 'NO' end);
 insert into wc_material_profiles(variant_key,product_name,options,lines,updated_by,shipping_product_id,template_item,work_costs,pans_cost_gst,materials_confirmed,costing_version)
 values(profile_key,v_product_name,options,p_lines,auth.uid(),p_product,jsonb_build_object('profile_scope','backdrop-structure','kind','main','multiplier',1,'size_key',p_size,'folding',p_folding,'options',options,'standard_top_excluded',false),'{}',0,coalesce(p_confirmed,false),2)
 on conflict(variant_key) do update set lines=excluded.lines,materials_confirmed=excluded.materials_confirmed,updated_by=auth.uid(),updated_at=clock_timestamp();
end $$;
revoke all on function public.wc_save_backdrop_material_profile(uuid,text,text,jsonb,boolean,timestamptz) from public,anon;
grant execute on function public.wc_save_backdrop_material_profile(uuid,text,text,jsonb,boolean,timestamptz) to authenticated;
