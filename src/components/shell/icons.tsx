import {
  Activity, BarChart3, Bell, BookOpen, Calculator, ClipboardList, Crosshair, FileText, Gauge, Gavel, GitCompare,
  LayoutDashboard, ListChecks, NotebookPen, Radio, Scale, ScrollText, Settings, Shield, Sparkles, Star, Trophy, Users,
  UserSquare2, Wallet, FlaskConical, CalendarDays, Database, type LucideProps,
} from "lucide-react";

const map = {
  dashboard: LayoutDashboard, team: Shield, intel: Crosshair, live: Radio, players: Users, smartbid: Sparkles, purse: Wallet,
  simulator: FlaskConical, compare: GitCompare, leaderboard: Trophy, alerts: Bell, shortlist: Star, notes: NotebookPen,
  reports: FileText, gavel: Gavel, rules: Scale, members: UserSquare2, transactions: ScrollText, events: CalendarDays,
  settings: Settings, audit: Activity, templates: ClipboardList, database: Database, gauge: Gauge, calc: Calculator,
  book: BookOpen, chart: BarChart3, list: ListChecks,
} as const;
export type IconName = keyof typeof map;
export const NavIcon = ({ name, ...p }: { name: IconName } & LucideProps) => {
  const I = map[name];
  return <I {...p} />;
};
