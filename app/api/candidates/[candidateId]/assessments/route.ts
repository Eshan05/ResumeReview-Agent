import { json, notFound } from "@/lib/api/responses";
import { candidateService } from "@/lib/candidates/service";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ candidateId: string }> },
) {
  const { candidateId } = await params;
  const history = await candidateService.getAssessmentHistory(candidateId);

  if (!history) {
    return notFound(`Candidate ${candidateId} was not found`);
  }

  return json(history);
}
