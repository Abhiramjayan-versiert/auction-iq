import {
  CATEGORIES,
  CATEGORY_LABEL,
  ORIGINS,
  type Category,
  type Constraint,
  type Origin,
  type Player,
  type RuleSet,
} from "./types";

export type Cell = `${Origin}:${Category}`;
export const ALL_CELLS: Cell[] = ORIGINS.flatMap((o) => CATEGORIES.map((c) => `${o}:${c}` as Cell));

export const cellOf = (p: Pick<Player, "origin" | "category">): Cell => `${p.origin}:${p.category}`;
export const parseCell = (cell: Cell) => {
  const [origin, category] = cell.split(":") as [Origin, Category];
  return { origin, category };
};
export const cellLabel = (cell: Cell | "ANY") => {
  if (cell === "ANY") return "Any player";
  const { origin, category } = parseCell(cell);
  return `${origin === "indian" ? "Indian" : "Overseas"} ${CATEGORY_LABEL[category].toLowerCase()}`;
};

export const constraintMatches = (c: Constraint, cell: Cell) => {
  const { origin, category } = parseCell(cell);
  return (c.category === null || c.category === category) && (c.origin === null || c.origin === origin);
};

export type ConstraintState = "satisfied" | "incomplete" | "violation";

export interface ConstraintStatus {
  constraint: Constraint;
  count: number;
  state: ConstraintState;
  need: number; // players still required to hit min
  room: number | null; // players that can still be added before max (null = unlimited)
}

export type SquadStatus = "valid" | "incomplete" | "violation" | "at_risk";

export interface Alert {
  level: "critical" | "red" | "yellow" | "info";
  kind: "violation" | "incomplete" | "future" | "purse" | "valid";
  message: string;
}

export interface RuleEvaluation {
  size: number;
  cellCounts: Record<Cell, number>;
  statuses: ConstraintStatus[];
  /** Cells the team must still fill to meet every minimum (greedy minimal plan). */
  mandatoryPlan: Cell[];
  /** Extra slots needed only to reach squad_min (any category that is still allowed). */
  flexSlots: number;
  /** mandatoryPlan.length + flexSlots */
  slotsRequired: number;
  /** squad_max - size */
  slotsRemaining: number;
  feasible: boolean;
  complete: boolean;
  hasViolation: boolean;
  status: SquadStatus;
  alerts: Alert[];
}

const emptyCounts = () => Object.fromEntries(ALL_CELLS.map((c) => [c, 0])) as Record<Cell, number>;

export function countCells(players: Pick<Player, "origin" | "category">[]) {
  const counts = emptyCounts();
  for (const p of players) counts[cellOf(p)]++;
  return counts;
}

const sumFor = (c: Constraint, counts: Record<Cell, number>) =>
  ALL_CELLS.reduce((s, cell) => (constraintMatches(c, cell) ? s + counts[cell] : s), 0);

/** Can one more player of `cell` be added without breaking a maximum? */
export function cellAllowed(rules: RuleSet, counts: Record<Cell, number>, cell: Cell) {
  const size = ALL_CELLS.reduce((s, c) => s + counts[c], 0);
  if (size + 1 > rules.squad_max) return { ok: false, reason: `Squad is full (${rules.squad_max} players).` };
  for (const c of rules.constraints) {
    if (c.max !== null && constraintMatches(c, cell) && sumFor(c, counts) + 1 > c.max) {
      return { ok: false, reason: `Would exceed "${c.label}" (max ${c.max}).` };
    }
  }
  return { ok: true as const, reason: null };
}

/**
 * Greedy minimal fill plan: repeatedly add the cell that reduces the most
 * outstanding minimum requirements without breaking any maximum.
 */
function planFill(rules: RuleSet, start: Record<Cell, number>) {
  const counts = { ...start };
  const plan: Cell[] = [];
  const guard = rules.squad_max + 50;
  while (plan.length < guard) {
    const deficits = rules.constraints.filter((c) => c.min !== null && sumFor(c, counts) < (c.min as number));
    if (!deficits.length) break;
    let best: Cell | null = null;
    let bestScore = 0;
    for (const cell of ALL_CELLS) {
      if (!cellAllowed(rules, counts, cell).ok) continue;
      let score = 0;
      for (const d of deficits) if (constraintMatches(d, cell)) score += 1 + 1 / (1 + countCellsMatching(d));
      if (score > bestScore) {
        bestScore = score;
        best = cell;
      }
    }
    if (!best) return { plan, counts, feasible: false };
    plan.push(best);
    counts[best]++;
  }
  return { plan, counts, feasible: true };
}

