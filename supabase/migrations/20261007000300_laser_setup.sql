-- Hub-owned defaults for new RD exports. Existing files and work are unchanged.
create function public.wc_laser_setup_valid(p jsonb) returns boolean
language plpgsql immutable set search_path=public as $$
declare layer text;field text;value numeric;
begin
 if p is null or jsonb_typeof(p)<>'object' then return false;end if;
 foreach layer in array array['cut','dot'] loop
  if jsonb_typeof(p->layer) is distinct from 'object' then return false;end if;
  foreach field in array array['speed','minPower','maxPower'] loop
   if jsonb_typeof(p->layer->field) is distinct from 'number' then return false;end if;
   value=(p->layer->>field)::numeric;
   if field='speed' then if value<=0 or value>1000 then return false;end if;
   elsif value<0 or value>100 then return false;end if;
  end loop;
  if (p->layer->>'minPower')::numeric>(p->layer->>'maxPower')::numeric then return false;end if;
 end loop;
 foreach field in array array['dotTime','dotInterval','dotLength'] loop
  if jsonb_typeof(p->field) is distinct from 'number' then return false;end if;
  value=(p->>field)::numeric;
  if field='dotTime' then if value<=0 or value>60 then return false;end if;
  elsif value<0.1 or value>10000 then return false;end if;
 end loop;
 return (p->>'dotLength')::numeric<(p->>'dotInterval')::numeric;
end $$;
revoke all on function public.wc_laser_setup_valid(jsonb) from public,anon,authenticated;

create table public.wc_laser_setup (
 id boolean primary key default true check(id),
 settings jsonb not null check(public.wc_laser_setup_valid(settings)),
 revision uuid not null default gen_random_uuid(),
 updated_at timestamptz not null default now(),
 updated_by uuid references auth.users(id)
);
insert into public.wc_laser_setup(settings) values (
 '{"cut":{"speed":120,"minPower":70,"maxPower":80},"dot":{"speed":120,"minPower":70,"maxPower":80},"dotTime":0.2,"dotInterval":4,"dotLength":2}'::jsonb
);
alter table public.wc_laser_setup enable row level security;
revoke all on public.wc_laser_setup from public,anon,authenticated;
grant select on public.wc_laser_setup to authenticated;
create policy laser_setup_read on public.wc_laser_setup for select to authenticated using (
 exists(select 1 from public.wc_hub_members where user_id=auth.uid() and active)
);

create function public.wc_save_laser_setup(p_settings jsonb,p_expected uuid)
returns public.wc_laser_setup language plpgsql security definer set search_path=public as $$
declare saved public.wc_laser_setup;
begin
 if not public.wc_is_hub_manager() then raise exception 'Manager access required';end if;
 if not public.wc_laser_setup_valid(p_settings) then raise exception 'Invalid laser settings. Check speed, power and Dot spacing.';end if;
 select * into saved from public.wc_laser_setup where id for update;
 if not found then raise exception 'Laser setup is missing. Reload and retry.';end if;
 -- Recover an identical retry after a lost response without overwriting a newer edit.
 if saved.settings=p_settings then return saved;end if;
 if saved.revision is distinct from p_expected then raise exception 'Laser setup changed. Cancel and reload before editing.';end if;
 update public.wc_laser_setup set settings=p_settings,revision=gen_random_uuid(),updated_at=clock_timestamp(),updated_by=auth.uid() where id returning * into saved;
 return saved;
end $$;
revoke all on function public.wc_save_laser_setup(jsonb,uuid) from public,anon,authenticated;
grant execute on function public.wc_save_laser_setup(jsonb,uuid) to authenticated;
