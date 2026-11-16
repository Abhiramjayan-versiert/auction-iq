import { describe, expect, it } from "vitest";
import { normalisePlayerRows, parseCategory, parseOrigin, parsePlayerSheet } from "./importPlayers";

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
    expect(r.players[0]).toMatchObject({ name: "Arun Kumar", category: "WK", origin: "indian", base_price: 2, lot_number: 1 });
    expect(r.players[0].ratings.overall).toBe(8.5);
    expect(r.players[1]).toMatchObject({ name: "Ben", category: null, origin: "overseas" }); // unknown role kept blank, not rejected
    expect(r.warnings.join(" ")).toMatch(/duplicate/);
    expect(r.warnings.join(" ")).toMatch(/weren't recognised/);
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
