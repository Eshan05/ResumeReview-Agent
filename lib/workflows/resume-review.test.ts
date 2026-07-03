import { afterEach, describe, expect, it, vi } from "vitest";
import { getResumeReviewFlowControl } from "./resume-review";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("resume review workflow admission", () => {
  it("defaults to one admitted candidate per minute", () => {
    vi.stubEnv("RESUME_REVIEW_WORKFLOW_FLOW_KEY", "");
    vi.stubEnv("RESUME_REVIEW_WORKFLOW_PARALLELISM", "");
    vi.stubEnv("RESUME_REVIEW_WORKFLOW_RATE_PERIOD_SECONDS", "");
    vi.stubEnv("RESUME_REVIEW_WORKFLOW_RATE", "");

    expect(getResumeReviewFlowControl()).toEqual({
      key: "resume-review-workflow",
      parallelism: 2,
      period: 60,
      rate: 1,
    });
  });

  it("allows deployment policy overrides", () => {
    vi.stubEnv("RESUME_REVIEW_WORKFLOW_FLOW_KEY", "production-review");
    vi.stubEnv("RESUME_REVIEW_WORKFLOW_PARALLELISM", "6");
    vi.stubEnv("RESUME_REVIEW_WORKFLOW_RATE_PERIOD_SECONDS", "30");
    vi.stubEnv("RESUME_REVIEW_WORKFLOW_RATE", "4");

    expect(getResumeReviewFlowControl()).toEqual({
      key: "production-review",
      parallelism: 6,
      period: 30,
      rate: 4,
    });
  });
});
