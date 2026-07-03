import { json, notFound } from "@/lib/api/responses";
import { candidateService } from "@/lib/candidates";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await params;
  const response = await candidateService.listCandidates(jobId);

  if (!response) {
    return notFound(`No candidates found for job ${jobId}`);
  }

  return json(response);
}
