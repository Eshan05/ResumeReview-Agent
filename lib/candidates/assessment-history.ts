import type { AssessmentHistoryItem } from "./types";

const DEFAULT_INTERRUPTED_AFTER_MS = 30 * 60_000;

export interface AssessmentRunState {
  currentPhase?: string | null;
  lastHeartbeatAt?: Date | string | null;
  queuedAt?: Date | string | null;
  startedAt?: Date | string | null;
  status: string;
}

export function resolveAssessmentHistoryStatus(
  run: AssessmentRunState,
  options: {
    interruptedAfterMs?: number;
    now?: Date;
  } = {},
): AssessmentHistoryItem["status"] {
  const status = run.status.toLowerCase();
  const currentPhase = run.currentPhase?.toLowerCase();

  if (currentPhase === "workflow-skipped" || status === "skipped") {
    return "skipped";
  }
  if (currentPhase === "failed" || status === "failed" || status === "error") {
    return "failed";
  }
  if (status === "completed") return "completed";
  if (status === "queued" || status === "triggered" || status === "pending") {
    return "queued";
  }
  if (status === "running" || status === "processing") {
    const activityAt = toDate(
      run.lastHeartbeatAt ?? run.startedAt ?? run.queuedAt,
    );
    const interruptedAfterMs =
      options.interruptedAfterMs ?? DEFAULT_INTERRUPTED_AFTER_MS;
    const now = options.now ?? new Date();

    if (
      !activityAt ||
      now.getTime() - activityAt.getTime() > interruptedAfterMs
    ) {
      return "interrupted";
    }
    return "running";
  }

  return "interrupted";
}

export function assessmentResultBelongsToRun(
  result: { createdAt?: Date | string | null },
  run: { startedAt?: Date | string | null },
) {
  const resultCreatedAt = toDate(result.createdAt);
  const runStartedAt = toDate(run.startedAt);
  if (!resultCreatedAt || !runStartedAt) return true;
  return resultCreatedAt.getTime() >= runStartedAt.getTime() - 5 * 60_000;
}

function toDate(value: Date | string | null | undefined) {
  if (!value) return null;
  if (value instanceof Date) return value;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
