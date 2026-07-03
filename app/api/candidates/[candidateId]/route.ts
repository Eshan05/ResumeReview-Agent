import { json, notFound } from "@/lib/api/responses";
import { candidateService } from "@/lib/candidates";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ candidateId: string }> },
) {
  const { candidateId } = await params;
  const candidate = await candidateService.getCandidate(candidateId);

  if (!candidate) {
    return notFound(`Candidate ${candidateId} was not found`);
  }

  return json({ candidate });
}
