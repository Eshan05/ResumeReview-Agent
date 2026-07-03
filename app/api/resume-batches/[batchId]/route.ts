import { json, notFound } from "@/lib/api/responses";
import { getResumeUploadBatch } from "@/lib/resume-batches/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ batchId: string }> },
) {
  const { batchId } = await params;
  const batch = await getResumeUploadBatch(batchId);

  if (!batch) return notFound(`Resume batch ${batchId} was not found`);

  return json(batch);
}
