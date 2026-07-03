import { apiError, json, notFound } from "@/lib/api/responses";
import { candidateService } from "@/lib/candidates";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ candidateId: string }> },
) {
  const { candidateId } = await params;
  const runId = new URL(request.url).searchParams.get("runId")?.trim();
  if (runId && (runId.length > 240 || !/^[a-zA-Z0-9._:-]+$/.test(runId))) {
    return apiError("bad_request", "Invalid pipeline run id", { status: 400 });
  }
  const trace = await candidateService.getPipelineTrace(
    candidateId,
    runId || undefined,
  );

  if (!trace) {
    return notFound(
      `Pipeline trace for candidate ${candidateId} was not found`,
    );
  }

  return json({ trace });
}
