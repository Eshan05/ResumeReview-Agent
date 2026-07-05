import { describe, expect, it } from "vitest";
import {
  createAssessmentId,
  hashAssessmentInput,
  stableStringify,
} from "./assessment";

describe("assessment audit metadata", () => {
  it("hashes objects independently of key insertion order", () => {
    const left = { criteria: { skills: ["React"] }, weights: { skills: 40 } };
    const right = { weights: { skills: 40 }, criteria: { skills: ["React"] } };

    expect(stableStringify(left)).toBe(stableStringify(right));
    expect(hashAssessmentInput(left)).toBe(hashAssessmentInput(right));
  });

  it("keeps array order significant", () => {
    expect(hashAssessmentInput(["React", "Node.js"])).not.toBe(
      hashAssessmentInput(["Node.js", "React"]),
    );
  });

  it("uses the agent run as the idempotency boundary", () => {
    expect(createAssessmentId("agent-run-resume-1-attempt-2")).toBe(
      "resume-result-agent-run-resume-1-attempt-2",
    );
  });
});
