begin;

lock table supabase_migrations.schema_migrations in exclusive mode;

do $guard$
declare
 actual_versions text[];
begin
 select array_agg(version::text order by version)
 into actual_versions
 from supabase_migrations.schema_migrations;

 if actual_versions is distinct from array[
  '20260830000100','20260830000200','20260831000100','20260831000200',
  '20260831000300','20260901000200','20260903000100','20260903000200',
  '20260904000100','20260904193000','20260905000100','20260906000100',
  '20260907000100','20260907000200','20260907000300','20260907000400',
  '20260907000500','20260907000600','20260907000700','20260907000800'
 ]::text[] then
  raise exception 'Migration history differs from the audited production history';
 end if;

 if exists(select 1 from supabase_migrations.schema_migrations where version='20260901000100') then
  raise exception 'Email AI must remain pending';
 end if;
 if exists(select 1 from supabase_migrations.schema_migrations where version='20260908000100') then
  raise exception 'Material groups migration is already registered';
 end if;
 if to_regclass('public.wc_materials') is null
    or to_regprocedure('public.wc_save_material(uuid,text,text,numeric,boolean,timestamptz)') is null then
  raise exception 'Material costing prerequisite is missing';
 end if;
 if to_regclass('public.wc_material_groups') is not null
    or exists(select 1 from information_schema.columns where table_schema='public' and table_name='wc_materials' and column_name='group_id')
    or to_regprocedure('public.wc_save_material_group(text)') is not null
    or to_regprocedure('public.wc_save_material(uuid,text,text,numeric,boolean,timestamptz,uuid)') is not null then
  raise exception 'Material groups objects already exist without matching migration history';
 end if;
end $guard$;

-- Keep this DDL identical to supabase/migrations/20260908000100_material_groups.sql.
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

insert into supabase_migrations.schema_migrations(version,name,statements)
values(
 '20260908000100',
 'material_groups',
 array['Applied from the reviewed migration supabase/migrations/20260908000100_material_groups.sql']
);

do $verify$
begin
 if (select count(*) from public.wc_material_groups) <> 8 then raise exception 'Expected eight seeded material groups'; end if;
 if not exists(select 1 from supabase_migrations.schema_migrations where version='20260908000100') then raise exception 'Material groups migration was not registered'; end if;
 if exists(select 1 from supabase_migrations.schema_migrations where version='20260901000100') then raise exception 'Email AI was unexpectedly registered'; end if;
end $verify$;

commit;
