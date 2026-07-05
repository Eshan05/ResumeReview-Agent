import { config } from "dotenv";
import { triggerCandidateCrawlWorkflow } from "@/lib/workflows/candidate-crawl";
import { triggerResumeReviewWorkflow } from "@/lib/workflows/resume-review";

config({ path: ".env.local", quiet: true });

const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001";
const qstashUrl = process.env.QSTASH_URL ?? "http://localhost:8080";

async function main() {
  await assertReachable(baseUrl, "Next app");
  await assertReachable(qstashUrl, "local QStash");

  const candidateResult = await triggerCandidateCrawlWorkflow(
    {
      candidateId: `workflow-smoke-candidate-${Date.now()}`,
      reason: "Local QStash trigger smoke test",
    },
    { baseUrl },
  );

  if (candidateResult.status !== "triggered") {
    throw new Error(
      `candidate-crawl trigger did not queue: ${JSON.stringify(
        candidateResult,
      )}`,
    );
  }

  console.log(
    `candidate-crawl queued: ${candidateResult.workflowRunId ?? "unknown"}`,
  );

  if (process.env.SMOKE_RESUME_REVIEW_WORKFLOW === "true") {
    const resumeResult = await triggerResumeReviewWorkflow(
      {
        agentRunId: `workflow-smoke-agent-${Date.now()}`,
        fileKey: "workflow-smoke-file",
        jobId: "workflow-smoke-job",
        resumeId: "workflow-smoke-resume",
      },
      { baseUrl, forceNewRun: true },
    );

    if (resumeResult.status !== "triggered") {
      throw new Error(
        `resume-review trigger did not queue: ${JSON.stringify(resumeResult)}`,
      );
    }

    console.log(
      `resume-review queued: ${resumeResult.workflowRunId ?? "unknown"}`,
    );
  } else {
    console.log(
      "resume-review trigger smoke skipped; set SMOKE_RESUME_REVIEW_WORKFLOW=true to queue it.",
    );
  }
}

async function assertReachable(url: string, label: string) {
  const response = await fetch(url, {
    method: "GET",
    signal: AbortSignal.timeout(3000),
  });

  if (!response.ok && response.status >= 500) {
    throw new Error(`${label} returned ${response.status} at ${url}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
