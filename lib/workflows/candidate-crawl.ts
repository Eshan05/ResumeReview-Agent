import { Client } from "@upstash/workflow";
import { z } from "zod";
import { authBaseUrl } from "@/utils/constants";

export const candidateCrawlWorkflowPayloadSchema = z.object({
  candidateId: z.string(),
  reason: z.string().optional(),
  runId: z.string().optional(),
});

export type CandidateCrawlWorkflowPayload = z.infer<
  typeof candidateCrawlWorkflowPayloadSchema
>;

export async function triggerCandidateCrawlWorkflow(
  payload: CandidateCrawlWorkflowPayload,
  options: { baseUrl?: string } = {},
) {
  const parsed = candidateCrawlWorkflowPayloadSchema.parse(payload);
  const token = process.env.QSTASH_TOKEN ?? "";
  const workflowUrl = resolveCandidateCrawlWorkflowUrl(options.baseUrl);
  const localWorkflowMode = isLocalWorkflowMode();

  if (!workflowUrl) {
    return {
      reason: "Workflow URL is not configured",
      status: "skipped" as const,
    };
  }

  if (!localWorkflowMode && !token) {
    return {
      reason: "QSTASH_TOKEN is not configured",
      status: "skipped" as const,
    };
  }

  if (isLocalUrl(workflowUrl) && !localWorkflowMode) {
    return {
      reason: "Local workflow URL requires QSTASH_DEV=true or local QSTASH_URL",
      status: "skipped" as const,
    };
  }

  try {
    const client = createWorkflowClient({ token });
    const result = await client.trigger({
      body: parsed,
      flowControl: {
        key: process.env.CANDIDATE_CRAWL_FLOW_KEY ?? "candidate-crawl",
        parallelism: getPositiveIntegerEnv("CANDIDATE_CRAWL_PARALLELISM", 2),
        period: getPositiveIntegerEnv(
          "CANDIDATE_CRAWL_RATE_PERIOD_SECONDS",
          60,
        ),
        rate: getPositiveIntegerEnv("CANDIDATE_CRAWL_RATE", 12),
      },
      label: `candidate-crawl-${parsed.candidateId}`,
      retries: 2,
      url: workflowUrl,
      workflowRunId: `candidate-crawl-${parsed.candidateId}-${crypto.randomUUID()}`,
    });

    return {
      status: "triggered" as const,
      workflowRunId: result.workflowRunId,
    };
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "Failed to trigger workflow",
      status: "failed" as const,
    };
  }
}

function resolveCandidateCrawlWorkflowUrl(requestBaseUrl?: string) {
  const baseUrl =
    requestBaseUrl ??
    process.env.CANDIDATE_CRAWL_WORKFLOW_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.BETTER_AUTH_URL ??
    authBaseUrl;

  if (!baseUrl) return undefined;

  return new URL("/api/workflows/candidate-crawl", baseUrl).toString();
}

function createWorkflowClient({ token }: { token: string }) {
  if (process.env.QSTASH_DEV === "true") {
    return new Client({ token });
  }

  return new Client({
    baseUrl: process.env.QSTASH_URL,
    token,
  });
}

function isLocalWorkflowMode() {
  return process.env.QSTASH_DEV === "true" || isLocalQStashUrl();
}

function isLocalQStashUrl() {
  const qstashUrl = process.env.QSTASH_URL;
  if (!qstashUrl) return false;
  return isLocalUrl(qstashUrl);
}

function isLocalUrl(url: string) {
  const parsed = new URL(url);
  return ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname);
}

function getPositiveIntegerEnv(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}
