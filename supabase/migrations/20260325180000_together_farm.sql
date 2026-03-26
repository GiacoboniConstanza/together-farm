-- Together Farm — schema, RLS, RPC, Realtime
-- Apply in Supabase SQL editor or: supabase db push

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.farms (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users (id) on delete cascade,
  version int not null default 0,
  game_state jsonb,
  corn_count int not null default 0,
  potato_count int not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.farm_members (
  farm_id uuid not null references public.farms (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  primary key (farm_id, user_id)
);

create index if not exists farm_members_user_id_idx on public.farm_members (user_id);

create table if not exists public.invites (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms (id) on delete cascade,
  token text not null unique,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.pets (
  farm_id uuid primary key references public.farms (id) on delete cascade,
  hunger real not null default 45,
  cleanliness real not null default 55,
  energy real not null default 50,
  sleep_until timestamptz,
  last_tick_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

create or replace function public.farms_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists farms_updated_at on public.farms;
create trigger farms_updated_at
  before update on public.farms
  for each row execute function public.farms_set_updated_at();

create or replace function public.enforce_max_two_farm_members()
returns trigger language plpgsql as $$
begin
  if (select count(*) from public.farm_members where farm_id = new.farm_id) >= 2 then
    raise exception 'farm_member_limit' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists farm_members_limit on public.farm_members;
create trigger farm_members_limit
  before insert on public.farm_members
  for each row execute function public.enforce_max_two_farm_members();

-- ---------------------------------------------------------------------------
-- RLS helpers (must not query farm_members inside farm_members policies — recursion)
-- ---------------------------------------------------------------------------

create or replace function public.current_user_farm_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select farm_id from public.farm_members where user_id = auth.uid();
$$;

revoke all on function public.current_user_farm_ids() from public;
grant execute on function public.current_user_farm_ids() to authenticated;
grant execute on function public.current_user_farm_ids() to service_role;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.farms enable row level security;
alter table public.farm_members enable row level security;
alter table public.invites enable row level security;
alter table public.pets enable row level security;

drop policy if exists "farms_select_member" on public.farms;
create policy "farms_select_member" on public.farms
  for select using (
    exists (
      select 1 from public.farm_members fm
      where fm.farm_id = farms.id and fm.user_id = auth.uid()
    )
  );

drop policy if exists "farms_update_member" on public.farms;
create policy "farms_update_member" on public.farms
  for update using (
    exists (
      select 1 from public.farm_members fm
      where fm.farm_id = farms.id and fm.user_id = auth.uid()
    )
  );

drop policy if exists "farm_members_select" on public.farm_members;
create policy "farm_members_select" on public.farm_members
  for select using (
    farm_id in (select public.current_user_farm_ids())
  );

drop policy if exists "pets_select_member" on public.pets;
create policy "pets_select_member" on public.pets
  for select using (
    exists (
      select 1 from public.farm_members fm
      where fm.farm_id = pets.farm_id and fm.user_id = auth.uid()
    )
  );

drop policy if exists "pets_update_member" on public.pets;
create policy "pets_update_member" on public.pets
  for update using (
    exists (
      select 1 from public.farm_members fm
      where fm.farm_id = pets.farm_id and fm.user_id = auth.uid()
    )
  );

-- invites: no user-facing policies (RPC only)

-- ---------------------------------------------------------------------------
-- RPC (SECURITY DEFINER)
-- ---------------------------------------------------------------------------

create or replace function public.create_farm()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.farms (created_by)
  values (auth.uid())
  returning id into v_id;

  insert into public.farm_members (farm_id, user_id)
  values (v_id, auth.uid());

  insert into public.pets (farm_id)
  values (v_id);

  return v_id;
end;
$$;

grant execute on function public.create_farm() to authenticated;

create or replace function public.create_invite(p_farm_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text;
begin
  if not exists (
    select 1 from public.farm_members
    where farm_id = p_farm_id and user_id = auth.uid()
  ) then
    raise exception 'forbidden';
  end if;

  if (select count(*) from public.farm_members where farm_id = p_farm_id) >= 2 then
    raise exception 'farm_full';
  end if;

  v_token := replace(
    gen_random_uuid()::text || gen_random_uuid()::text,
    '-',
    ''
  );

  insert into public.invites (farm_id, token, expires_at)
  values (p_farm_id, v_token, now() + interval '7 days');

  return v_token;
end;
$$;

grant execute on function public.create_invite(uuid) to authenticated;

create or replace function public.accept_invite(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv public.invites%rowtype;
begin
  select * into v_inv from public.invites
  where token = p_token
  for update;

  if not found then
    raise exception 'invalid_token';
  end if;

  if v_inv.consumed_at is not null then
    raise exception 'already_used';
  end if;

  if v_inv.expires_at < now() then
    raise exception 'expired';
  end if;

  if exists (select 1 from public.farm_members where user_id = auth.uid() and farm_id = v_inv.farm_id) then
    update public.invites set consumed_at = now() where id = v_inv.id;
    return v_inv.farm_id;
  end if;

  if (select count(*) from public.farm_members where farm_id = v_inv.farm_id) >= 2 then
    raise exception 'farm_full';
  end if;

  insert into public.farm_members (farm_id, user_id)
  values (v_inv.farm_id, auth.uid());

  update public.invites set consumed_at = now() where id = v_inv.id;

  return v_inv.farm_id;
end;
$$;

grant execute on function public.accept_invite(text) to authenticated;

create or replace function public.save_farm_state(
  p_farm_id uuid,
  p_expected_version int,
  p_game_state jsonb
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new int;
begin
  update public.farms
  set
    game_state = p_game_state,
    version = farms.version + 1,
    updated_at = now()
  where id = p_farm_id
    and version = p_expected_version
    and exists (
      select 1 from public.farm_members fm
      where fm.farm_id = farms.id and fm.user_id = auth.uid()
    );

  if not found then
    raise exception 'version_mismatch_or_forbidden' using errcode = 'P0001';
  end if;

  select version into v_new from public.farms where id = p_farm_id;
  return v_new;
end;
$$;

grant execute on function public.save_farm_state(uuid, int, jsonb) to authenticated;

create or replace function public.commit_harvest(
  p_farm_id uuid,
  p_expected_version int,
  p_x int,
  p_y int,
  p_new_game_state jsonb,
  p_crop_type text
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gs jsonb;
  v_ver int;
  v_cell_old jsonb;
  v_cell_new jsonb;
  v_amt numeric;
  v_type text;
begin
  if p_crop_type not in ('Corn', 'Potato') then
    raise exception 'bad_crop_type';
  end if;

  select game_state, version into v_gs, v_ver
  from public.farms
  where id = p_farm_id
  for update;

  if not found then
    raise exception 'not_found';
  end if;

  if not exists (
    select 1 from public.farm_members fm
    where fm.farm_id = p_farm_id and fm.user_id = auth.uid()
  ) then
    raise exception 'forbidden';
  end if;

  if v_ver <> p_expected_version then
    raise exception 'version_mismatch';
  end if;

  v_cell_old := v_gs #> array['cells', p_x::text, p_y::text];

  if v_cell_old is null or (v_cell_old ? 'crop') is false or v_cell_old->'crop' is null then
    raise exception 'bad_cell';
  end if;

  v_type := v_cell_old->'crop'->>'type';
  if v_type is distinct from p_crop_type then
    raise exception 'crop_mismatch';
  end if;

  v_amt := coalesce((v_cell_old->'crop'->>'amount')::numeric, 0);
  if v_amt <= 1 then
    raise exception 'not_harvestable';
  end if;

  v_cell_new := p_new_game_state #> array['cells', p_x::text, p_y::text];
  if v_cell_new is null then
    raise exception 'bad_new_state';
  end if;
  if (v_cell_new ? 'crop') and v_cell_new->'crop' is not null then
    raise exception 'crop_still_present';
  end if;

  update public.farms
  set
    game_state = p_new_game_state,
    version = farms.version + 1,
    corn_count = corn_count + case when p_crop_type = 'Corn' then 1 else 0 end,
    potato_count = potato_count + case when p_crop_type = 'Potato' then 1 else 0 end,
    updated_at = now()
  where id = p_farm_id;

  return (select version from public.farms where id = p_farm_id);
end;
$$;

grant execute on function public.commit_harvest(uuid, int, int, int, jsonb, text) to authenticated;

create or replace function public._pet_apply_tick(p_farm_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.pets%rowtype;
  hrs double precision;
  sleeping boolean;
begin
  select * into p from public.pets where farm_id = p_farm_id for update;
  if not found then
    return;
  end if;

  hrs := greatest(0, extract(epoch from (now() - p.last_tick_at)) / 3600.0);
  sleeping := p.sleep_until is not null and p.sleep_until > now();

  update public.pets
  set
    hunger = least(100::real, p.hunger + (hrs * 4)::real),
    cleanliness = greatest(0::real, p.cleanliness - (hrs * 2.5)::real),
    energy = case
      when sleeping then least(100::real, p.energy + (hrs * 15)::real)
      else greatest(0::real, p.energy - (hrs * 3)::real)
    end,
    last_tick_at = now()
  where farm_id = p_farm_id;
end;
$$;

create or replace function public.pet_tick(p_farm_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.farm_members fm
    where fm.farm_id = p_farm_id and fm.user_id = auth.uid()
  ) then
    raise exception 'forbidden';
  end if;
  perform public._pet_apply_tick(p_farm_id);
end;
$$;

grant execute on function public.pet_tick(uuid) to authenticated;

create or replace function public.pet_feed(p_farm_id uuid, p_crop text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  f public.farms%rowtype;
begin
  if p_crop not in ('corn', 'potato') then
    raise exception 'bad_crop';
  end if;

  if not exists (
    select 1 from public.farm_members fm
    where fm.farm_id = p_farm_id and fm.user_id = auth.uid()
  ) then
    raise exception 'forbidden';
  end if;

  perform public._pet_apply_tick(p_farm_id);

  select * into f from public.farms where id = p_farm_id for update;

  if p_crop = 'corn' then
    if f.corn_count < 1 then
      raise exception 'no_corn';
    end if;
    update public.farms set corn_count = corn_count - 1 where id = p_farm_id;
  else
    if f.potato_count < 1 then
      raise exception 'no_potato';
    end if;
    update public.farms set potato_count = potato_count - 1 where id = p_farm_id;
  end if;

  update public.pets
  set hunger = least(100::real, hunger + 28::real)
  where farm_id = p_farm_id;
end;
$$;

grant execute on function public.pet_feed(uuid, text) to authenticated;

create or replace function public.pet_bathe(p_farm_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.farm_members fm
    where fm.farm_id = p_farm_id and fm.user_id = auth.uid()
  ) then
    raise exception 'forbidden';
  end if;

  perform public._pet_apply_tick(p_farm_id);

  update public.pets
  set cleanliness = 100::real
  where farm_id = p_farm_id;
end;
$$;

grant execute on function public.pet_bathe(uuid) to authenticated;

create or replace function public.pet_sleep(p_farm_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.farm_members fm
    where fm.farm_id = p_farm_id and fm.user_id = auth.uid()
  ) then
    raise exception 'forbidden';
  end if;

  perform public._pet_apply_tick(p_farm_id);

  update public.pets
  set
    sleep_until = now() + interval '45 minutes',
    energy = least(100::real, energy + 12::real)
  where farm_id = p_farm_id;
end;
$$;

grant execute on function public.pet_sleep(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Realtime (hosted Supabase)
-- ---------------------------------------------------------------------------

do $$
begin
  alter publication supabase_realtime add table public.farms;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.pets;
exception
  when duplicate_object then null;
end $$;
