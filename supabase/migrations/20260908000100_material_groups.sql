-- Extensible material grouping. Existing materials and calculated snapshots remain unchanged.
create table public.wc_material_groups (
 id uuid primary key default gen_random_uuid(),
 name text not null check(length(trim(name)) between 1 and 100),
 active boolean not null default true,
 created_by uuid,
 created_at timestamptz not null default now()
);
create unique index wc_material_groups_name_unique on public.wc_material_groups(lower(trim(name)));

insert into public.wc_material_groups(name)
values ('Radiata Ply'),('Birch Ply'),('Hinges'),('MDF'),('Moulding'),('DAR pine'),('DAR primed'),('Castors');

alter table public.wc_materials
 add column group_id uuid references public.wc_material_groups(id) on delete restrict;
create index wc_materials_group_idx on public.wc_materials(group_id);

create function public.wc_save_material_group(p_name text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor uuid:=auth.uid(); result wc_material_groups;
begin
 if actor is null then raise exception 'Authentication required';end if;
 if p_name is null or length(trim(p_name)) not between 1 and 100 then raise exception 'Enter a group name';end if;
 insert into wc_material_groups(name,created_by) values(trim(p_name),actor)
 returning * into result;
 return to_jsonb(result);
exception when unique_violation then raise exception 'A material group with this name already exists';
end $$;

-- Seven-argument version used by the grouped Materials screen. The existing six-argument
-- function remains available during deployment so the current production UI stays compatible.
create function public.wc_save_material(p_id uuid,p_name text,p_unit text,p_price numeric,p_active boolean,p_expected timestamptz,p_group_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor uuid:=auth.uid(); m wc_materials; old_price numeric; r record;
begin
 if actor is null then raise exception 'Authentication required';end if;
 if not exists(select 1 from wc_material_groups where id=p_group_id and active) then raise exception 'Choose an active material group';end if;
 perform pg_advisory_xact_lock(20260907,8);
 if p_id is not null then
  select * into m from wc_materials where id=p_id for update;
  if not found or m.updated_at is distinct from p_expected then raise exception 'Material changed; refresh';end if;
  if m.unit<>p_unit then raise exception 'Unit cannot change; create a new material';end if;
  old_price=m.price_gst;
  update wc_materials set name=trim(p_name),price_gst=p_price,active=p_active,group_id=p_group_id,updated_at=clock_timestamp()
  where id=p_id returning * into m;
 else
  insert into wc_materials(name,unit,price_gst,active,group_id) values(trim(p_name),p_unit,p_price,p_active,p_group_id) returning * into m;
 end if;
 if p_id is null or old_price is distinct from m.price_gst then
  insert into wc_material_prices(material_id,price_gst,actor) values(m.id,m.price_gst,actor);
 end if;
 for r in select distinct item_id from wc_product_costs where state<>'calculated' loop perform wc_calculate_material_item(r.item_id);end loop;
 return to_jsonb(m);
end $$;

alter table public.wc_material_groups enable row level security;
create policy material_groups_read on public.wc_material_groups for select to authenticated using(true);
revoke all on public.wc_material_groups from public,anon,authenticated;
grant select on public.wc_material_groups to authenticated;
revoke all on function public.wc_save_material_group(text),public.wc_save_material(uuid,text,text,numeric,boolean,timestamptz,uuid) from public,anon;
grant execute on function public.wc_save_material_group(text),public.wc_save_material(uuid,text,text,numeric,boolean,timestamptz,uuid) to authenticated;
