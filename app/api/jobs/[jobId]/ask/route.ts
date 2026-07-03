import { apiError, json, notFound } from "@/lib/api/responses";
import { askJobEvidence } from "@/lib/candidates/evidence";
import { candidateAskRequestSchema } from "@/lib/candidates/types";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await params;
  const body = await request.json().catch(() => null);
  const parsed = candidateAskRequestSchema.safeParse(body);

  if (!parsed.success) {
    return apiError("bad_request", "Question is required", { status: 400 });
  }

  const answer = await askJobEvidence({
    jobId,
    question: parsed.data.question,
  });

  if (!answer) {
    return notFound(`Job ${jobId} was not found`);
  }

  return json(answer);
}
