-- =====================================================================
-- AUCTION IQ — optional "maximum bid" rule
-- When enabled, a team may not spend more on one player than
--   remaining purse − (players still needed to reach the minimum squad
--                      after this purchase × minimum price per player)
-- so every team can always complete its squad. Off by default.
-- Minimum price per player = auction_rules.min_player_price, else the
-- cheapest recorded base price, else 0.
-- =====================================================================
alter table public.auction_rules add column if not exists enforce_max_bid boolean not null default false;

create or replace function public.team_max_bid(p_event uuid, p_team uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select case when f.remaining is null then null else
    greatest(0, f.remaining - greatest(0, r.squad_min - (f.players_count + 1)) * coalesce(
      r.min_player_price,
      (select min(base_price) from players p where p.event_id = p_event and p.base_price > 0 and p.auction_status <> 'withdrawn'),
      0))
  end
  from team_financials f join auction_rules r on r.event_id = f.event_id
  where f.team_id = p_team and f.event_id = p_event and public.is_event_member(p_event);
$$;

create or replace function public._record_sale(p_event uuid, p_player uuid, p_team uuid, p_amount numeric, p_note text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_player players; v_fin team_financials; v_rules auction_rules; v_tx uuid; c record; v_cnt int; v_max numeric; v_min_price numeric; v_need int;
begin
  select * into v_player from players where id = p_player and event_id = p_event for update;
  if not found then raise exception 'Player not in this event' using errcode = 'P0002'; end if;
  if v_player.auction_status = 'sold' then raise exception 'Player % is already sold', v_player.name using errcode = '23505'; end if;
  if v_player.auction_status = 'withdrawn' then raise exception 'Player % is withdrawn', v_player.name; end if;
  if p_amount is null or p_amount < v_player.base_price then
    raise exception 'Winning bid % is below base price %', p_amount, v_player.base_price;
  end if;
  select * into v_fin from team_financials where team_id = p_team and event_id = p_event for update;
  if not found then raise exception 'Team not in this event' using errcode = 'P0002'; end if;
  select * into v_rules from auction_rules where event_id = p_event;
  if not v_rules.allow_overspend and v_fin.remaining is not null and v_fin.remaining < p_amount then
    raise exception 'Insufficient purse: remaining %, bid %', v_fin.remaining, p_amount using errcode = '23514';
  end if;
  if v_rules.enforce_max_bid and v_fin.remaining is not null then
    v_need := greatest(0, v_rules.squad_min - (v_fin.players_count + 1));
    v_min_price := coalesce(v_rules.min_player_price,
      (select min(base_price) from players p where p.event_id = p_event and p.base_price > 0 and p.auction_status <> 'withdrawn'), 0);
    v_max := greatest(0, v_fin.remaining - v_need * v_min_price);
    if p_amount > v_max then
      raise exception 'Bid % is above this team''s maximum bid % (it must keep % for % more player(s))', p_amount, v_max, v_need * v_min_price, v_need
        using errcode = '23514';
    end if;
  end if;
  if v_fin.players_count + 1 > v_rules.squad_max then
    raise exception 'Squad is full (max %)', v_rules.squad_max using errcode = '23514';
  end if;
  if v_rules.enforce_max_constraints and v_player.category is not null and v_player.origin is not null then
    for c in select * from rule_constraints rc where rc.event_id = p_event and rc.max_count is not null
               and (rc.category is null or rc.category = v_player.category) and (rc.origin is null or rc.origin = v_player.origin) loop
      select count(*) into v_cnt from team_rosters tr join players p on p.id = tr.player_id
       where tr.team_id = p_team and (c.category is null or p.category = c.category) and (c.origin is null or p.origin = c.origin);
      if v_cnt + 1 > c.max_count then
        raise exception 'Sale would exceed rule "%" (max %)', c.label, c.max_count using errcode = '23514';
      end if;
    end loop;
  end if;
  update auction_transactions set status = 'voided', voided_at = now(), voided_by = auth.uid(), voided_reason = 're-auctioned'
   where player_id = p_player and status = 'active' and type = 'unsold';
  insert into auction_transactions (event_id, player_id, team_id, amount, type, note, created_by)
  values (p_event, p_player, p_team, p_amount, 'sale', p_note, auth.uid()) returning id into v_tx;
  insert into team_rosters (player_id, event_id, team_id, transaction_id, price) values (p_player, p_event, p_team, v_tx, p_amount);
  update players set auction_status = 'sold', sold_team_id = p_team, sold_price = p_amount where id = p_player;
  perform public.recompute_team(p_team);
  update auction_sessions set last_transaction_id = v_tx, bidding_open = false, current_bid = p_amount,
         current_bid_team_id = p_team, updated_at = now() where event_id = p_event;
  perform public.log_activity(p_event, 'transaction.sale', 'auction_transaction', v_tx::text,
    jsonb_build_object('player', v_player.name, 'team', p_team, 'amount', p_amount));
  return v_tx;
end; $$;

-- save_event_rules learns the new flag
create or replace function public.save_event_rules(p_event uuid, p_rules jsonb, p_constraints jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare c jsonb; i int := 0;
begin
  if not public.can_edit_rules(p_event) then raise exception 'Not authorized to edit rules' using errcode = '42501'; end if;
  update auction_rules set
    squad_min = coalesce((p_rules ->> 'squad_min')::int, squad_min),
    squad_max = coalesce((p_rules ->> 'squad_max')::int, squad_max),
    min_player_price = case when p_rules ? 'min_player_price' then nullif(p_rules ->> 'min_player_price', '')::numeric else min_player_price end,
    bid_increment = coalesce((p_rules ->> 'bid_increment')::numeric, bid_increment),
    require_complete_squad = coalesce((p_rules ->> 'require_complete_squad')::boolean, require_complete_squad),
    enforce_max_constraints = coalesce((p_rules ->> 'enforce_max_constraints')::boolean, enforce_max_constraints),
    enforce_max_bid = coalesce((p_rules ->> 'enforce_max_bid')::boolean, enforce_max_bid),
    allow_overspend = coalesce((p_rules ->> 'allow_overspend')::boolean, allow_overspend),
    ranking_formula = coalesce(p_rules ->> 'ranking_formula', ranking_formula),
    weights = coalesce(p_rules -> 'weights', weights),
    rating_scale_max = coalesce((p_rules ->> 'rating_scale_max')::numeric, rating_scale_max),
    updated_by = auth.uid()
  where event_id = p_event;
  if p_constraints is not null and jsonb_typeof(p_constraints) = 'array' then
    delete from rule_constraints where event_id = p_event;
    for c in select * from jsonb_array_elements(p_constraints) loop
      insert into rule_constraints (event_id, label, category, origin, min_count, max_count, sort)
      values (p_event, c ->> 'label', nullif(c ->> 'category', ''), nullif(c ->> 'origin', ''),
              nullif(c ->> 'min', '')::int, nullif(c ->> 'max', '')::int, i);
      i := i + 1;
    end loop;
  end if;
  perform public.log_activity(p_event, 'rules.updated', 'auction_rules', p_event::text, jsonb_build_object('rules', p_rules, 'constraints', p_constraints));
end; $$;

revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;
revoke execute on function public.promote_super_admin(text) from public, anon, authenticated;
revoke execute on function public._record_sale(uuid, uuid, uuid, numeric, text) from public, anon, authenticated;
revoke execute on function public._void_transaction(uuid, text) from public, anon, authenticated;
revoke execute on function public.recompute_team(uuid) from public, anon, authenticated;
revoke execute on function public.log_activity(uuid, text, text, text, jsonb) from public, anon, authenticated;
