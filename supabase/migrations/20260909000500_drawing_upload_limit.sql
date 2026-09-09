-- Raise original drawing limits to 20 MiB without changing access policies.
update storage.buckets set file_size_limit=20971520 where id='box-drawings';
alter table public.wc_box_drawings drop constraint wc_box_drawings_size_bytes_check,
 add constraint wc_box_drawings_size_bytes_check check(size_bytes between 1 and 20971520);
alter table public.wc_backdrop_box_drawings drop constraint wc_backdrop_box_drawings_size_bytes_check,
 add constraint wc_backdrop_box_drawings_size_bytes_check check(size_bytes between 1 and 20971520);
alter table public.wc_product_drawings drop constraint wc_product_drawings_size_bytes_check,
 add constraint wc_product_drawings_size_bytes_check check(size_bytes between 1 and 20971520);
