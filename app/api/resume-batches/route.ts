import { z } from "zod";
import { apiError, json } from "@/lib/api/responses";
import { RESUME_BATCH_MAX_FILES } from "@/lib/resume-batches/policy";
import { createResumeUploadBatch } from "@/lib/resume-batches/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const createResumeBatchSchema = z.object({
  files: z
    .array(
      z.object({
        id: z.string().min(1),
        lastModified: z.number().int().nonnegative().optional(),
        name: z.string().min(1),
        preflightIssue: z.string().optional(),
        preflightStatus: z.enum(["accepted", "rejected"]),
        size: z.number().int().nonnegative().optional(),
        type: z.string().default("application/octet-stream"),
      }),
    )
    .min(1)
    .max(RESUME_BATCH_MAX_FILES),
  id: z.string().min(1),
  jobId: z.string().min(1),
});

export async function POST(request: Request) {
  const body = await readJson(request);
  const parsed = createResumeBatchSchema.safeParse(body);

  if (!parsed.success) {
    return apiError("bad_request", "Invalid resume batch payload", {
      status: 400,
    });
  }

  const batch = await createResumeUploadBatch({
    ...parsed.data,
    uploadedBy: await resolveRequestUserId(request),
  });

  return json({ batch });
}

async function readJson(request: Request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

async function resolveRequestUserId(request: Request) {
  const devUserId =
    process.env.UPLOAD_DEV_USER_ID ?? process.env.DEV_UPLOAD_USER_ID;

  try {
    const { auth } = await import("@/lib/auth/auth");
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (session?.user?.id) return session.user.id;
  } catch {
    // Fall through to local development identity.
  }

  if (devUserId) return devUserId;
  if (process.env.NODE_ENV !== "production") return "local-dev-user";

  throw new Error("Unauthorized");
}
