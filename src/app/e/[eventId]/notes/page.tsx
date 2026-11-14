"use client";
import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input, Select, Textarea } from "@/components/ui/form";
import { Badge, Empty, PageHeader } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { useEventData } from "@/hooks/useEventData";
import { useWorkspace } from "@/hooks/useWorkspace";
import type { NoteRow } from "@/lib/types/db";
import { fmtDate } from "@/lib/utils";

export default function Notes() {
  const { players, teams, playerById } = useEventData();
  const { notes, saveNote, deleteNote } = useWorkspace();
  const [draft, setDraft] = useState<Partial<NoteRow>>({ body: "" });
  const [q, setQ] = useState("");
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.body?.trim()) return;
    await saveNote({ ...draft, body: draft.body.trim() });
    setDraft({ body: "" });
  };
  const list = notes.filter((n) => !q || (n.body + (n.title ?? "")).toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="space-y-4">
      <PageHeader title="My notes" description="Strategy notes, predictions and observations — private to you." />
      <Card className="p-4">
        <form onSubmit={save} className="grid gap-2 md:grid-cols-3">
          <Input placeholder="Title (optional)" value={draft.title ?? ""} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
          <Select value={draft.player_id ?? ""} onChange={(e) => setDraft({ ...draft, player_id: e.target.value || null })}>
            <option value="">Link to player (optional)</option>
            {players.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
          <Select value={draft.team_id ?? ""} onChange={(e) => setDraft({ ...draft, team_id: e.target.value || null })}>
            <option value="">Link to team (optional)</option>
            {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Select>
          <Textarea className="md:col-span-3" placeholder="Write a note…" value={draft.body ?? ""} onChange={(e) => setDraft({ ...draft, body: e.target.value })} />
          <div className="md:col-span-3 flex justify-end gap-2">
            {draft.id && <Button type="button" variant="ghost" onClick={() => setDraft({ body: "" })}>Cancel edit</Button>}
            <Button>{draft.id ? "Update note" : "Save note"}</Button>
          </div>
        </form>
      </Card>
      <Input className="max-w-xs" placeholder="Search notes…" value={q} onChange={(e) => setQ(e.target.value)} />
      {list.length === 0 ? <Empty title="No notes yet" /> : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {list.map((n) => (
            <Card key={n.id} className="p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="text-sm font-medium">{n.title || "Note"}</div>
                <div className="flex gap-2 text-faint">
                  <button onClick={() => setDraft(n)} className="hover:text-fg cursor-pointer" aria-label="Edit"><Pencil size={13} /></button>
                  <button onClick={() => deleteNote(n.id)} className="hover:text-danger cursor-pointer" aria-label="Delete"><Trash2 size={13} /></button>
                </div>
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm text-muted">{n.body}</p>
              <div className="mt-2 flex flex-wrap gap-1 text-[10px] text-faint">
                {n.player_id && <Badge>{playerById[n.player_id]?.name}</Badge>}
                {n.team_id && <Badge>{teams.find((t) => t.id === n.team_id)?.name}</Badge>}
                <span className="ml-auto">{fmtDate(n.updated_at)}</span>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
