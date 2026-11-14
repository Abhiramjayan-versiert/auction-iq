-- =====================================================================
-- AUCTION IQ — Row Level Security
-- Participants: read their event's official data, write only private rows.
-- Auctioneers: manage only assigned events (official writes via RPCs).
-- Super Admin: whole platform.
-- =====================================================================
do $$ declare t text; begin
  foreach t in array array['profiles','role_permissions','platform_settings','organizations','rule_templates','events',
    'event_members','teams','team_members','player_categories','players','player_ratings','auction_rules','rule_constraints',
    'auction_sessions','auction_transactions','team_rosters','team_financials','team_scores','private_participant_workspaces',
    'private_notes','player_shortlists','simulated_transactions','competitor_observations','notifications','activity_logs'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

-- profiles
create policy profiles_select on public.profiles for select to authenticated using (
  id = auth.uid() or public.is_super_admin()
  or exists (select 1 from public.event_members em where em.user_id = profiles.id and public.can_manage_event(em.event_id))
);
create policy profiles_update_self on public.profiles for update to authenticated using (id = auth.uid() or public.is_super_admin())
  with check (id = auth.uid() or public.is_super_admin());
create policy profiles_admin_delete on public.profiles for delete to authenticated using (public.is_super_admin());

-- reference / platform tables
create policy rp_read on public.role_permissions for select to authenticated using (true);
create policy rp_admin on public.role_permissions for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());
create policy ps_read on public.platform_settings for select to authenticated using (true);
create policy ps_admin on public.platform_settings for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());
create policy cat_read on public.player_categories for select to authenticated using (true);
create policy cat_admin on public.player_categories for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());
create policy org_read on public.organizations for select to authenticated using (true);
create policy org_admin on public.organizations for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());
create policy tpl_read on public.rule_templates for select to authenticated using (public.is_auctioneer_user());
create policy tpl_admin on public.rule_templates for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());

-- events: public active events are discoverable; unlisted ones only by members.
create policy events_select on public.events for select to authenticated using (
  public.is_super_admin() or public.is_event_member(id) or (visibility = 'public' and is_active and status <> 'archived')
);
create policy events_admin on public.events for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());

-- event_members
create policy em_select on public.event_members for select to authenticated using (user_id = auth.uid() or public.can_manage_event(event_id));
create policy em_manage on public.event_members for update to authenticated using (public.can_manage_event(event_id)) with check (public.can_manage_event(event_id));
create policy em_delete on public.event_members for delete to authenticated using (public.can_manage_event(event_id) or user_id = auth.uid());

-- teams & ownership
create policy teams_select on public.teams for select to authenticated using (public.is_event_member(event_id));
create policy teams_manage on public.teams for all to authenticated using (public.can_manage_event(event_id)) with check (public.can_manage_event(event_id));
create policy tm_select on public.team_members for select to authenticated using (public.is_event_member(event_id));
create policy tm_manage on public.team_members for all to authenticated using (public.can_manage_event(event_id)) with check (public.can_manage_event(event_id));

-- players: library (event_id null) is visible to auctioneers/admins; event players to event members.
create policy players_select on public.players for select to authenticated using (
  (event_id is null and public.is_auctioneer_user()) or (event_id is not null and public.is_event_member(event_id))
);
create policy players_manage on public.players for all to authenticated using (
  (event_id is null and public.is_super_admin()) or (event_id is not null and public.can_manage_event(event_id))
) with check (
  (event_id is null and public.is_super_admin()) or (event_id is not null and public.can_manage_event(event_id))
);
create policy ratings_select on public.player_ratings for select to authenticated using (
  exists (select 1 from public.players p where p.id = player_id and
    ((p.event_id is null and public.is_auctioneer_user()) or (p.event_id is not null and public.is_event_member(p.event_id))))
);
create policy ratings_manage on public.player_ratings for all to authenticated using (
  exists (select 1 from public.players p where p.id = player_id and
    ((p.event_id is null and public.is_super_admin()) or (p.event_id is not null and public.can_manage_event(p.event_id))))
) with check (
  exists (select 1 from public.players p where p.id = player_id and
    ((p.event_id is null and public.is_super_admin()) or (p.event_id is not null and public.can_manage_event(p.event_id))))
);

-- rules (writes through save_event_rules, which checks can_edit_rules)
create policy rules_select on public.auction_rules for select to authenticated using (public.is_event_member(event_id));
create policy constraints_select on public.rule_constraints for select to authenticated using (public.is_event_member(event_id));

-- official auction state: read-only for members; written only by security-definer RPCs.
create policy session_select on public.auction_sessions for select to authenticated using (public.is_event_member(event_id));
create policy tx_select on public.auction_transactions for select to authenticated using (public.is_event_member(event_id));
create policy rosters_select on public.team_rosters for select to authenticated using (public.is_event_member(event_id));
create policy fin_select on public.team_financials for select to authenticated using (public.is_event_member(event_id));
create policy scores_select on public.team_scores for select to authenticated using (public.is_event_member(event_id));

-- private participant data: owner only (Super Admin may inspect read-only).
create policy ws_owner on public.private_participant_workspaces for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.is_event_member(event_id));
create policy ws_admin_read on public.private_participant_workspaces for select to authenticated using (public.is_super_admin());
create policy notes_owner on public.private_notes for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.is_event_member(event_id));
create policy notes_admin_read on public.private_notes for select to authenticated using (public.is_super_admin());
create policy sl_owner on public.player_shortlists for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.is_event_member(event_id));
create policy sl_admin_read on public.player_shortlists for select to authenticated using (public.is_super_admin());
create policy sim_owner on public.simulated_transactions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.is_event_member(event_id));
create policy sim_admin_read on public.simulated_transactions for select to authenticated using (public.is_super_admin());
create policy obs_owner on public.competitor_observations for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.is_event_member(event_id));
create policy obs_admin_read on public.competitor_observations for select to authenticated using (public.is_super_admin());

-- notifications
create policy notif_select on public.notifications for select to authenticated using (
  user_id = auth.uid()
  or (user_id is null and event_id is not null and public.is_event_member(event_id))
  or (user_id is null and event_id is null)
  or public.is_super_admin()
);
create policy notif_insert on public.notifications for insert to authenticated with check (
  (user_id = auth.uid() and (event_id is null or public.is_event_member(event_id)))
  or (user_id is null and event_id is not null and public.can_manage_event(event_id))
  or public.is_super_admin()
);
create policy notif_update on public.notifications for update to authenticated using (user_id = auth.uid() or public.is_super_admin())
  with check (user_id = auth.uid() or public.is_super_admin());
create policy notif_delete on public.notifications for delete to authenticated using (user_id = auth.uid() or public.is_super_admin());

-- audit logs: admins see all, auctioneers see their events. Inserts only via log_activity().
create policy logs_select on public.activity_logs for select to authenticated using (
  public.is_super_admin() or (event_id is not null and public.can_manage_event(event_id))
);

-- ---------------------------------------------------------------------
-- Realtime (Supabase). RLS applies to postgres_changes subscriptions.
-- ---------------------------------------------------------------------
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.auction_transactions, public.auction_sessions, public.players,
      public.team_financials, public.notifications, public.teams, public.event_members, public.team_members;
  end if;
end $$;
