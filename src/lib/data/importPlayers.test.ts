import { describe, expect, it } from "vitest";
import { normalisePlayerRows, parseCategory, parseOrigin } from "./importPlayers";

describe("player import", () => {
  it("maps loose headers and values", () => {
    const { players, errors } = normalisePlayerRows([
      { "Player Name": "A One", Role: "Wicket-keeper batsman", Country: "India", "Base Price": "₹2 Cr", Rating: "9.1" },
      { "Player Name": "B Two", Role: "All-rounder", Country: "Australia", "Base Price": "1.5", Rating: "" },
      { "Player Name": "C Three", Role: "Coach", Country: "India", "Base Price": "1" },
    ]);
    expect(errors).toHaveLength(1);
    expect(players[0]).toMatchObject({ name: "A One", category: "WK", origin: "indian", base_price: 2 });
    expect(players[0].ratings.overall).toBe(9.1);
    expect(players[1]).toMatchObject({ category: "AR", origin: "overseas" });
    expect(players[1].ratings.overall).toBeNull(); // never fabricated
  });
  it("parses categories and origins", () => {
    expect(parseCategory("BOWL")).toBe("BOWL");
    expect(parseCategory("Batter")).toBe("BAT");
    expect(parseOrigin("Overseas")).toBe("overseas");
    expect(parseOrigin("", "New Zealand")).toBe("overseas");
  });
});
