export const RESUME_BATCH_MAX_FILES = 100;
export const RESUME_JOB_UPLOAD_SOFT_LIMIT = 10_000;
export const RESUME_UPLOAD_CHUNK_SIZE = 8;
export const RESUME_UPLOAD_CHUNK_CONCURRENCY = 2;
export const RESUME_BATCH_DISPATCH_LIMIT = 8;
export const RESUME_BATCH_MAX_ATTEMPTS = 3;

export const RETRYABLE_WORKFLOW_FAILURE_CATEGORIES = new Set([
  "db",
  "model",
  "rate_limit",
  "timeout",
  "workflow",
]);

export type BatchItemCountStatus =
  | "cancelled"
  | "completed"
  | "dispatching"
  | "failed"
  | "processing"
  | "queued"
  | "rejected"
  | "uploaded"
  | "uploading";

export interface BatchItemCountInput {
  status: BatchItemCountStatus | string;
}

export function chunkItems<T>(items: T[], size: number) {
  if (size <= 0) return [items];

  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

export function isRetryableWorkflowFailureCategory(
  category: string | null | undefined,
) {
  return Boolean(
    category && RETRYABLE_WORKFLOW_FAILURE_CATEGORIES.has(category),
  );
}

export function shouldRetryWorkflowFailure({
  attempt,
  category,
  maxAttempts = RESUME_BATCH_MAX_ATTEMPTS,
}: {
  attempt: number;
  category: string | null | undefined;
  maxAttempts?: number;
}) {
  return attempt < maxAttempts && isRetryableWorkflowFailureCategory(category);
}

export function getRetryDelayMs(attempt: number) {
  const normalizedAttempt = Math.max(1, attempt);
  const baseDelayMs = 30_000;
  const maxDelayMs = 15 * 60_000;
  return Math.min(maxDelayMs, baseDelayMs * 2 ** (normalizedAttempt - 1));
}

export function getNextRetryAt(attempt: number, now = new Date()) {
  return new Date(now.getTime() + getRetryDelayMs(attempt));
}

export function summarizeBatchItemCounts(items: BatchItemCountInput[]) {
  const counts = {
    acceptedCount: 0,
    cancelledCount: 0,
    completedCount: 0,
    failedCount: 0,
    queuedCount: 0,
    rejectedCount: 0,
    runningCount: 0,
    totalCount: items.length,
    uploadedCount: 0,
  };

  for (const item of items) {
    if (item.status === "rejected") counts.rejectedCount += 1;
    else counts.acceptedCount += 1;

    if (item.status === "cancelled") counts.cancelledCount += 1;
    if (item.status === "completed") counts.completedCount += 1;
    if (item.status === "failed") counts.failedCount += 1;
    if (item.status === "queued" || item.status === "dispatching") {
      counts.queuedCount += 1;
    }
    if (item.status === "processing") counts.runningCount += 1;
    if (
      item.status === "uploaded" ||
      item.status === "queued" ||
      item.status === "dispatching" ||
      item.status === "processing" ||
      item.status === "completed" ||
      item.status === "failed"
    ) {
      counts.uploadedCount += 1;
    }
  }

  return counts;
}

export function resolveBatchStatus(
  counts: ReturnType<typeof summarizeBatchItemCounts>,
) {
  if (counts.cancelledCount > 0) return "cancelled" as const;
  if (counts.totalCount === 0) return "created" as const;
  if (counts.completedCount + counts.rejectedCount === counts.totalCount) {
    return "completed" as const;
  }
  if (
    counts.completedCount + counts.failedCount + counts.rejectedCount ===
    counts.totalCount
  ) {
    return counts.completedCount > 0
      ? ("partial" as const)
      : ("failed" as const);
  }
  if (counts.runningCount > 0) return "processing" as const;
  if (counts.queuedCount > 0) return "dispatching" as const;
  if (counts.uploadedCount > 0) return "uploading" as const;
  return "created" as const;
}
