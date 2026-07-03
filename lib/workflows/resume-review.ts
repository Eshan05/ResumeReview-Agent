import { Client } from "@upstash/workflow";
import { z } from "zod";

import {
  markResumeWorkflowFailed,
  markResumeWorkflowSkipped,
  markResumeWorkflowTriggered,
  type ResumeReviewWorkflowPayload,
} from "@/lib/resumes/service";
import { authBaseUrl } from "@/utils/constants";

export const resumeReviewWorkflowPayloadSchema = z.object({
  agentRunId: z.string(),
  fileKey: z.string(),
  jobId: z.string(),
  resumeId: z.string(),
});

export type ResumeReviewWorkflowPayloadInput = z.infer<
  typeof resumeReviewWorkflowPayloadSchema
>;

export async function triggerResumeReviewWorkflow(
  payload: ResumeReviewWorkflowPayload,
  options?: {
    baseUrl?: string;
    forceNewRun?: boolean;
    workflowRunId?: string;
  },
) {
  const parsed = resumeReviewWorkflowPayloadSchema.parse(payload);
  const token = process.env.QSTASH_TOKEN ?? "";
  const workflowUrl = resolveWorkflowUrl(options?.baseUrl);
  const qstashDevelopmentServer = isQStashSdkDevelopmentServerEnabled();
  const localWorkflowMode = isLocalWorkflowMode();

  if (!workflowUrl) {
    await markResumeWorkflowSkipped({
      agentRunId: parsed.agentRunId,
      reason: "Workflow URL is not configured",
    });
    return {
      status: "skipped" as const,
      reason: "Workflow URL is not configured",
    };
  }

  const skippedReason = getWorkflowTriggerSkippedReason({
    localWorkflowMode,
    qstashDevelopmentServer,
    token,
    workflowUrl,
  });

  if (skippedReason) {
    await markResumeWorkflowSkipped({
      agentRunId: parsed.agentRunId,
      reason: skippedReason,
    });
    return {
      status: "skipped" as const,
      reason: skippedReason,
    };
  }

  try {
    const client = createWorkflowClient({ token });
    const result = await client.trigger({
      body: parsed,
      flowControl: getResumeReviewFlowControl(),
      label: `resume-review-${parsed.resumeId}`,
      retries: 3,
      url: workflowUrl,
      workflowRunId: getWorkflowRunId(parsed.resumeId, options),
    });

    await markResumeWorkflowTriggered({
      agentRunId: parsed.agentRunId,
      workflowRunId: result.workflowRunId,
    });

    return {
      status: "triggered" as const,
      workflowRunId: result.workflowRunId,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to trigger workflow";

    await markResumeWorkflowFailed({
      agentRunId: parsed.agentRunId,
      error: message,
    });

    return {
      status: "failed" as const,
      error: message,
    };
  }
}

export function getResumeReviewFlowControl() {
  return {
    key:
      process.env.RESUME_REVIEW_WORKFLOW_FLOW_KEY?.trim() ||
      "resume-review-workflow",
    parallelism: getPositiveIntegerEnv("RESUME_REVIEW_WORKFLOW_PARALLELISM", 2),
    period: getPositiveIntegerEnv(
      "RESUME_REVIEW_WORKFLOW_RATE_PERIOD_SECONDS",
      60,
    ),
    rate: getPositiveIntegerEnv("RESUME_REVIEW_WORKFLOW_RATE", 1),
  };
}

function getWorkflowRunId(
  resumeId: string,
  options: { forceNewRun?: boolean; workflowRunId?: string } | undefined,
) {
  if (options?.workflowRunId) return options.workflowRunId;

  if (options?.forceNewRun) {
    return `resume-review-${resumeId}-${crypto.randomUUID()}`;
  }

  return `resume-review-${resumeId}`;
}

function resolveWorkflowUrl(requestBaseUrl?: string) {
  const baseUrl =
    requestBaseUrl ??
    process.env.RESUME_REVIEW_WORKFLOW_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.BETTER_AUTH_URL ??
    authBaseUrl;

  if (!baseUrl) return undefined;

  return new URL("/api/workflows/resume-review", baseUrl).toString();
}

function createWorkflowClient({ token }: { token: string }) {
  if (isQStashSdkDevelopmentServerEnabled()) {
    return new Client({ token });
  }

  return new Client({
    baseUrl: process.env.QSTASH_URL,
    token,
  });
}

function getWorkflowTriggerSkippedReason({
  localWorkflowMode,
  qstashDevelopmentServer,
  token,
  workflowUrl,
}: {
  localWorkflowMode: boolean;
  qstashDevelopmentServer: boolean;
  token: string;
  workflowUrl: string;
}) {
  if (!qstashDevelopmentServer && !token) {
    return "QSTASH_TOKEN is not configured";
  }

  if (isLocalUrl(workflowUrl) && !localWorkflowMode) {
    return "Local workflow URL requires QSTASH_DEV=true or a local QSTASH_URL";
  }

  if (!(localWorkflowMode || isPublicUrl(workflowUrl))) {
    return "A public workflow URL is required outside local QStash development mode";
  }

  return undefined;
}

function isLocalWorkflowMode() {
  return isQStashSdkDevelopmentServerEnabled() || isLocalQStashUrl();
}

function isQStashSdkDevelopmentServerEnabled() {
  return process.env.QSTASH_DEV === "true";
}

function isLocalQStashUrl() {
  const qstashUrl = process.env.QSTASH_URL;
  if (!qstashUrl) return false;

  return isLocalUrl(qstashUrl);
}

function isPublicUrl(url: string) {
  return !isLocalUrl(url);
}

function isLocalUrl(url: string) {
  const parsed = new URL(url);
  return ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname);
}

function getPositiveIntegerEnv(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}
