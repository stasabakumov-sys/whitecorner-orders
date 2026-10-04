-- Private Hub-only 3D model assets. The STEP drawing remains the CAD source;
-- browser-ready GLB files are stored separately from the public storefront.
create table public.wc_modeling_models (
  slug text primary key check (slug ~ '^[a-z0-9-]+$'),
  product_name text not null,
  material_name text not null,
  model_path text unique,
  model_filename text,
  model_bytes bigint check (model_bytes is null or model_bytes between 1 and 20971520),
  base_width_mm integer not null check (base_width_mm > 0),
  base_depth_mm integer not null check (base_depth_mm > 0),
  base_body_height_mm integer not null check (base_body_height_mm > 0),
  caster_height_mm integer not null check (caster_height_mm > 0),
  updated_at timestamptz not null default now(),
  constraint modeling_model_metadata_complete check (
    (model_path is null and model_filename is null and model_bytes is null) or
    (model_path is not null and model_filename is not null and model_bytes is not null)
  ),
  constraint modeling_model_path_scoped check (
    model_path is null or model_path ~ ('^' || slug || '/[0-9a-f-]{36}\.glb$')
  )
);

insert into public.wc_modeling_models
  (slug, product_name, material_name, base_width_mm, base_depth_mm, base_body_height_mm, caster_height_mm)
values ('classic-bar-plywood', 'Classic Bar', 'Plywood', 1200, 600, 805, 95);

alter table public.wc_modeling_models enable row level security;
revoke all on public.wc_modeling_models from public, anon, authenticated;
grant select on public.wc_modeling_models to authenticated;
grant update (model_path, model_filename, model_bytes, updated_at)
  on public.wc_modeling_models to authenticated;
grant all on public.wc_modeling_models to service_role;

create policy modeling_models_member_read on public.wc_modeling_models
  for select to authenticated using (public.wc_is_active_hub_member());
create policy modeling_models_manager_update on public.wc_modeling_models
  for update to authenticated
  using (public.wc_is_hub_manager())
  with check (
    public.wc_is_hub_manager() and model_path is not null and
    exists (
      select 1 from storage.objects
      where bucket_id = 'hub-modeling-models' and name = model_path
        and (metadata->>'size')::bigint = model_bytes
    )
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('hub-modeling-models', 'hub-modeling-models', false, 20971520,
  array['model/gltf-binary'])
on conflict (id) do update set public = false, file_size_limit = 20971520,
  allowed_mime_types = array['model/gltf-binary'];

create policy modeling_models_private_read on storage.objects for select to authenticated
  using (bucket_id = 'hub-modeling-models' and public.wc_is_active_hub_member());
create policy modeling_models_manager_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'hub-modeling-models' and public.wc_is_hub_manager()
    and name ~ '^classic-bar-plywood/[0-9a-f-]{36}\.glb$');
create policy modeling_models_manager_cleanup on storage.objects for delete to authenticated
  using (bucket_id = 'hub-modeling-models' and public.wc_is_hub_manager()
    and not exists (select 1 from public.wc_modeling_models where model_path = name));
