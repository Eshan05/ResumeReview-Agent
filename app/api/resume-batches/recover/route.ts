import { z } from "zod";
import { apiError, json } from "@/lib/api/responses";
import { recoverStaleResumeUploadItems } from "@/lib/resume-batches/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const recoverBatchSchema = z.object({
  batchId: z.string().min(1).optional(),
});

export async function POST(request: Request) {
  const body = await readJson(request);
  const parsed = recoverBatchSchema.safeParse(body);

  if (!parsed.success) {
    return apiError("bad_request", "Invalid resume batch recovery payload", {
      status: 400,
    });
  }

  const result = await recoverStaleResumeUploadItems(parsed.data.batchId);

  return json(result);
}

async function readJson(request: Request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}
