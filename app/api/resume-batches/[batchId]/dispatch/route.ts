import { z } from "zod";
import { apiError, json, notFound } from "@/lib/api/responses";
import {
  dispatchResumeUploadBatch,
  getResumeUploadBatch,
} from "@/lib/resume-batches/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const dispatchBodySchema = z
  .object({
    forceRetryFailed: z.boolean().optional(),
    limit: z.number().int().positive().max(25).optional(),
  })
  .optional();

export async function POST(
  request: Request,
  { params }: { params: Promise<{ batchId: string }> },
) {
  const { batchId } = await params;
  const existing = await getResumeUploadBatch(batchId);
  if (!existing) return notFound(`Resume batch ${batchId} was not found`);

  const body = dispatchBodySchema.safeParse(await readOptionalJson(request));
  if (!body.success) {
    return apiError("bad_request", "Invalid resume batch dispatch payload", {
      status: 400,
    });
  }

  const result = await dispatchResumeUploadBatch(batchId, {
    baseUrl: new URL(request.url).origin,
    forceRetryFailed: body.data?.forceRetryFailed,
    limit: body.data?.limit,
  });

  return json(result);
}

async function readOptionalJson(request: Request) {
  try {
    const text = await request.text();
    return text ? JSON.parse(text) : undefined;
  } catch {
    return null;
  }
}
