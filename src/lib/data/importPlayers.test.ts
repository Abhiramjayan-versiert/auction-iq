import { describe, expect, it } from "vitest";
import { applyPlan, normalisePlayerRows, parseCategory, parseOrigin, parsePlayerSheet } from "./importPlayers";

describe("player import", () => {
  it("imports a sheet that is just a list of names (no header)", () => {
    const r = parsePlayerSheet([["Virat Kohli"], ["Rohit Sharma"], ["Jasprit Bumrah"]]);
    expect(r.errors).toEqual([]);
    expect(r.players.map((p) => p.name)).toEqual(["Virat Kohli", "Rohit Sharma", "Jasprit Bumrah"]);
    expect(r.players[0]).toMatchObject({ category: null, origin: null, base_price: 0 });
    expect(r.players[0].ratings.overall).toBeNull();
  });

  it("reads names + ratings without a header", () => {
    const r = parsePlayerSheet([["Arun", 8.5], ["Bala", 9]]);
    expect(r.players[1]).toMatchObject({ name: "Bala" });
    expect(r.players[1].ratings.overall).toBe(9);
  });

  it("recognises loose headers like 'Player Names' and 'Base Price (Cr)'", () => {
    const r = parsePlayerSheet([
      ["S.No", "Player Names", "Rating", "Base Price (Cr)", "Role", "Country"],
      [1, "  Arun   Kumar ", 8.5, "₹2 Cr", "Wicket-keeper batsman", "India"],
      [2, "Ben", "", "", "Coach", "England"],
      [3, "arun kumar", 7, "", "", ""],
      [4, "", "", "", "", ""],
    ]);
    expect(r.headerDetected).toBe(true);
    expect(r.errors).toEqual([]);
    expect(r.players).toHaveLength(2); // duplicate (case/space-insensitive) skipped, blank row ignored
    expect(r.players[0]).toMatchObject({ name: "Arun Kumar", category: "WK", origin: "indian", base_price: 2, lot_number: null }); // S.No is a row serial
    expect(r.players[0].ratings.overall).toBe(8.5);
    expect(r.players[1]).toMatchObject({ name: "Ben", category: null, origin: "overseas" }); // unknown role kept blank, not rejected
    expect(r.warnings.join(" ")).toMatch(/duplicate/);
    expect(r.warnings.join(" ")).toMatch(/weren't recognised/);
  });

  it("handles the CET-style sheet: blank/unnamed number columns, POSITION, INDIAN OR FOREIGN, * markers, extras", () => {
    const sheet = [
      [null, null, "Unnamed: 0", "PLAYER", "POSITION", "INDIAN OR FOREIGN", "RATING", "BASE PRICE", "Unnamed: 5"],
      [null, 1, 5, "ALPHA ONE", "BATSMAN", "INDIAN", 8.7, 1, "Yes"],
      [null, 2, 8, "BRAVO TWO *", "BATSMAN", "FOREIGNER", 9.1, 1.5, "Yes"],
      [null, 3, 23, "CHARLIE THREE *", "ALL ROUNDER", "INDIAN", 13.5, 2.5, null],
      [null, 4, 41, "DELTA FOUR", "WICKETKEEPER", null, 15, 2, null],
      [null, 5, 41, "ECHO FIVE *", "BOWLER", null, 7.5, 0.5, null],
      [null, 76, null, null, null, null, null, null, null],
    ];
    const r = parsePlayerSheet(sheet);
    const f = Object.fromEntries(r.plan.columns.map((c) => [c.index, c.field]));
    expect(f).toMatchObject({ 1: "ignore", 2: "lot_number", 3: "name", 4: "category", 5: "origin", 6: "overall", 7: "base_price", 8: "extra" });
    expect(r.players).toHaveLength(5);
    expect(r.players[1]).toMatchObject({ name: "BRAVO TWO", origin: "overseas", lot_number: 8, base_price: 1.5, attributes: { "Column I": "Yes" } });
    expect(r.players[2]).toMatchObject({ name: "CHARLIE THREE", category: "AR", origin: "indian" });
    expect(r.players[4]).toMatchObject({ name: "ECHO FIVE", origin: "overseas", category: "BOWL" });
    expect(r.maxRating).toBe(15);
    const w = r.warnings.join(" ");
    expect(w).toMatch(/treated as overseas/);
    expect(w).toMatch(/listed as Indian.*CHARLIE THREE/);
    expect(w).toMatch(/more than once: 41/);
  });

  it("lets the organiser remap columns", () => {
    const sheet = [["Name", "Mystery"], ["A", "Bowler"], ["B", "Batsman"]];
    const r1 = parsePlayerSheet(sheet);
    const plan = { ...r1.plan, columns: r1.plan.columns.map((c) => (c.header === "Mystery" ? { ...c, field: "category" as const } : c)) };
    const r2 = applyPlan(sheet, plan);
    expect(r2.players[0].category).toBe("BOWL");
  });

  it("keeps the old row-object API working", () => {
    const { players, errors } = normalisePlayerRows([
      { "Player Name": "A One", Role: "Wicket-keeper batsman", Country: "India", "Base Price": "₹2 Cr", Rating: "9.1" },
      { "Player Name": "B Two", Role: "All-rounder", Country: "Australia", "Base Price": "1.5", Rating: "" },
    ]);
    expect(errors).toHaveLength(0);
    expect(players[0]).toMatchObject({ name: "A One", category: "WK", origin: "indian", base_price: 2 });
    expect(players[1].ratings.overall).toBeNull(); // never fabricated
  });

  it("parses categories and origins", () => {
    expect(parseCategory("BOWL")).toBe("BOWL");
    expect(parseCategory("Batter")).toBe("BAT");
    expect(parseOrigin("Overseas")).toBe("overseas");
    expect(parseOrigin("", "New Zealand")).toBe("overseas");
  });

  it("handles an empty sheet", () => {
    expect(parsePlayerSheet([]).errors[0]).toMatch(/empty/);
    expect(parsePlayerSheet([[null], [""]]).errors[0]).toMatch(/empty/);
  });
});
