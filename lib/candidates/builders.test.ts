import { describe, expect, it } from "vitest";
import { buildPipelineTrace } from "./builders";
import type { CandidateRow } from "./types";

describe("candidate pipeline trace status", () => {
  it.each([
    ["completed", "completed"],
    ["processing", "running"],
    ["pending", "pending"],
    ["failed", "error"],
  ] as const)(
    "maps candidate %s to pipeline %s",
    (candidateStatus, expected) => {
      expect(
        buildPipelineTrace({
          avatar: "",
          education: "",
          email: "",
          experience: "",
          fileName: "resume.pdf",
          flagCount: 0,
          id: "candidate-1",
          jobId: "job-1",
          name: "Candidate",
          rank: 1,
          resumeId: "candidate-1",
          score: 0,
          status: candidateStatus,
          topSkills: [],
          trust: 0,
        } satisfies CandidateRow).status,
      ).toBe(expected);
    },
  );
});
