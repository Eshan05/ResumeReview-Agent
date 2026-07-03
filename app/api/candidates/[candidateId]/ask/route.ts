import { apiError, json, notFound } from "@/lib/api/responses";
import { askCandidateEvidence } from "@/lib/candidates/evidence";
import { candidateAskRequestSchema } from "@/lib/candidates/types";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ candidateId: string }> },
) {
  const { candidateId } = await params;
  const body = await request.json().catch(() => null);
  const parsed = candidateAskRequestSchema.safeParse(body);

  if (!parsed.success) {
    return apiError("bad_request", "Question is required", { status: 400 });
  }

  const answer = await askCandidateEvidence({
    candidateId,
    question: parsed.data.question,
  });

  if (!answer) {
    return notFound(`Candidate ${candidateId} was not found`);
  }

  return json(answer);
}
