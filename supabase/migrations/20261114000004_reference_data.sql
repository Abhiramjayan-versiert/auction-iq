-- Reference data needed by every installation (no player data is fabricated here).
insert into public.player_categories (code, label, sort) values
  ('BAT', 'Batsman', 1), ('BOWL', 'Bowler', 2), ('AR', 'All-rounder', 3), ('WK', 'Wicketkeeper', 4)
on conflict (code) do nothing;

insert into public.role_permissions (role, permission) values
  ('super_admin', 'platform.manage'), ('super_admin', 'users.manage'), ('super_admin', 'events.manage'),
  ('super_admin', 'players.library.manage'), ('super_admin', 'templates.manage'), ('super_admin', 'audit.read'),
  ('auctioneer', 'events.assigned.manage'), ('auctioneer', 'auction.conduct'), ('auctioneer', 'players.event.manage'),
  ('auctioneer', 'reports.generate'),
  ('participant', 'workspace.private'), ('participant', 'event.join'), ('participant', 'analytics.view')
on conflict do nothing;

insert into public.platform_settings (key, value) values
  ('default_rules', '{"squad_min": 9, "squad_max": 9, "bid_increment": 0.25, "ranking_formula": "average", "require_complete_squad": true}'),
  ('default_purse', '100'),
  ('registration_open', 'true'),
  ('auctioneer_signup_requires_approval', 'true')
on conflict (key) do nothing;

insert into public.rule_templates (name, description, config) values
  ('9-player management fest format',
   'Exactly 2 Indian batsmen, 1 overseas batsman, 2 Indian bowlers, 2 overseas bowlers, at least 1 Indian all-rounder and 1 wicketkeeper.',
   '{"rules": {"squad_min": 9, "squad_max": 9, "bid_increment": 0.25, "ranking_formula": "average", "require_complete_squad": true},
     "constraints": [
       {"label": "Indian batsmen", "category": "BAT", "origin": "indian", "min": 2, "max": 2},
       {"label": "Overseas batsmen", "category": "BAT", "origin": "overseas", "min": 1, "max": 1},
       {"label": "Indian bowlers", "category": "BOWL", "origin": "indian", "min": 2, "max": 2},
       {"label": "Overseas bowlers", "category": "BOWL", "origin": "overseas", "min": 2, "max": 2},
       {"label": "Indian all-rounders", "category": "AR", "origin": "indian", "min": 1, "max": null},
       {"label": "Wicketkeepers", "category": "WK", "origin": null, "min": 1, "max": null}
     ]}'),
  ('IPL-style 18–25 squad',
   'Squad of 18–25 with at most 8 overseas players and balanced minimums.',
   '{"rules": {"squad_min": 18, "squad_max": 25, "bid_increment": 0.25, "ranking_formula": "average", "require_complete_squad": true},
     "constraints": [
       {"label": "Overseas players", "category": null, "origin": "overseas", "min": null, "max": 8},
       {"label": "Batsmen", "category": "BAT", "origin": null, "min": 5, "max": null},
       {"label": "Bowlers", "category": "BOWL", "origin": null, "min": 5, "max": null},
       {"label": "All-rounders", "category": "AR", "origin": null, "min": 3, "max": null},
       {"label": "Wicketkeepers", "category": "WK", "origin": null, "min": 2, "max": null}
     ]}');
