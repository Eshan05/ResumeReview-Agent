import { serve } from "@upstash/workflow/nextjs";
import {
  crawlCandidateEvidence,
  markCandidateCrawlRunFailed,
} from "@/lib/candidates/evidence";
import { candidateCrawlWorkflowPayloadSchema } from "@/lib/workflows/candidate-crawl";

export const runtime = "nodejs";

export const { POST } = serve(async (context) => {
  const payload = await context.run("parse-payload", async () =>
    candidateCrawlWorkflowPayloadSchema.parse(context.requestPayload),
  );

  await context.run("crawl-candidate-public-evidence", async () => {
    try {
      await crawlCandidateEvidence({
        candidateId: payload.candidateId,
        reason: payload.reason,
        runId: payload.runId,
      });
    } catch (error) {
      if (payload.runId) {
        await markCandidateCrawlRunFailed({
          error:
            error instanceof Error ? error.message : "Candidate crawl failed",
          runId: payload.runId,
        });
      }
      throw error;
    }
  });
});
