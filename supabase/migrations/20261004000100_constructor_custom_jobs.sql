-- Constructor saves one Custom job and its complete file set atomically.
alter table public.wc_custom_packing_drawings drop constraint wc_custom_packing_drawings_filename_check;
alter table public.wc_custom_packing_drawings add constraint wc_custom_packing_drawings_filename_check
 check(length(filename) between 5 and 255 and lower(filename) ~ '\.(cdr|svg)$');
create or replace function public.wc_save_custom_packing_drawing(
 p_job uuid,p_path text,p_filename text,p_bytes integer
) returns public.wc_custom_packing_drawings language plpgsql security definer
set search_path=public,pg_temp as $$
declare result public.wc_custom_packing_drawings;
begin
 if not public.wc_is_hub_manager() then raise exception 'Manager access required'; end if;
 perform 1 from public.wc_custom_packing_jobs where id=p_job for update;
 if not found then raise exception 'Custom job unavailable. Refresh and retry.'; end if;
 if p_filename is null or length(p_filename) not between 5 and 255 or lower(p_filename) !~ '\.(cdr|svg)$'
  or p_bytes is null or p_bytes not between 1 and 52428800
  or p_path is null or split_part(p_path,'/',1)<>auth.uid()::text
  or not exists(select 1 from storage.objects where bucket_id='custom-packing-drawings' and name=p_path
   and (metadata->>'size')::bigint=p_bytes) then
  raise exception 'Drawing upload is missing or invalid. Choose the file again.';
 end if;
 insert into public.wc_custom_packing_drawings(job_id,object_path,filename,size_bytes)
 values(p_job,p_path,p_filename,p_bytes) returning * into result;
 return result;
end $$;
revoke all on function public.wc_save_custom_packing_drawing(uuid,text,text,integer) from public,anon;
grant execute on function public.wc_save_custom_packing_drawing(uuid,text,text,integer) to authenticated;

create table public.wc_constructor_custom_saves (
 request_id uuid primary key,
 created_by uuid not null references public.wc_hub_members(user_id),
 job_id uuid not null references public.wc_custom_packing_jobs(id) on delete restrict,
 payload jsonb not null,
 result jsonb not null,
 created_at timestamptz not null default now()
);
alter table public.wc_constructor_custom_saves enable row level security;
revoke all on public.wc_constructor_custom_saves from public,anon,authenticated;

create function public.wc_create_constructor_custom_job(
 p_request uuid,p_title text,p_constructor jsonb,p_svg jsonb,p_rd_files jsonb
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare receipt public.wc_constructor_custom_saves; payload jsonb; result jsonb;
 job public.wc_custom_packing_jobs; drawing public.wc_custom_packing_drawings;
 file public.wc_custom_packing_rd_files; files jsonb:='[]'; entry jsonb;
 bottom jsonb; lid jsonb; l numeric; w numeric; d numeric;
begin
 if not public.wc_is_hub_manager() then raise exception 'Manager access required'; end if;
 if p_request is null then raise exception 'A save request is required'; end if;
 payload:=jsonb_build_object('title',p_title,'constructor',p_constructor,'svg',p_svg,'rd',p_rd_files);
 perform pg_advisory_xact_lock(hashtextextended('constructor-custom:'||p_request::text,0));
 select * into receipt from wc_constructor_custom_saves where request_id=p_request;
 if found then
  if receipt.created_by is distinct from auth.uid() or receipt.payload is distinct from payload then
   raise exception 'Save request changed. Retry the original confirmed request.';
  end if;
  return receipt.result;
 end if;
 bottom:=p_constructor->'bottom';lid:=p_constructor->'lid';
 if jsonb_typeof(bottom) is distinct from 'object' or jsonb_typeof(lid) is distinct from 'object'
  or jsonb_typeof(bottom->'length') is distinct from 'number' or jsonb_typeof(bottom->'width') is distinct from 'number'
  or jsonb_typeof(bottom->'depth') is distinct from 'number' then raise exception 'Valid box dimensions are required'; end if;
 l:=(bottom->>'length')::numeric;w:=(bottom->>'width')::numeric;d:=(bottom->>'depth')::numeric;
 if l<=0 or w<=0 or d<=0
  or lid is distinct from jsonb_build_object('length',l+10,'width',w+10,'depth',d)
  then raise exception 'Bottom and lid dimensions do not match'; end if;
 if jsonb_typeof(p_rd_files) is distinct from 'array' then raise exception 'Generate two RD files first'; end if;
 if jsonb_array_length(p_rd_files)<>2 or (p_rd_files->0->>'path') is not distinct from (p_rd_files->1->>'path')
  or lower(p_rd_files->0->>'filename') is not distinct from lower(p_rd_files->1->>'filename')
  then raise exception 'Two distinct RD files are required'; end if;
 if lower(p_svg->>'filename') not like '%.svg' or p_svg->>'filename' is null then raise exception 'SVG drawing is required'; end if;
 job:=public.wc_save_custom_packing_job(null,p_title,
  format('Card box. Bottom: %s × %s × %s mm. Lid: %s × %s × %s mm. Cut each RD twice. Join the two halves of each box with tape.',l,w,d,l+10,w+10,d),null);
 drawing:=public.wc_save_custom_packing_drawing(job.id,p_svg->>'path',p_svg->>'filename',(p_svg->>'bytes')::integer);
 for entry in select value from jsonb_array_elements(p_rd_files) loop
  file:=public.wc_save_custom_packing_rd_file(null,job.id,entry->>'path',entry->>'filename',(entry->>'bytes')::integer,2,null);
  files:=files||jsonb_build_array(to_jsonb(file));
 end loop;
 result:=jsonb_build_object('job',to_jsonb(job),'drawing',to_jsonb(drawing),'rd_files',files);
 insert into wc_constructor_custom_saves(request_id,created_by,job_id,payload,result) values(p_request,auth.uid(),job.id,payload,result);
 return result;
end $$;
revoke all on function public.wc_create_constructor_custom_job(uuid,text,jsonb,jsonb,jsonb) from public,anon;
grant execute on function public.wc_create_constructor_custom_job(uuid,text,jsonb,jsonb,jsonb) to authenticated;
