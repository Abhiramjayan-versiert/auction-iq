import { CATEGORY_LABEL, STATUS_LABEL, type Category, type DataSource, type Origin, type SquadStatus } from "@/lib/engine";
import { Badge, type Tone } from "../ui/misc";

const statusTone: Record<SquadStatus, Tone> = { valid: "ok", incomplete: "warn", violation: "danger", at_risk: "danger" };
export const SquadStatusBadge = ({ status }: { status: SquadStatus }) => <Badge tone={statusTone[status]}>{STATUS_LABEL[status]}</Badge>;

const srcTone: Record<DataSource, Tone> = { official: "accent", participant: "info", estimated: "warn", unverified: "neutral" };
const srcLabel: Record<DataSource, string> = { official: "Official", participant: "Participant-entered", estimated: "Estimated", unverified: "Unverified" };
export const SourceBadge = ({ source }: { source: DataSource }) => <Badge tone={srcTone[source]}>{srcLabel[source]}</Badge>;

export const CategoryBadge = ({ category, origin }: { category: Category; origin?: Origin }) => (
  <Badge tone="neutral">
    {origin && <span className={origin === "overseas" ? "text-info" : "text-accent"}>{origin === "overseas" ? "OS" : "IN"}</span>}
    {CATEGORY_LABEL[category]}
  </Badge>
);

const auctionTone = { upcoming: "neutral", available: "accent", sold: "info", unsold: "warn", withdrawn: "danger" } as const;
export const AuctionStatusBadge = ({ status }: { status: keyof typeof auctionTone }) => <Badge tone={auctionTone[status]}>{status}</Badge>;

export const ConfidenceBadge = ({ c }: { c: "high" | "medium" | "low" }) => (
  <Badge tone={c === "high" ? "accent" : c === "medium" ? "warn" : "neutral"}>Confidence: {c}</Badge>
);
