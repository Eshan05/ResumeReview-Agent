import { apiError, json, notFound } from "@/lib/api/responses";
import {
  createCandidateCrawlRun,
  getCandidateCrawlRun,
  markCandidateCrawlRunFailed,
  markCandidateCrawlRunSkipped,
  markCandidateCrawlRunTriggered,
} from "@/lib/candidates/evidence";
import { triggerCandidateCrawlWorkflow } from "@/lib/workflows/candidate-crawl";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ candidateId: string }> },
) {
  const { candidateId } = await params;
  const body = await request.json().catch(() => ({}));
  const reason =
    body && typeof body === "object" && "reason" in body
      ? String(body.reason)
      : undefined;

  if (!candidateId) {
    return apiError("bad_request", "Candidate id is required", {
      status: 400,
    });
  }

  const crawlRun = await createCandidateCrawlRun({ candidateId, reason });

  if (!crawlRun) {
    return notFound(`Candidate ${candidateId} was not found`);
  }

  if (crawlRun.status === "skipped") {
    return json(crawlRun);
  }

  const result = await triggerCandidateCrawlWorkflow(
    {
      candidateId,
      reason,
      runId: crawlRun.id,
    },
    { baseUrl: new URL(request.url).origin },
  );

  if (result.status === "triggered" && result.workflowRunId && crawlRun.id) {
    const updated = await markCandidateCrawlRunTriggered({
      runId: crawlRun.id,
      workflowRunId: result.workflowRunId,
    });
    return json(updated ?? result);
  }

  if (result.status === "skipped" && crawlRun.id) {
    const updated = await markCandidateCrawlRunSkipped({
      error: result.reason,
      runId: crawlRun.id,
    });
    return json(updated ?? result);
  }

  if (result.status === "failed" && crawlRun.id) {
    const updated = await markCandidateCrawlRunFailed({
      error: result.error,
      runId: crawlRun.id,
    });
    return json(updated ?? result);
  }

  return json(result);
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ candidateId: string }> },
) {
  const { candidateId } = await params;
  const url = new URL(request.url);
  const runId = url.searchParams.get("runId");

  if (!candidateId) {
    return apiError("bad_request", "Candidate id is required", {
      status: 400,
    });
  }

  const crawlRun = await getCandidateCrawlRun({ candidateId, runId });

  if (!crawlRun) {
    return notFound(
      runId
        ? `Crawl run ${runId} was not found`
        : `Candidate ${candidateId} has no crawl runs`,
    );
  }

  return json(crawlRun);
}
