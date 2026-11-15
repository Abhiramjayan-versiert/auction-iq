"use client";
import { forwardRef, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { resolveTeam, type TeamLite } from "@/lib/data/liveEntry";

/** Searchable team picker: type a few letters or a short name; ↑↓ to choose, Enter/Tab to accept. */
export const TeamCombobox = forwardRef<HTMLInputElement, {
  teams: (TeamLite & { remaining?: string })[];
  value: string;
  onChange: (id: string) => void;
  onEnter?: () => void;
  placeholder?: string;
  className?: string;
}>(function TeamCombobox({ teams, value, onChange, onEnter, placeholder, className }, ref) {
  const selected = teams.find((t) => t.id === value);
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const shown = selected && !open ? selected.short_name ? `${selected.name} (${selected.short_name})` : selected.name : text;
  const matches = useMemo(() => {
    const k = text.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!k) return teams;
    return teams.filter((t) => `${t.name} ${t.short_name ?? ""}`.toLowerCase().replace(/[^a-z0-9 ]/g, "").split(" ").some((w) => w.startsWith(k)) || t.name.toLowerCase().replace(/[^a-z0-9]/g, "").includes(k));
  }, [text, teams]);
  const pick = (t: TeamLite | undefined) => {
    if (!t) return;
    onChange(t.id);
    setText("");
    setOpen(false);
  };
  return (
    <div className="relative">
      <input
        ref={ref}
        value={shown}
        placeholder={placeholder ?? "Team"}
        onFocus={() => {
          setOpen(true);
          setText("");
          setHi(0);
        }}
        onBlur={() => {
          setTimeout(() => setOpen(false), 120);
          if (text) pick(resolveTeam(text, teams) ?? (matches.length === 1 ? matches[0] : undefined));
        }}
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
          setHi(0);
          if (value) onChange("");
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setHi((h) => Math.min(h + 1, matches.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHi((h) => Math.max(h - 1, 0));
          } else if (e.key === "Enter") {
            if (open && text) {
              e.preventDefault();
              pick(matches[hi]);
            } else onEnter?.();
          } else if (e.key === "Tab" && open && text && matches[hi]) {
            pick(matches[hi]);
          } else if (e.key === "Escape") setOpen(false);
        }}
        className={cn("h-10 w-full rounded-md border border-line bg-surface-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40", value && "border-accent/50", className)}
        aria-label="Winning team"
        role="combobox"
        aria-expanded={open}
        aria-controls="aiq-team-listbox"
      />
      {open && matches.length > 0 && (
        <ul className="absolute z-30 mt-1 max-h-64 w-full min-w-56 overflow-y-auto rounded-md border border-line bg-surface-2 py-1 shadow-xl" role="listbox" id="aiq-team-listbox">
          {matches.map((t, i) => (
            <li
              key={t.id}
              role="option"
              aria-selected={i === hi}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(t);
              }}
              className={cn("flex cursor-pointer justify-between gap-2 px-3 py-1.5 text-sm", i === hi ? "bg-accent/15 text-fg" : "text-muted hover:bg-surface-3")}
            >
              <span className="truncate">{t.name}{t.short_name ? <span className="ml-1 text-faint">{t.short_name}</span> : null}</span>
              {t.remaining && <span className="tabular text-xs text-faint">{t.remaining}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
});
