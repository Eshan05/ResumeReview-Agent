import { eq } from "drizzle-orm";
import { apiError, json, notFound } from "@/lib/api/responses";
import { buildJobContextFallback } from "@/lib/candidates/builders";
import { refreshJobCriteriaEvidence } from "@/lib/candidates/evidence";
import { jobPostings } from "@/lib/db/app";
import { db } from "@/lib/db/db";
import {
  normalizeJobCriteria,
  normalizeJobWeights,
  sumJobWeights,
  updateJobCriteriaRequestSchema,
} from "@/lib/jobs/criteria";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await params;
  const job = await getJob(jobId);

  if (!job) return notFound(`Job ${jobId} was not found`);

  return json({
    job: buildJobContextFallback({
      criteria: job.criteria,
      description: job.description,
      employmentType: job.employmentType ?? undefined,
      id: job.id,
      location: job.location ?? undefined,
      status: toJobStatus(job.status),
      title: job.title,
      weights: job.weights,
    }),
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await params;
  const body = await request.json().catch(() => null);
  const parsed = updateJobCriteriaRequestSchema.safeParse(body);

  if (!parsed.success) {
    return apiError("bad_request", "Invalid job criteria payload", {
      status: 400,
    });
  }

  if (!parsed.data.criteria && !parsed.data.weights) {
    return apiError("bad_request", "Provide criteria or weights to update", {
      status: 400,
    });
  }

  const existing = await getJob(jobId);
  if (!existing) return notFound(`Job ${jobId} was not found`);

  if (
    parsed.data.weights &&
    Math.abs(sumJobWeights(parsed.data.weights) - 100) > 0.01
  ) {
    return apiError("bad_request", "Job weights must sum to 100", {
      status: 400,
    });
  }

  const weights = parsed.data.weights
    ? normalizeJobWeights(parsed.data.weights)
    : normalizeJobWeights(existing.weights);

  const criteria = parsed.data.criteria
    ? normalizeJobCriteria(parsed.data.criteria)
    : normalizeJobCriteria(existing.criteria);
  const [updated] = await db
    .update(jobPostings)
    .set({
      criteria,
      updatedAt: new Date(),
      weights,
    })
    .where(eq(jobPostings.id, jobId))
    .returning();
  const evidenceRefresh = await refreshJobCriteriaEvidence(jobId);

  return json({
    evidenceRefresh,
    job: buildJobContextFallback({
      criteria: updated.criteria,
      description: updated.description,
      employmentType: updated.employmentType ?? undefined,
      id: updated.id,
      location: updated.location ?? undefined,
      status: toJobStatus(updated.status),
      title: updated.title,
      weights: updated.weights,
    }),
  });
}

async function getJob(jobId: string) {
  const [job] = await db
    .select()
    .from(jobPostings)
    .where(eq(jobPostings.id, jobId))
    .limit(1);

  return job ?? null;
}

function toJobStatus(status: string) {
  return status === "draft" ||
    status === "active" ||
    status === "closed" ||
    status === "archived"
    ? status
    : "active";
}
