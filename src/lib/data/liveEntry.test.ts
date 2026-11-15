import { describe, expect, it } from "vitest";
import { checkName, emptyDraft, parsePastedRows, resolveTeam, validateDraft } from "./liveEntry";

const teams = [
  { id: "t1", name: "Mumbai Indians", short_name: "MI" },
  { id: "t2", name: "Chennai Super Kings", short_name: "CSK" },
  { id: "t3", name: "Chennai Strikers", short_name: "CST" },
];
const players = [
  { id: "p1", name: "Virat Sharma", auction_status: "sold", sold_team_id: "t1", sold_price: 12 },
  { id: "p2", name: "Late Bloomer", auction_status: "unsold" },
];

describe("live entry helpers", () => {
  it("resolves teams by short name, prefix and ambiguity", () => {
    expect(resolveTeam("mi", teams)?.id).toBe("t1");
    expect(resolveTeam("Mumbai", teams)?.id).toBe("t1");
    expect(resolveTeam("Chennai", teams)).toBeNull(); // ambiguous
    expect(resolveTeam("csk", teams)?.id).toBe("t2");
  });
  it("detects duplicates and near-duplicates", () => {
    expect(checkName("virat  sharma", players).kind).toBe("sold");
    expect(checkName("Late Bloomer", players).kind).toBe("existing");
    expect(checkName("Virat Sharmaa", players).kind).toBe("similar");
    expect(checkName("Brand New", players).kind).toBe("new");
  });
  it("validates the four essential fields", () => {
    const ok = validateDraft({ ...emptyDraft(), name: "New Guy", rating: "8.5", team: "t1", price: "4" }, { scale: 10, players });
    expect(ok.errors).toEqual([]);
    expect(ok.payload).toMatchObject({ p_name: "New Guy", p_rating: 8.5, p_team: "t1", p_amount: 4, p_status: "sold", p_category: null });
    const bad = validateDraft({ ...emptyDraft(), name: "Virat Sharma", rating: "12", team: "", price: "-1" }, { scale: 10, players });
    expect(bad.errors.length).toBe(4);
    const unsold = validateDraft({ ...emptyDraft(), name: "Someone", status: "unsold" }, { scale: 10, players });
    expect(unsold.payload?.p_team).toBeNull();
  });
  it("parses rows pasted from Excel with or without headers", () => {
    const noHeader = parsePastedRows("Arun Kumar\t8.5\tMI\t3.25\nBen Stokes\t9.1\tCSK\t₹12 Cr\nNobody\t7\tunsold\t", teams);
    expect(noHeader).toHaveLength(3);
    expect(noHeader[0].draft).toMatchObject({ name: "Arun Kumar", rating: "8.5", team: "t1", price: "3.25", status: "sold" });
    expect(noHeader[1].draft.price).toBe("12");
    expect(noHeader[2].draft.status).toBe("unsold");
    const withHeader = parsePastedRows("Sold Price\tPlayer\tTeam\tRating\tRole\n5\tAmy\tMumbai Indians\t8\tBowler", teams);
    expect(withHeader[0].draft).toMatchObject({ name: "Amy", price: "5", team: "t1", rating: "8", category: "BOWL" });
  });
});
