select json_build_object(
 'migration_registered',exists(select 1 from supabase_migrations.schema_migrations where version='20260908000100'),
 'email_ai_registered',exists(select 1 from supabase_migrations.schema_migrations where version='20260901000100'),
 'groups_table',to_regclass('public.wc_material_groups')::text,
 'group_column',exists(select 1 from information_schema.columns where table_schema='public' and table_name='wc_materials' and column_name='group_id'),
 'save_group_rpc',to_regprocedure('public.wc_save_material_group(text)')::text,
 'grouped_save_rpc',to_regprocedure('public.wc_save_material(uuid,text,text,numeric,boolean,timestamptz,uuid)')::text,
 'group_names',(select json_agg(name order by name) from public.wc_material_groups),
 'material_count',(select count(*) from public.wc_materials),
 'assigned_material_count',(select count(*) from public.wc_materials where group_id is not null)
) as material_groups_verification;