const countCellsMatching = (c: Constraint) => ALL_CELLS.filter((cell) => constraintMatches(c, cell)).length;

export function evaluateRules(rules: RuleSet, players: Pick<Player, "origin" | "category">[]): RuleEvaluation {
  const counts = countCells(players);
  const size = players.length;
  const statuses: ConstraintStatus[] = rules.constraints.map((c) => {
    const count = sumFor(c, counts);
    const over = c.max !== null && count > c.max;
    const under = c.min !== null && count < c.min;
    return {
      constraint: c,
      count,
      state: over ? "violation" : under ? "incomplete" : "satisfied",
      need: c.min !== null ? Math.max(0, c.min - count) : 0,
      room: c.max !== null ? Math.max(0, c.max - count) : null,
    };
  });

  const { plan, counts: after, feasible: planFeasible } = planFill(rules, counts);
  const afterSize = size + plan.length;
  let flexSlots = Math.max(0, rules.squad_min - afterSize);
  // make sure flex slots can actually be placed somewhere
  let flexFeasible = true;
  if (flexSlots > 0) {
    const tmp = { ...after };
    for (let i = 0; i < flexSlots; i++) {
      const cell = ALL_CELLS.find((c) => cellAllowed(rules, tmp, c).ok);
      if (!cell) {
        flexFeasible = false;
        break;
      }
      tmp[cell]++;
    }
  }
  const slotsRequired = plan.length + flexSlots;
  const slotsRemaining = Math.max(0, rules.squad_max - size);
  const hasViolation = statuses.some((s) => s.state === "violation") || size > rules.squad_max;
  const feasible = planFeasible && flexFeasible && !hasViolation && size + slotsRequired <= rules.squad_max;
  const complete = !hasViolation && slotsRequired === 0 && size >= rules.squad_min;

  const alerts: Alert[] = [];
  for (const s of statuses) {
    if (s.state === "violation") {
      alerts.push({
        level: "red",
        kind: "violation",
        message: `Exceeded "${s.constraint.label}" limit: ${s.count} / max ${s.constraint.max}.`,
      });
    } else if (s.state === "incomplete") {
      alerts.push({
        level: "yellow",
        kind: "incomplete",
        message: `Still requires ${s.need} more for "${s.constraint.label}" (${s.count}/${s.constraint.min}).`,
      });
    }
  }
  if (size > rules.squad_max) {
    alerts.push({ level: "red", kind: "violation", message: `Squad size ${size} exceeds maximum ${rules.squad_max}.` });
  }
  if (!hasViolation && !feasible) {
    alerts.push({
      level: "red",
      kind: "future",
      message: "Remaining requirements can no longer be met within the squad limits.",
    });
  } else if (!hasViolation && slotsRequired > 0 && slotsRequired === slotsRemaining) {
    alerts.push({
      level: "yellow",
      kind: "future",
      message: `Every remaining slot (${slotsRemaining}) is now mandatory — no room for discretionary picks.`,
    });
  }
  if (complete) alerts.push({ level: "info", kind: "valid", message: "Squad is complete and valid." });
  // potential future violation: a max that is exactly reached
  for (const s of statuses) {
    if (s.state === "satisfied" && s.room === 0 && s.constraint.max !== null) {
      alerts.push({
        level: "info",
        kind: "future",
        message: `"${s.constraint.label}" is at its maximum (${s.constraint.max}). Another such player would be a violation.`,
      });
    }
  }

  const status: SquadStatus = hasViolation ? "violation" : !feasible ? "at_risk" : complete ? "valid" : "incomplete";
  return {
    size,
    cellCounts: counts,
    statuses,
    mandatoryPlan: plan,
    flexSlots,
    slotsRequired,
    slotsRemaining,
    feasible,
    complete,
    hasViolation,
    status,
    alerts,
  };
}

export const STATUS_LABEL: Record<SquadStatus, string> = {
  valid: "Valid squad",
  incomplete: "Incomplete",
  violation: "Rule violation",
  at_risk: "At risk",
};
