"use client";
import { useState } from "react";
import { fmtPct, fmtRating, type Player } from "@/lib/engine";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader, Stat } from "@/components/ui/misc";
import { RuleAlerts } from "@/components/domain/alerts";
import { SquadStatusBadge } from "@/components/domain/badges";
import { StrengthRadar } from "@/components/domain/charts";
import { TeamChip } from "@/components/domain/team";
import { CompositionGrid, ConstraintList, PlayerDialog, RosterTable, useMoney } from "@/components/participant/shared";
import { useMyTeam } from "@/components/participant/NeedTeam";
import { useEventData } from "@/hooks/useEventData";

export default function MyTeam() {
  const { me, prompt } = useMyTeam();
  const { rules } = useEventData();
  const m = useMoney();
  const [sel, setSel] = useState<Player | null>(null);
  if (!me) return prompt;
  const r = me.rating;
  return (
    <div className="space-y-4">
      <PageHeader title={<TeamChip team={me.team} />} description="Your official roster, finances and strength — recalculated after every sale." actions={<SquadStatusBadge status={me.rules.status} />} />
      <Card>
        <CardHeader title="Financial summary" />
        <CardBody className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-7">
          <Stat label="Initial purse" value={m(me.initialPurse)} />
          <Stat label="Remaining" value={m(me.remaining)} tone="accent" />
          <Stat label="Expenditure" value={m(me.spent)} />
          <Stat label="Avg purchase" value={m(me.avgPrice)} />
          <Stat label="Highest" value={m(me.maxPrice)} />
          <Stat label="Lowest" value={m(me.minPrice)} />
          <Stat label="Utilisation" value={fmtPct(me.utilization, 1)} />
        </CardBody>
      </Card>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Team composition" description={`${me.rating.count} squad members · ${me.indianCount} Indian · ${me.overseasCount} overseas`} />
          <CardBody><CompositionGrid team={me} /></CardBody>
        </Card>
        <Card>
          <CardHeader title="Rule requirements" />
          <CardBody><ConstraintList team={me} /></CardBody>
        </Card>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader title="Team strength" description={`Official formula: ${rules.ranking_formula}`} />
          <CardBody className="grid grid-cols-2 gap-2">
            <Stat label="Overall avg" value={fmtRating(r.average)} tone="accent" />
            <Stat label="Weighted (analytical)" value={fmtRating(r.weighted)} />
            <Stat label="Batting" value={fmtRating(r.batting)} />
            <Stat label="Bowling" value={fmtRating(r.bowling)} />
            <Stat label="All-rounders" value={fmtRating(r.allrounder)} />
            <Stat label="Fielding" value={fmtRating(r.fielding)} />
            <Stat label="Keeping" value={fmtRating(r.wicketkeeping)} />
            <Stat label="Balance score" value={`${r.balance.toFixed(0)}/100`} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Strength profile" />
          <CardBody><StrengthRadar teams={[{ name: me.team.short_name || me.team.name, rating: r }]} scale={rules.rating_scale_max} /></CardBody>
        </Card>
        <Card>
          <CardHeader title="Alerts" />
          <CardBody><RuleAlerts alerts={me.rules.alerts} /></CardBody>
        </Card>
      </div>
      <Card>
        <CardHeader title="Roster" description="Click a player to add private notes." />
        <RosterTable team={me} onPlayer={setSel} />
      </Card>
      <PlayerDialog player={sel} onClose={() => setSel(null)} />
    </div>
  );
}
