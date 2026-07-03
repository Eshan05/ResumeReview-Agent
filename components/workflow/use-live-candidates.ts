"use client";

import * as React from "react";
import type { CandidateRow } from "@/components/table/candidates";
import type { PipelinePhase } from "@/components/workflow/pipeline-timeline";
import { chunkItems } from "@/lib/resume-batches/policy";
import type { CandidateProgress, PhaseState } from "./pipeline-types";

interface ResumeWorkflowStatus {
  agentRunId: string | null;
  completedAt: string | null;
  currentPhase: string | null;
  error: string | null;
  failureCategory: string | null;
  fileName: string;
  nextRetryAt: string | null;
  phases: unknown;
  resumeId: string;
  resumeStatus: string;
  runStatus: string | null;
  startedAt: string | null;
  uploadBatchId: string | null;
  workflowRunId: string | null;
}

interface AgentRunPhase {
  action?: string;
  completedAt?: string;
  durationMs?: number;
  id?: string;
  startedAt?: string;
  status?: PhaseState;
  subAgents?: AgentRunSubAgent[];
  summary?: string;
  title?: string;
}

interface AgentRunSubAgent {
  durationMs?: number;
  findings?: string[];
  model?: string;
  name?: string;
  provider?: string;
  status?: PhaseState;
  summary?: string;
  tokensIn?: number;
  tokensOut?: number;
}

export function useLiveCandidates(candidates: CandidateRow[]) {
  const [progress, setProgress] = React.useState<
    Record<string, CandidateProgress>
  >({});
  const [globalElapsed, setGlobalElapsed] = React.useState(0);
  const statusRef = React.useRef<Record<string, ResumeWorkflowStatus>>({});
  const eventSourceRef = React.useRef<EventSource[]>([]);
  const fallbackIntervalRef = React.useRef<number | null>(null);

  const candidateByResumeId = React.useMemo(
    () =>
      new Map(candidates.map((candidate) => [candidate.resumeId, candidate])),
    [candidates],
  );
  const resumeIdsKey = React.useMemo(
    () => candidates.map((candidate) => candidate.resumeId).join(","),
    [candidates],
  );
  const resumeIdChunks = React.useMemo(
    () =>
      chunkItems(
        candidates.map((candidate) => candidate.resumeId),
        25,
      ),
    [candidates],
  );

  const applyStatuses = React.useCallback(
    (statuses: ResumeWorkflowStatus[]) => {
      statusRef.current = {
        ...statusRef.current,
        ...Object.fromEntries(
          statuses.map((status) => [status.resumeId, status]),
        ),
      };

      setProgress((previous) => {
        const next: Record<string, CandidateProgress> = { ...previous };

        for (const status of statuses) {
          const candidate = candidateByResumeId.get(status.resumeId);
          if (!candidate) continue;

          next[candidate.id] = statusToProgress(candidate, status);
        }

        return next;
      });
    },
    [candidateByResumeId],
  );

  const refreshOnce = React.useCallback(async () => {
    if (!resumeIdsKey) return [];

    const payloads = await Promise.all(
      resumeIdChunks.map(async (chunk) => {
        const response = await fetch(
          `/api/resumes/status?ids=${chunk.map(encodeURIComponent).join(",")}`,
          { cache: "no-store" },
        );

        if (!response.ok) return { statuses: [] };

        return (await response.json()) as {
          statuses: ResumeWorkflowStatus[];
        };
      }),
    );
    const statuses = payloads.flatMap((payload) => payload.statuses);
    applyStatuses(statuses);
    return statuses;
  }, [applyStatuses, resumeIdChunks, resumeIdsKey]);

  React.useEffect(() => {
    eventSourceRef.current.forEach((source) => {
      source.close();
    });
    eventSourceRef.current = [];

    if (fallbackIntervalRef.current) {
      window.clearInterval(fallbackIntervalRef.current);
      fallbackIntervalRef.current = null;
    }

    statusRef.current = {};
    setProgress({});
    setGlobalElapsed(0);

    if (!resumeIdsKey) return;

    const sources = resumeIdChunks.map((chunk) => {
      const source = new EventSource(
        `/api/resumes/progress/stream?ids=${chunk
          .map(encodeURIComponent)
          .join(",")}`,
      );

      source.addEventListener("snapshot", (event) => {
        const payload = parseSnapshot(event);
        if (!payload) return;

        applyStatuses(payload.statuses);

        if (payload.statuses.length > 0 && payload.statuses.every(isTerminal)) {
          source.close();
        }
      });

      source.addEventListener("error", () => {
        source.close();

        void refreshOnce();
        if (!fallbackIntervalRef.current) {
          fallbackIntervalRef.current = window.setInterval(async () => {
            const statuses = await refreshOnce();
            if (statuses.length > 0 && statuses.every(isTerminal)) {
              if (fallbackIntervalRef.current) {
                window.clearInterval(fallbackIntervalRef.current);
                fallbackIntervalRef.current = null;
              }
            }
          }, 2500);
        }
      });

      return source;
    });
    eventSourceRef.current = sources;

    return () => {
      sources.forEach((source) => {
        source.close();
      });
      if (fallbackIntervalRef.current) {
        window.clearInterval(fallbackIntervalRef.current);
        fallbackIntervalRef.current = null;
      }
    };
  }, [applyStatuses, refreshOnce, resumeIdChunks, resumeIdsKey]);

  React.useEffect(() => {
    if (!resumeIdsKey) return;

    const interval = window.setInterval(() => {
      const activeStatuses = Object.values(statusRef.current).filter(
        (status) => !isTerminal(status),
      );
      const startTimes = activeStatuses
        .map((status) => toTime(status.startedAt))
        .filter((value): value is number => value !== null);

      if (startTimes.length === 0) {
        setGlobalElapsed(0);
        return;
      }

      setGlobalElapsed((Date.now() - Math.min(...startTimes)) / 1000);
    }, 1000);

    return () => window.clearInterval(interval);
  }, [resumeIdsKey]);

  const startProcessing = React.useCallback(() => {
    void refreshOnce();
  }, [refreshOnce]);

  return { progress, globalElapsed, startProcessing };
}

