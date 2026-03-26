-- farm_members_select used "select ... from farm_members" inside its own USING clause,
-- which re-entered RLS on farm_members → infinite recursion.
-- Helper runs as definer (table owner) and bypasses RLS for this lookup only.

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

drop policy if exists "farm_members_select" on public.farm_members;
create policy "farm_members_select" on public.farm_members
  for select using (
    farm_id in (select public.current_user_farm_ids())
  );
