import { describe, expect, it } from "vitest";
import { rankCandidates } from "./ranking";

describe("candidate ranking", () => {
  it("ranks by final score with a deterministic id tie-break", () => {
    const ranked = rankCandidates([
      { id: "candidate-c", rank: 99, score: 72 },
      { id: "candidate-b", rank: 99, score: 91 },
      { id: "candidate-a", rank: 99, score: 91 },
    ]);

    expect(ranked.map(({ id, rank }) => ({ id, rank }))).toEqual([
      { id: "candidate-a", rank: 1 },
      { id: "candidate-b", rank: 2 },
      { id: "candidate-c", rank: 3 },
    ]);
  });

  it("does not mutate repository records", () => {
    const candidates = [
      { id: "candidate-b", rank: 7, score: 50 },
      { id: "candidate-a", rank: 8, score: 60 },
    ];

    rankCandidates(candidates);

    expect(candidates.map((candidate) => candidate.rank)).toEqual([7, 8]);
  });
});
