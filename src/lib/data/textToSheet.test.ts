import { describe, expect, it } from "vitest";
import { positionedTextToLines, textToSheet } from "./textToSheet";
import { parsePlayerSheet } from "./importPlayers";

describe("free text → rows", () => {
  it("handles numbered name lists", () => {
    const r = textToSheet("1. Virat Kohli\n2) Rohit Sharma\n3 - Jasprit Bumrah\n\n----\nShubman Gill");
    expect(r).toEqual([["Virat Kohli"], ["Rohit Sharma"], ["Jasprit Bumrah"], ["Shubman Gill"]]);
    expect(parsePlayerSheet(r).players).toHaveLength(4);
  });
  it("splits columns by tabs, pipes, wide spaces or consistent commas", () => {
    expect(textToSheet("Name\tRating\nArun\t8.5")).toEqual([["Name", "Rating"], ["Arun", "8.5"]]);
    expect(textToSheet("Name | Role\nArun | Bowler")).toEqual([["Name", "Role"], ["Arun", "Bowler"]]);
    expect(textToSheet("Name      Rating     Country\nArun Kumar   8.5   India")).toEqual([["Name", "Rating", "Country"], ["Arun Kumar", "8.5", "India"]]);
    expect(textToSheet("Name,Rating\nArun,8\nBala,9")).toEqual([["Name", "Rating"], ["Arun", "8"], ["Bala", "9"]]);
  });
  it("drops a serial-number column in table text", () => {
    expect(textToSheet("1\tArun\t8\n2\tBala\t9")).toEqual([["Arun", "8"], ["Bala", "9"]]);
  });
  it("rebuilds PDF table rows from positioned text", () => {
    const items = [
      { str: "Player", x: 50, y: 700, width: 30, height: 10 },
      { str: "Rating", x: 250, y: 700, width: 30, height: 10 },
      { str: "Virat", x: 50, y: 680, width: 25, height: 10 },
      { str: "Kohli", x: 78, y: 680.5, width: 25, height: 10 },
      { str: "9.5", x: 250, y: 680, width: 15, height: 10 },
    ];
    const lines = positionedTextToLines(items);
    expect(lines).toEqual(["Player\tRating", "Virat Kohli\t9.5"]);
    const r = parsePlayerSheet(textToSheet(lines.join("\n")));
    expect(r.players[0]).toMatchObject({ name: "Virat Kohli" });
    expect(r.players[0].ratings.overall).toBe(9.5);
  });
});
