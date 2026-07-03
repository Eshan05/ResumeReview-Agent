import { apiError, json, notFound } from "@/lib/api/responses";
import { prepareResumeWorkflowRetry } from "@/lib/resumes/service";
import { triggerResumeReviewWorkflow } from "@/lib/workflows/resume-review";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ resumeId: string }> },
) {
  const { resumeId } = await params;

  if (!resumeId) {
    return apiError("bad_request", "Resume id is required", { status: 400 });
  }

  const payload = await prepareResumeWorkflowRetry(resumeId);

  if (!payload) {
    return notFound(`Resume ${resumeId} was not found`);
  }

  const workflow = await triggerResumeReviewWorkflow(payload, {
    baseUrl: new URL(request.url).origin,
    forceNewRun: true,
  });

  return json({
    agentRunId: payload.agentRunId,
    resumeId: payload.resumeId,
    workflow,
  });
}