function parseSnapshot(event: Event) {
  const message = event as MessageEvent<string>;

  try {
    return JSON.parse(message.data) as { statuses: ResumeWorkflowStatus[] };
  } catch {
    return null;
  }
}

function statusToProgress(
  candidate: CandidateRow,
  status: ResumeWorkflowStatus,
): CandidateProgress {
  const phases = getRunPhaseItems(status.phases);
  const timelinePhases =
    phases.length > 0
      ? phases.map((phase) => toTimelinePhase(phase, status))
      : buildStatusShell(candidate, status);

  return {
    candidateId: candidate.id,
    isRunning: !isTerminal(status),
    phases: appendFailurePhaseIfNeeded(timelinePhases, candidate, status),
  };
}

function getRunPhaseItems(phases: unknown): AgentRunPhase[] {
  if (Array.isArray(phases)) return phases.filter(isAgentRunPhase);

  if (!phases || typeof phases !== "object") return [];

  const items = (phases as { items?: unknown }).items;
  return Array.isArray(items) ? items.filter(isAgentRunPhase) : [];
}

function isAgentRunPhase(value: unknown): value is AgentRunPhase {
  return Boolean(value) && typeof value === "object";
}

function toTimelinePhase(
  phase: AgentRunPhase,
  status: ResumeWorkflowStatus,
): PipelinePhase {
  return {
    action: phase.action ?? status.currentPhase ?? "Processing resume",
    duration: formatDuration(
      phase.durationMs,
      phase.startedAt,
      phase.completedAt,
    ),
    id: phase.id ?? `${status.resumeId}-${phase.title ?? "phase"}`,
    status: normalizePhaseStatus(phase.status),
    subAgents: phase.subAgents?.map(toTimelineSubAgent),
    timestamp: formatTimestamp(phase.startedAt),
    title: phase.title ?? phase.id ?? "Workflow phase",
  };
}

function toTimelineSubAgent(agent: AgentRunSubAgent) {
  return {
    duration: formatDuration(agent.durationMs),
    findings: agent.findings ?? [],
    model: agent.model,
    name: agent.name ?? "Agent",
    provider: agent.provider ?? "backend",
    status: normalizePhaseStatus(agent.status),
    summary: agent.summary,
    tokensIn: agent.tokensIn,
    tokensOut: agent.tokensOut,
  };
}

