import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { config } from "dotenv";
import { triggerCandidateCrawlWorkflow } from "@/lib/workflows/candidate-crawl";

config({ path: ".env.local", quiet: true });

const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001";
const qstashUrl = process.env.QSTASH_URL ?? "http://localhost:8080";

async function main() {
  const qstash = await ensureLocalQStash();

  try {
    await assertReachable(baseUrl, "Next app");
    await assertReachable(qstashUrl, "local QStash");
    await triggerSmokeCandidateWorkflow();
    await maybeExerciseResumeRetry();
    await maybeExerciseCandidateCrawl();
  } finally {
    if (qstash.started) {
      stopProcessTree(qstash.process);
    }
  }
}

async function ensureLocalQStash(): Promise<
  { process: ChildProcess; started: true } | { started: false }
> {
  if (await isReachable(qstashUrl)) return { started: false };

  const command = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  const child = spawn(command, ["dlx", "@upstash/qstash-cli@latest", "dev"], {
    env: {
      ...process.env,
      QSTASH_DEV: "true",
      QSTASH_URL: qstashUrl,
    },
    shell: process.platform === "win32",
    stdio: ["ignore", "ignore", "ignore"],
  });

  await waitUntilReachable(qstashUrl, 30_000, "local QStash");

  return { process: child, started: true };
}

async function triggerSmokeCandidateWorkflow() {
  const candidateId = `workflow-smoke-candidate-${Date.now()}`;
  const result = await triggerCandidateCrawlWorkflow(
    {
      candidateId,
      reason: "Local workflow integration smoke test",
    },
    { baseUrl },
  );

  if (result.status !== "triggered") {
    throw new Error(
      `candidate-crawl did not trigger: ${JSON.stringify(result)}`,
    );
  }

  console.log(`candidate-crawl trigger ok: ${result.workflowRunId}`);
}

async function maybeExerciseResumeRetry() {
  const resumeId = process.env.WORKFLOW_TEST_RESUME_ID;
  if (!resumeId) {
    console.log("resume retry poll skipped; set WORKFLOW_TEST_RESUME_ID.");
    return;
  }

  const response = await fetch(
    `${baseUrl}/api/resumes/${encodeURIComponent(resumeId)}/workflow/retry`,
    { method: "POST" },
  );

  if (!response.ok) {
    throw new Error(`resume retry returned ${response.status}`);
  }

  const payload = (await response.json()) as {
    workflow?: { status?: string; workflowRunId?: string };
  };
  if (payload.workflow?.status !== "triggered") {
    throw new Error(`resume retry did not trigger: ${JSON.stringify(payload)}`);
  }

  const status = await pollResumeStatus(resumeId);
  if (status.runStatus !== "completed") {
    throw new Error(`resume workflow ended as ${JSON.stringify(status)}`);
  }

  await assertNonHeuristicPipeline(resumeId);

  console.log(`resume-review completed: ${payload.workflow.workflowRunId}`);
}

async function assertNonHeuristicPipeline(candidateId: string) {
  if (process.env.RESUME_REVIEW_ALLOW_HEURISTIC_FALLBACK === "true") return;

  const response = await fetch(
    `${baseUrl}/api/candidates/${encodeURIComponent(candidateId)}/pipeline`,
  );
  if (!response.ok) {
    throw new Error(`pipeline returned ${response.status}`);
  }

  const payload = (await response.json()) as {
    trace?: {
      phases?: Array<{
        subAgents?: Array<{ provider?: string }>;
      }>;
    };
  };
  const providers = new Set(
    payload.trace?.phases
      ?.flatMap((phase) => phase.subAgents ?? [])
      .map((agent) => agent.provider?.toLowerCase())
      .filter(Boolean),
  );

  if (providers.has("heuristic")) {
    throw new Error(
      "resume workflow completed with heuristic fallback output; fix the model failure or set RESUME_REVIEW_ALLOW_HEURISTIC_FALLBACK=true explicitly",
    );
  }
}

async function maybeExerciseCandidateCrawl() {
  const candidateId = process.env.WORKFLOW_TEST_CANDIDATE_ID;
  if (!candidateId) {
    console.log(
      "candidate crawl poll skipped; set WORKFLOW_TEST_CANDIDATE_ID.",
    );
    return;
  }

  const response = await fetch(
    `${baseUrl}/api/candidates/${encodeURIComponent(candidateId)}/crawl`,
    {
      body: JSON.stringify({
        reason: "Local workflow integration candidate crawl test",
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    },
  );

  if (!response.ok) {
    throw new Error(`candidate crawl returned ${response.status}`);
  }

  const run = (await response.json()) as { id?: string; status: string };
  if (!run.id) {
    console.log(
      `candidate crawl returned terminal ${run.status} without run id`,
    );
    return;
  }

  const finalRun = await pollCrawlRun(candidateId, run.id);
  if (!["completed", "failed", "skipped"].includes(finalRun.status)) {
    throw new Error(`candidate crawl did not reach terminal state: ${run.id}`);
  }

  console.log(`candidate-crawl ${finalRun.status}: ${run.id}`);
}

async function pollResumeStatus(resumeId: string) {
  const deadline = Date.now() + 180_000;

  while (Date.now() < deadline) {
    const response = await fetch(
      `${baseUrl}/api/resumes/status?ids=${encodeURIComponent(resumeId)}`,
    );
    if (!response.ok) throw new Error(`status returned ${response.status}`);

    const payload = (await response.json()) as {
      statuses?: Array<{
        currentPhase: string;
        failureCategory?: string | null;
        runStatus: string;
      }>;
    };
    const status = payload.statuses?.[0];

    if (status?.runStatus === "completed" || status?.runStatus === "failed") {
      return status;
    }

    await sleep(3000);
  }

  throw new Error(`resume workflow did not finish for ${resumeId}`);
}

async function pollCrawlRun(candidateId: string, runId: string) {
  const deadline = Date.now() + 90_000;

  while (Date.now() < deadline) {
    const response = await fetch(
      `${baseUrl}/api/candidates/${encodeURIComponent(
        candidateId,
      )}/crawl?runId=${encodeURIComponent(runId)}`,
    );
    if (!response.ok)
      throw new Error(`crawl status returned ${response.status}`);

    const run = (await response.json()) as {
      error?: string | null;
      id: string;
      status: string;
    };

    if (["completed", "failed", "skipped"].includes(run.status)) {
      return run;
    }

    await sleep(2000);
  }

  throw new Error(`candidate crawl did not finish for ${runId}`);
}

async function assertReachable(url: string, label: string) {
  if (!(await isReachable(url))) {
    throw new Error(`${label} is not reachable at ${url}`);
  }
}

async function waitUntilReachable(
  url: string,
  timeoutMs: number,
  label: string,
) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (await isReachable(url)) return;
    await sleep(1000);
  }

  throw new Error(`${label} did not become reachable at ${url}`);
}

async function isReachable(url: string) {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(3000),
    });
    return response.status < 500;
  } catch {
    return false;
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stopProcessTree(child: ChildProcess) {
  if (!child.pid) return;

  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", child.pid.toString(), "/t", "/f"], {
      stdio: "ignore",
    });
    return;
  }

  child.kill("SIGTERM");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
