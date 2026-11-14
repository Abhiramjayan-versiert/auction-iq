import { describe, expect, it } from "vitest";
import { matchResultRows } from "./importResults";

describe("results import", () => {
  const players = [
    { id: "p1", name: "Arun Kumar", auction_status: "upcoming" },
    { id: "p2", name: "Sold Guy", auction_status: "sold" },
  ];
  const teams = [{ id: "t1", name: "Mumbai Indians", short_name: "MI" }];
  it("matches players and teams loosely and flags problems", () => {
    const rows = matchResultRows(
      [
        { Player: "arun kumar", "Sold To": "MI", Price: "₹12 Cr" },
        { Player: "Sold Guy", Team: "Mumbai Indians", Price: 3 },
        { Player: "New Star", Team: "Mumbai Indians", Price: 5, Role: "Bowler", Origin: "Overseas", Rating: 9.1 },
        { Player: "Ghost", Team: "Mumbai Indians", Price: 5 },
        { Player: "Arun Kumar", Team: "Nowhere", Price: 1 },
        { Player: "Unwanted", Team: "UNSOLD", Price: "", Role: "BAT", Origin: "Indian" },
      ],
      players,
      teams,
    );
    expect(rows[0]).toMatchObject({ playerId: "p1", teamId: "t1", price: 12, problem: null });
    expect(rows[1].problem).toMatch(/already/);
    expect(rows[2]).toMatchObject({ playerId: null, newPlayer: { category: "BOWL", origin: "overseas", overall: 9.1 }, problem: null });
    expect(rows[3].problem).toMatch(/not in this tracker/);
    expect(rows[4].problem).toMatch(/duplicate|unknown team/);
    expect(rows[5]).toMatchObject({ price: null, problem: null });
  });
});