function buildStatusShell(
  candidate: CandidateRow,
  status: ResumeWorkflowStatus,
): PipelinePhase[] {
  const failed = isFailedStatus(status);
  const phaseStatus = isTerminal(status)
    ? failed
      ? "error"
      : "completed"
    : status.runStatus === "queued"
      ? "pending"
      : "running";

  return [
    {
      action: describeCurrentPhase(status.currentPhase, status.nextRetryAt),
      id: `${candidate.id}-workflow-status`,
      status: phaseStatus,
      timestamp: formatTimestamp(status.startedAt),
      title:
        status.currentPhase === "quota-wait"
          ? "Waiting for model quota"
          : (status.currentPhase ?? "Workflow queued"),
    },
  ];
}

function appendFailurePhaseIfNeeded(
  phases: PipelinePhase[],
  candidate: CandidateRow,
  status: ResumeWorkflowStatus,
): PipelinePhase[] {
  if (
    !isFailedStatus(status) ||
    phases.some((phase) => phase.status === "error")
  ) {
    return phases;
  }

  return [
    ...phases,
    {
      action: status.error ?? "Workflow failed before completion.",
      id: `${candidate.id}-workflow-failed`,
      status: "error",
      timestamp: formatTimestamp(status.completedAt),
      title: status.failureCategory
        ? `Failed: ${formatFailureCategory(status.failureCategory)}`
        : "Workflow failed",
    },
  ];
}

function describeCurrentPhase(
  phase: string | null,
  nextRetryAt: string | null,
) {
  if (!phase) return "Waiting for workflow progress.";

  if (phase === "quota-wait") {
    const retryAt = nextRetryAt ? new Date(nextRetryAt) : null;
    return retryAt && !Number.isNaN(retryAt.getTime())
      ? `Provider capacity is reserved. Workflow resumes around ${retryAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.`
      : "Provider capacity is reserved. Workflow will resume automatically.";
  }

  const descriptions: Record<string, string> = {
    "awaiting-agent-review": "Text is extracted; waiting for agent review.",
    completed: "Workflow completed.",
    "extract-text": "Extracting resume text.",
    failed: "Workflow failed.",
    "fit-scoring": "Calculating weighted fit score.",
    "master-review": "Auditing specialist outputs.",
    "primary-specialists": "Running primary specialist agents.",
    "quota-wait": "Waiting for shared model-provider capacity.",
    "red-flag-detection": "Checking red flags and trust signals.",
    "review-candidate": "Coordinating candidate review.",
    "skills-verification": "Verifying skills and projects.",
    "workflow-queued": "Workflow is queued in QStash.",
  };

  return descriptions[phase] ?? phase;
}

function normalizePhaseStatus(status: PhaseState | undefined): PhaseState {
  return status === "pending" ||
    status === "running" ||
    status === "completed" ||
    status === "error"
    ? status
    : "pending";
}

function isTerminal(status: ResumeWorkflowStatus) {
  return (
    status.runStatus === "completed" ||
    status.runStatus === "failed" ||
    status.currentPhase === "failed" ||
    status.resumeStatus === "scored"
  );
}

function isFailedStatus(status: ResumeWorkflowStatus) {
  return status.runStatus === "failed" || status.currentPhase === "failed";
}

function formatFailureCategory(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatTimestamp(value: string | undefined | null) {
  const time = toTime(value);
  if (time === null) return undefined;

  return new Date(time).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatDuration(
  durationMs: number | undefined,
  startedAt?: string,
  completedAt?: string,
) {
  const value =
    durationMs ??
    (startedAt && completedAt
      ? Math.max(
          0,
          new Date(completedAt).getTime() - new Date(startedAt).getTime(),
        )
      : undefined);

  if (value === undefined || Number.isNaN(value)) return undefined;
  if (value < 1000) return `${value}ms`;
  return `${(value / 1000).toFixed(1)}s`;
}

function toTime(value: string | null | undefined) {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? null : time;
}
