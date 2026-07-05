import { desc, eq } from "drizzle-orm";

import { jobPostings } from "@/lib/db/app";
import { users } from "@/lib/db/auth.schema";
import { db } from "@/lib/db/db";
import { DEFAULT_JOB_CRITERIA, DEFAULT_JOB_WEIGHTS } from "@/lib/jobs/criteria";
import { buildJobContextFallback } from "./builders";
import { candidateService } from "./service";
import {
  type CandidatesListResponse,
  candidatesListResponseSchema,
  type JobContext,
} from "./types";
import { getCandidateStatusCounts } from "./view-model";

export const DEFAULT_REVIEW_JOB_ID =
  process.env.RESUME_REVIEW_JOB_ID ??
  process.env.NEXT_PUBLIC_RESUME_REVIEW_JOB_ID ??
  "local-resume-review-job";

const DEFAULT_REVIEW_USER_ID =
  process.env.UPLOAD_DEV_USER_ID ??
  process.env.DEV_UPLOAD_USER_ID ??
  "local-dev-user";

const DEFAULT_JOB_TITLE = "Senior Full-Stack AI Engineer";
const DEFAULT_JOB_DESCRIPTION = [
  "We need a senior full-stack engineer who can build production-grade web applications and AI workflow systems.",
  "Strong signals: TypeScript, React, Next.js, Node.js, Postgres, API design, workflow automation, testing, observability, product judgment, and practical LLM/agent evaluation.",
  "Prefer candidates with shipped customer-facing systems, clear ownership, reliable engineering habits, and evidence-backed project impact.",
].join("\n\n");

export async function getDefaultCandidatesList(): Promise<CandidatesListResponse> {
  const job = await ensureDefaultCandidateJob();
  const response = await candidateService.listCandidates(job.id);

  if (response) return response;

  return candidatesListResponseSchema.parse({
    candidates: [],
    job,
    stats: {
      averageScore: 0,
      statusCounts: getCandidateStatusCounts([]),
      total: 0,
    },
  } satisfies CandidatesListResponse);
}

export async function ensureDefaultCandidateJob(): Promise<JobContext> {
  const configuredJob = await getJobById(DEFAULT_REVIEW_JOB_ID);
  if (configuredJob) return toJobContext(configuredJob);

  const latestJob = await getLatestJob();
  if (latestJob && process.env.RESUME_REVIEW_JOB_ID) {
    return toJobContext(latestJob);
  }

  if (process.env.NODE_ENV !== "production") {
    await db
      .insert(users)
      .values({
        email: `${DEFAULT_REVIEW_USER_ID}@local.invalid`,
        emailVerified: true,
        id: DEFAULT_REVIEW_USER_ID,
        name: "Local Resume Reviewer",
      })
      .onConflictDoNothing();

    await db
      .insert(jobPostings)
      .values({
        description: DEFAULT_JOB_DESCRIPTION,
        id: DEFAULT_REVIEW_JOB_ID,
        criteria: DEFAULT_JOB_CRITERIA,
        status: "active",
        title: DEFAULT_JOB_TITLE,
        userId: DEFAULT_REVIEW_USER_ID,
        weights: DEFAULT_JOB_WEIGHTS,
      })
      .onConflictDoNothing();

    const job = await getJobById(DEFAULT_REVIEW_JOB_ID);
    if (job) return toJobContext(job);
  }

  return buildJobContextFallback({
    id: DEFAULT_REVIEW_JOB_ID,
    title: DEFAULT_JOB_TITLE,
  });
}

async function getJobById(jobId: string) {
  const [job] = await db
    .select()
    .from(jobPostings)
    .where(eq(jobPostings.id, jobId))
    .limit(1);

  return job ?? null;
}

async function getLatestJob() {
  const [job] = await db
    .select()
    .from(jobPostings)
    .orderBy(desc(jobPostings.createdAt))
    .limit(1);

  return job ?? null;
}

function toJobContext(job: typeof jobPostings.$inferSelect): JobContext {
  return buildJobContextFallback({
    employmentType: job.employmentType ?? undefined,
    description: job.description,
    id: job.id,
    criteria: job.criteria,
    location: job.location ?? undefined,
    status:
      job.status === "draft" ||
      job.status === "active" ||
      job.status === "closed" ||
      job.status === "archived"
        ? job.status
        : "active",
    title: job.title,
    weights: job.weights,
  });
}
