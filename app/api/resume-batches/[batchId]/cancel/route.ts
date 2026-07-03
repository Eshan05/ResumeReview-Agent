import { json, notFound } from "@/lib/api/responses";
import {
  cancelResumeUploadBatch,
  getResumeUploadBatch,
} from "@/lib/resume-batches/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ batchId: string }> },
) {
  const { batchId } = await params;
  const existing = await getResumeUploadBatch(batchId);
  if (!existing) return notFound(`Resume batch ${batchId} was not found`);

  await cancelResumeUploadBatch(batchId);

  return json({ batchId, status: "cancelled" });
}
