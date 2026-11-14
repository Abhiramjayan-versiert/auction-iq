"use client";
import { PlayerAdmin } from "@/components/manage/PlayerAdmin";
import { useEventData } from "@/hooks/useEventData";

export default function EventPlayers() {
  const { event, playerRows, reload, rules } = useEventData();
  return <PlayerAdmin eventId={event!.id} rows={playerRows} onChanged={reload} currency={rules.currency} />;
}
