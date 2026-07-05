import { describe, expect, it } from "vitest";
import { createGroundedAskModelResponse } from "./ask-grounding";
import type { CandidateAskCitation } from "./types";

describe("Ask model grounding", () => {
  it("keeps grounded generated answers with valid citations", () => {
    const response = createGroundedAskModelResponse({
      citations: [citation("score", "Authentication is weak or missing.")],
      output: {
        answer:
          "The score is not higher because Authentication is weak or missing.",
        citationChunkIds: ["score"],
        confidence: "medium",
        followUps: ["Ask which project supports auth."],
        gaps: ["Authentication needs stronger evidence."],
        needsCrawl: false,
      },
      question: "Why not higher?",
    });

    expect(response?.answer).toContain("Authentication");
    expect(response?.citations).toHaveLength(1);
    expect(response?.gaps).toContain("Authentication needs stronger evidence.");
  });

  it("turns unsupported generated score-drag claims into gaps", () => {
    const response = createGroundedAskModelResponse({
      citations: [
        citation(
          "score",
          "Score drag: authentication is weak; project verification is missing.",
        ),
      ],
      output: {
        answer:
          "The score is lower because Kubernetes is missing from the resume.",
        citationChunkIds: ["score"],
        confidence: "high",
        followUps: [],
        gaps: [],
        needsCrawl: false,
      },
      question: "Why is the score not higher?",
    });

    expect(response?.answer).toContain("Stored evidence");
    expect(response?.answer).not.toContain("Kubernetes is missing");
    expect(response?.confidence).toBe("low");
    expect(response?.gaps.join(" ")).toContain("Kubernetes");
  });
});

function citation(chunkId: string, snippet: string): CandidateAskCitation {
  return {
    candidateId: "candidate-1",
    chunkId,
    label: "Scoring rationale",
    score: 10,
    snippet,
    sourceType: "pipeline",
    title: "Fit scoring evidence",
  };
}
