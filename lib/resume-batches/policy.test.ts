import { describe, expect, it } from "vitest";
import {
  chunkItems,
  getNextRetryAt,
  getRetryDelayMs,
  isRetryableWorkflowFailureCategory,
  RESUME_BATCH_MAX_ATTEMPTS,
  RESUME_BATCH_MAX_FILES,
  RESUME_JOB_UPLOAD_SOFT_LIMIT,
  resolveBatchStatus,
  shouldRetryWorkflowFailure,
  summarizeBatchItemCounts,
} from "./policy";

describe("resume batch policy", () => {
  it("chunks status and upload requests at deterministic boundaries", () => {
    expect(chunkItems([1], 25)).toEqual([[1]]);
    expect(
      chunkItems(
        Array.from({ length: 25 }, (_, index) => index),
        25,
      ),
    ).toHaveLength(1);
    expect(
      chunkItems(
        Array.from({ length: 26 }, (_, index) => index),
        25,
      ),
    ).toHaveLength(2);
    expect(
      chunkItems(
        Array.from({ length: 100 }, (_, index) => index),
        8,
      ),
    ).toHaveLength(13);
  });

  it("models ten-thousand job uploads as one hundred durable batches", () => {
    const uploads = Array.from(
      { length: RESUME_JOB_UPLOAD_SOFT_LIMIT },
      (_, index) => index,
    );

    expect(chunkItems(uploads, RESUME_BATCH_MAX_FILES)).toHaveLength(100);
  });

  it("classifies retryable workflow failures conservatively", () => {
    expect(isRetryableWorkflowFailureCategory("rate_limit")).toBe(true);
    expect(isRetryableWorkflowFailureCategory("timeout")).toBe(true);
    expect(isRetryableWorkflowFailureCategory("extraction")).toBe(false);
    expect(isRetryableWorkflowFailureCategory("validation")).toBe(false);
  });

  it("stops retrying after max attempts", () => {
    expect(
      shouldRetryWorkflowFailure({
        attempt: RESUME_BATCH_MAX_ATTEMPTS - 1,
        category: "workflow",
      }),
    ).toBe(true);
    expect(
      shouldRetryWorkflowFailure({
        attempt: RESUME_BATCH_MAX_ATTEMPTS,
        category: "workflow",
      }),
    ).toBe(false);
  });

  it("uses deterministic exponential backoff with a cap", () => {
    const now = new Date("2026-07-05T00:00:00.000Z");

    expect(getRetryDelayMs(1)).toBe(30_000);
    expect(getRetryDelayMs(2)).toBe(60_000);
    expect(getRetryDelayMs(99)).toBe(15 * 60_000);
    expect(getNextRetryAt(2, now).toISOString()).toBe(
      "2026-07-05T00:01:00.000Z",
    );
  });

  it("summarizes aggregate batch item states", () => {
    const counts = summarizeBatchItemCounts([
      { status: "completed" },
      { status: "failed" },
      { status: "processing" },
      { status: "queued" },
      { status: "rejected" },
      { status: "uploaded" },
    ]);

    expect(counts).toMatchObject({
      acceptedCount: 5,
      completedCount: 1,
      failedCount: 1,
      queuedCount: 1,
      rejectedCount: 1,
      runningCount: 1,
      totalCount: 6,
      uploadedCount: 5,
    });
    expect(resolveBatchStatus(counts)).toBe("processing");
  });

  it("resolves terminal partial and failed batch states", () => {
    expect(
      resolveBatchStatus(
        summarizeBatchItemCounts([
          { status: "completed" },
          { status: "failed" },
        ]),
      ),
    ).toBe("partial");
    expect(
      resolveBatchStatus(
        summarizeBatchItemCounts([{ status: "failed" }, { status: "failed" }]),
      ),
    ).toBe("failed");
  });
});
