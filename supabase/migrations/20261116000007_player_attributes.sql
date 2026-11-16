-- =====================================================================
-- AUCTION IQ — keep every imported column
-- Columns from an organiser's sheet that don't map to a known field
-- (e.g. "Selected", "Set", "Remarks") are stored as extra attributes
-- instead of being discarded. Backward compatible.
-- =====================================================================
alter table public.players add column if not exists attributes jsonb not null default '{}'::jsonb;

-- Library imports carry the attributes over to the event copy.
create or replace function public.import_library_players(p_event uuid, p_ids uuid[]) returns int
language plpgsql security definer set search_path = public as $$
declare n int := 0; src record; v_new uuid;
begin
  if not public.can_manage_event(p_event) then raise exception 'Not authorized' using errcode = '42501'; end if;
  for src in select * from players where id = any (p_ids) and event_id is null loop
    if exists (select 1 from players where event_id = p_event and (library_player_id = src.id or name_key = src.name_key)) then continue; end if;
    insert into players (event_id, library_player_id, lot_number, name, photo_url, nationality, origin, category, secondary_category,
                         batting_style, bowling_style, base_price, special_abilities, attributes)
    values (p_event, src.id, src.lot_number, src.name, src.photo_url, src.nationality, src.origin, src.category, src.secondary_category,
            src.batting_style, src.bowling_style, src.base_price, src.special_abilities, src.attributes)
    returning id into v_new;
    insert into player_ratings (player_id, overall, batting, bowling, fielding, wicketkeeping, consistency, experience, source, updated_by)
    select v_new, overall, batting, bowling, fielding, wicketkeeping, consistency, experience, source, auth.uid()
      from player_ratings where player_id = src.id;
    n := n + 1;
  end loop;
  perform public.log_activity(p_event, 'players.imported_from_library', 'players', null, jsonb_build_object('count', n));
  return n;
end; $$;

revoke execute on function public.import_library_players(uuid, uuid[]) from public, anon;
grant execute on function public.import_library_players(uuid, uuid[]) to authenticated, service_role;
