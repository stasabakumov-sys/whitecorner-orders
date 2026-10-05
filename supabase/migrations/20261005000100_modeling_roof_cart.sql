-- Register a second private editor model. STEP/GLB assets stay in private Storage.
insert into public.wc_modeling_models
  (slug, product_name, material_name, base_width_mm, base_depth_mm, base_body_height_mm, caster_height_mm)
values ('decorative-wheel-roof-cart-mdf', 'Cart with decorative wheels & roof', 'MDF', 1200, 600, 827, 73);

-- Allow managers to upload only beneath an existing model's slug. Read access
-- remains restricted to active Hub members; the bucket remains private.
drop policy modeling_models_manager_upload on storage.objects;
create policy modeling_models_manager_upload on storage.objects for insert to authenticated
  with check (
    bucket_id = 'hub-modeling-models' and public.wc_is_hub_manager()
    and name ~ '^[a-z0-9-]+/[0-9a-f-]{36}\.glb$'
    and exists (select 1 from public.wc_modeling_models where slug = split_part(name, '/', 1))
  );
