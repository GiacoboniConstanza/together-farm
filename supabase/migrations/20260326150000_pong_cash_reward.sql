-- Pong minigame: grant cash into farms.game_state (FarmGame.cash) with cooldown and caps.

alter table public.farms
  add column if not exists last_pong_reward_at timestamptz;

create or replace function public.grant_pong_cash_reward(
  p_farm_id uuid,
  p_left_score int,
  p_right_score int,
  p_max_score int
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c_max constant int := 5;
  c_cooldown constant interval := interval '45 seconds';
  c_cap constant numeric := 25;
  v_gs jsonb;
  v_last timestamptz;
  v_cash numeric;
  v_granted numeric;
  v_new numeric;
  v_winner_left boolean;
  v_winner_right boolean;
begin
  if p_max_score <> c_max then
    raise exception 'bad_max_score';
  end if;

  if p_left_score < 0 or p_right_score < 0 then
    raise exception 'bad_scores';
  end if;

  if p_left_score > c_max or p_right_score > c_max then
    raise exception 'bad_scores';
  end if;

  v_winner_left := p_left_score = c_max and p_right_score < c_max;
  v_winner_right := p_right_score = c_max and p_left_score < c_max;

  if not (v_winner_left xor v_winner_right) then
    raise exception 'not_finished';
  end if;

  if not exists (
    select 1 from public.farm_members fm
    where fm.farm_id = p_farm_id and fm.user_id = auth.uid()
  ) then
    raise exception 'forbidden';
  end if;

  select game_state, last_pong_reward_at
  into v_gs, v_last
  from public.farms
  where id = p_farm_id
  for update;

  if not found then
    raise exception 'not_found';
  end if;

  if v_gs is null or jsonb_typeof(v_gs) <> 'object' then
    raise exception 'no_game_state';
  end if;

  if v_last is not null and now() - v_last < c_cooldown then
    raise exception 'pong_reward_cooldown';
  end if;

  -- base + sum of points + small winner bonus (already implied by scores; extra flat bonus)
  v_granted := 4::numeric + p_left_score::numeric + p_right_score::numeric + 3::numeric;
  if v_granted > c_cap then
    v_granted := c_cap;
  end if;

  v_cash := coalesce((v_gs->>'cash')::numeric, 100::numeric);
  v_new := v_cash + v_granted;

  update public.farms
  set
    game_state = jsonb_set(v_gs, '{cash}', to_jsonb(v_new), true),
    version = farms.version + 1,
    last_pong_reward_at = now(),
    updated_at = now()
  where id = p_farm_id;

  return jsonb_build_object(
    'granted_cash', v_granted,
    'new_cash', v_new
  );
end;
$$;

revoke all on function public.grant_pong_cash_reward(uuid, int, int, int) from public;
grant execute on function public.grant_pong_cash_reward(uuid, int, int, int) to authenticated;
