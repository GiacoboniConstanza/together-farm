-- Nombre opcional de la granja (listado legible)
alter table public.farms
  add column if not exists name text not null default '';

alter table public.farms
  drop constraint if exists farms_name_len;

alter table public.farms
  add constraint farms_name_len check (char_length(name) <= 60);

-- Renombrar (cualquier miembro)
create or replace function public.set_farm_name(p_farm_id uuid, p_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trimmed text;
begin
  v_trimmed := trim(coalesce(p_name, ''));
  if char_length(v_trimmed) > 60 then
    raise exception 'name_too_long';
  end if;

  if not exists (
    select 1 from public.farm_members fm
    where fm.farm_id = p_farm_id and fm.user_id = auth.uid()
  ) then
    raise exception 'forbidden';
  end if;

  update public.farms
  set name = v_trimmed
  where id = p_farm_id;
end;
$$;

revoke all on function public.set_farm_name(uuid, text) from public;
grant execute on function public.set_farm_name(uuid, text) to authenticated;
grant execute on function public.set_farm_name(uuid, text) to service_role;

-- Borrar granja (solo quien la creó; cascada limpia miembros, mascota, etc.)
create or replace function public.delete_farm(p_farm_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.farms f
    where f.id = p_farm_id and f.created_by = auth.uid()
  ) then
    raise exception 'forbidden';
  end if;

  delete from public.farms where id = p_farm_id;
end;
$$;

revoke all on function public.delete_farm(uuid) from public;
grant execute on function public.delete_farm(uuid) to authenticated;
grant execute on function public.delete_farm(uuid) to service_role;

-- Abandonar granja (invitado: deja de ser miembro; el creador debe usar delete_farm)
create or replace function public.leave_farm(p_farm_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.farms f
    where f.id = p_farm_id and f.created_by = auth.uid()
  ) then
    raise exception 'creator_must_delete';
  end if;

  if not exists (
    select 1 from public.farm_members fm
    where fm.farm_id = p_farm_id and fm.user_id = auth.uid()
  ) then
    raise exception 'forbidden';
  end if;

  delete from public.farm_members
  where farm_id = p_farm_id and user_id = auth.uid();
end;
$$;

revoke all on function public.leave_farm(uuid) from public;
grant execute on function public.leave_farm(uuid) to authenticated;
grant execute on function public.leave_farm(uuid) to service_role;
