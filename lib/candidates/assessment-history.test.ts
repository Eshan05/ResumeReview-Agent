import { describe, expect, it } from "vitest";
import {
  assessmentResultBelongsToRun,
  resolveAssessmentHistoryStatus,
} from "./assessment-history";

const NOW = new Date("2026-07-10T12:00:00.000Z");

describe("assessment history status", () => {
  it("recognizes workflow-skipped runs even though they remain queued", () => {
    expect(
      resolveAssessmentHistoryStatus({
        currentPhase: "workflow-skipped",
        status: "queued",
      }),
    ).toBe("skipped");
  });

  it("keeps a recently active run running", () => {
    expect(
      resolveAssessmentHistoryStatus(
        {
          lastHeartbeatAt: "2026-07-10T11:50:00.000Z",
          status: "running",
        },
        { now: NOW },
      ),
    ).toBe("running");
  });

  it("marks stale or timestamp-free active runs as interrupted", () => {
    expect(
      resolveAssessmentHistoryStatus(
        {
          lastHeartbeatAt: "2026-07-10T11:00:00.000Z",
          status: "running",
        },
        { now: NOW },
      ),
    ).toBe("interrupted");
    expect(resolveAssessmentHistoryStatus({ status: "processing" })).toBe(
      "interrupted",
    );
  });

  it("separates a legacy result from a later run that reused its id", () => {
    expect(
      assessmentResultBelongsToRun(
        { createdAt: "2026-06-29T20:09:52.000Z" },
        { startedAt: "2026-07-05T11:41:26.000Z" },
      ),
    ).toBe(false);
    expect(
      assessmentResultBelongsToRun(
        { createdAt: "2026-07-05T11:42:00.000Z" },
        { startedAt: "2026-07-05T11:41:26.000Z" },
      ),
    ).toBe(true);
  });
});
