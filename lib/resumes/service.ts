import { desc, eq, inArray } from "drizzle-orm";
import { indexCandidateEvidenceForAgentRun } from "@/lib/candidates/evidence";
import {
  agentRuns,
  jobPostings,
  resumeResults,
  resumes,
  resumeUploadBatches,
  resumeUploadItems,
} from "@/lib/db/app";
import { users } from "@/lib/db/auth.schema";
import { downloadUploadThingFile } from "@/lib/files/storage";
import {
  DEFAULT_JOB_CRITERIA,
  DEFAULT_JOB_WEIGHTS,
  normalizeJobCriteria,
  normalizeJobWeights,
} from "@/lib/jobs/criteria";
import {
  getNextRetryAt,
  resolveBatchStatus,
  shouldRetryWorkflowFailure,
  summarizeBatchItemCounts,
} from "@/lib/resume-batches/policy";
import type { PlatformCrawlReport } from "@/lib/resumes/platform-crawlers";
import {
  ASSESSMENT_SCHEMA_VERSION,
  type AssessmentVersionManifest,
  createAssessmentId,
  hashAssessmentInput,
  RESUME_MASTER_PROMPT_VERSION,
  RESUME_REVIEW_AGENT_VERSION,
  RESUME_SCORING_VERSION,
  RESUME_SPECIALIST_PROMPT_VERSION,
} from "./assessment";
import {
  type ResumeReviewInput,
  type ResumeReviewPipelinePhase,
  type ResumeReviewRunResult,
  runResumeReviewAgent,
} from "./review-agent";
import {
  extractResumeText,
  type ResumeTextExtraction,
} from "./text-extraction";

export type WorkflowFailureCategory =
  | "crawl"
  | "db"
  | "extraction"
  | "model"
  | "ocr"
  | "rate_limit"
  | "timeout"
  | "validation"
  | "workflow";

export interface CreateResumeUploadInput {
  fileKey: string;
  fileName: string;
  fileSize?: number;
  fileType: string;
  fileUrl: string;
  jobId: string;
  resumeId: string;
  uploadAttempt?: number;
  uploadBatchId?: string;
  uploadedBy: string;
}

export interface ResumeReviewWorkflowPayload {
  agentRunId: string;
  fileKey: string;
  jobId: string;
  resumeId: string;
}

export interface ResumeWorkflowStatus {
  agentRunId: string | null;
  completedAt: string | null;
  currentPhase: string | null;
  error: string | null;
  failureCategory: string | null;
  fileName: string;
  nextRetryAt: string | null;
  phases: unknown;
  resumeId: string;
  resumeStatus: string;
  runStatus: string | null;
  startedAt: string | null;
  uploadBatchId: string | null;
  workflowRunId: string | null;
}

interface AgentRunPhaseEvidence {
  id: string;
  label: string;
  snippet: string;
  source: string;
}

interface AgentRunPhase {
  action: string;
  artifacts: Array<{
    id: string;
    name: string;
    type: "pdf" | "xlsx" | "docx" | "txt" | "json" | "url" | "other";
    url?: string;
  }>;
  category: string;
  completedAt?: string;
  durationMs?: number;
  evidence: AgentRunPhaseEvidence[];
  id: string;
  startedAt?: string;
  status: "completed" | "error" | "pending" | "running";
  subAgents: Array<{
    durationMs?: number;
    findings: string[];
    id: string;
    status: "completed" | "error" | "pending" | "running";
    model?: string;
    name: string;
    provider: string;
    summary: string;
    tokensIn?: number;
    tokensOut?: number;
  }>;
  summary: string;
  title: string;
}

async function getDatabase() {
  const { db } = await import("@/lib/db/db");
  return db;
}

export async function createResumeUploadRecord(input: CreateResumeUploadInput) {
  const db = await getDatabase();

  if (process.env.NODE_ENV !== "production") {
    const safeEmailName = input.uploadedBy.replace(/[^a-zA-Z0-9._-]/g, "-");

    await db
      .insert(users)
      .values({
        id: input.uploadedBy,
        email: `${safeEmailName}@local.invalid`,
        emailVerified: true,
        name: "Local Resume Reviewer",
      })
      .onConflictDoNothing();

    await db
      .insert(jobPostings)
      .values({
        id: input.jobId,
        criteria: DEFAULT_JOB_CRITERIA,
        description:
          "Development job posting created for local resume upload testing.",
        status: "active",
        title: "Senior Full-Stack Engineer",
        userId: input.uploadedBy,
        weights: DEFAULT_JOB_WEIGHTS,
      })
      .onConflictDoNothing();
  }

  const [resume] = await db
    .insert(resumes)
    .values({
      id: input.resumeId,
      applicantEmail: null,
      applicantName: null,
      fileName: input.fileName,
      fileSize: input.fileSize,
      fileType: input.fileType,
      fileUrl: input.fileUrl,
      jobPostingId: input.jobId,
      rawText: null,
      status: "uploaded",
      uploadAttempt: input.uploadAttempt,
      uploadBatchId: input.uploadBatchId,
      uploadFileKey: input.fileKey,
      uploadedBy: input.uploadedBy,
    })
    .onConflictDoUpdate({
      target: resumes.id,
      set: {
        fileName: input.fileName,
        fileSize: input.fileSize,
        fileType: input.fileType,
        fileUrl: input.fileUrl,
        jobPostingId: input.jobId,
        rawText: null,
        status: "uploaded",
        uploadAttempt: input.uploadAttempt,
        uploadBatchId: input.uploadBatchId,
        uploadFileKey: input.fileKey,
        uploadedBy: input.uploadedBy,
      },
    })
    .returning();

  return resume;
}

export async function createResumeAgentRun({
  attempt,
  jobId,
  resumeId,
  uploadBatchId,
}: {
  attempt?: number;
  jobId: string;
  resumeId: string;
  uploadBatchId?: string | null;
}) {
  const db = await getDatabase();
  const resolvedAttempt =
    attempt ?? (await getNextResumeAgentRunAttempt(db, resumeId));
  const agentRunId = getResumeAgentRunId(
    resumeId,
    resolvedAttempt,
    uploadBatchId,
  );
  const [run] = await db
    .insert(agentRuns)
    .values({
      id: agentRunId,
      attempt: resolvedAttempt,
      currentPhase: "queued",
      error: null,
      failureCategory: null,
      jobPostingId: jobId,
      phases: {},
      queuedAt: new Date(),
      resumeId,
      retryCount: Math.max(0, resolvedAttempt - 1),
      status: "queued",
      uploadBatchId,
      workflowRunId: null,
    })
    .onConflictDoUpdate({
      target: agentRuns.id,
      set: {
        attempt: resolvedAttempt,
        completedAt: null,
        currentPhase: "queued",
        error: null,
        failureCategory: null,
        jobPostingId: jobId,
        nextRetryAt: null,
        phases: {},
        queuedAt: new Date(),
        resumeId,
        retryCount: Math.max(0, resolvedAttempt - 1),
        startedAt: new Date(),
        status: "queued",
        uploadBatchId,
        workflowRunId: null,
      },
    })
    .returning();

  return run;
}

export async function getResumeWorkflowStatuses(
  resumeIds: string[],
): Promise<ResumeWorkflowStatus[]> {
  const db = await getDatabase();
  const uniqueResumeIds = Array.from(new Set(resumeIds.filter(Boolean)));

  if (uniqueResumeIds.length === 0) return [];

  const rows = await db
    .select({
      resume: resumes,
      run: agentRuns,
    })
    .from(resumes)
    .leftJoin(agentRuns, eq(agentRuns.resumeId, resumes.id))
    .where(inArray(resumes.id, uniqueResumeIds))
    .orderBy(desc(agentRuns.startedAt));

  const latestByResumeId = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    if (!latestByResumeId.has(row.resume.id)) {
      latestByResumeId.set(row.resume.id, row);
    }
  }

  return uniqueResumeIds
    .map((resumeId) => latestByResumeId.get(resumeId))
    .filter((row): row is (typeof rows)[number] => Boolean(row))
    .map(({ resume, run }) => {
      const phases = run?.phases ?? null;

      return {
        agentRunId: run?.id ?? null,
        completedAt: toIsoString(run?.completedAt) ?? null,
        currentPhase: run?.currentPhase ?? null,
        error: run?.error ?? null,
        failureCategory: run?.failureCategory ?? null,
        fileName: resume.fileName,
        nextRetryAt: toIsoString(run?.nextRetryAt) ?? null,
        phases,
        resumeId: resume.id,
        resumeStatus: resume.status,
        runStatus: run?.status ?? null,
        startedAt: toIsoString(run?.startedAt) ?? null,
        uploadBatchId: resume.uploadBatchId ?? null,
        workflowRunId: getWorkflowRunId(phases),
      };
    });
}

export async function prepareResumeWorkflowRetry(resumeId: string) {
  const db = await getDatabase();
  const [resume] = await db
    .select()
    .from(resumes)
    .where(eq(resumes.id, resumeId))
    .limit(1);

  if (!resume) return null;

  const [latestRun] = await db
    .select({
      attempt: agentRuns.attempt,
      uploadBatchId: agentRuns.uploadBatchId,
    })
    .from(agentRuns)
    .where(eq(agentRuns.resumeId, resume.id))
    .orderBy(desc(agentRuns.startedAt))
    .limit(1);
  const nextAttempt = Math.max(1, (latestRun?.attempt ?? 0) + 1);
  const agentRun = await createResumeAgentRun({
    attempt: nextAttempt,
    jobId: resume.jobPostingId,
    resumeId: resume.id,
    uploadBatchId: latestRun?.uploadBatchId,
  });

  if (latestRun?.uploadBatchId) {
    await db
      .update(resumeUploadItems)
      .set({
        agentRunId: agentRun.id,
        attempt: nextAttempt,
        claimToken: null,
        claimedAt: null,
        failureCategory: null,
        lastError: null,
        nextRetryAt: null,
        status: "dispatching",
        workflowStatus: "dispatching",
      })
      .where(eq(resumeUploadItems.resumeId, resume.id));
  }

  return {
    agentRunId: agentRun.id,
    fileKey: resume.uploadFileKey ?? resume.id,
    jobId: resume.jobPostingId,
    resumeId: resume.id,
  } satisfies ResumeReviewWorkflowPayload;
}

export async function markResumeWorkflowTriggered({
  agentRunId,
  workflowRunId,
}: {
  agentRunId: string;
  workflowRunId: string;
}) {
  const db = await getDatabase();
  const phases = await getExistingRunPhases(agentRunId);

  await db
    .update(agentRuns)
    .set({
      completedAt: null,
      currentPhase: "workflow-queued",
      error: null,
      failureCategory: null,
      phases: {
        ...phases,
        workflowRunId,
      },
      queuedAt: new Date(),
      status: "queued",
      workflowRunId,
    })
    .where(eq(agentRuns.id, agentRunId));
  await db
    .update(resumeUploadItems)
    .set({
      lastError: null,
      nextRetryAt: null,
      status: "queued",
      workflowRunId,
      workflowStatus: "queued",
    })
    .where(eq(resumeUploadItems.agentRunId, agentRunId));

  await indexCandidateEvidenceForAgentRun(agentRunId);
}

export async function markResumeWorkflowSkipped({
  agentRunId,
  reason,
}: {
  agentRunId: string;
  reason: string;
}) {
  const db = await getDatabase();
  await db
    .update(agentRuns)
    .set({
      currentPhase: "workflow-skipped",
      error: reason,
      status: "queued",
    })
    .where(eq(agentRuns.id, agentRunId));
  const [item] = await db
    .update(resumeUploadItems)
    .set({
      lastError: reason,
      status: "failed",
      workflowStatus: "skipped",
    })
    .where(eq(resumeUploadItems.agentRunId, agentRunId))
    .returning({ batchId: resumeUploadItems.batchId });
  if (item?.batchId) await refreshResumeUploadBatchCounts(item.batchId);

  await indexCandidateEvidenceForAgentRun(agentRunId);
}

export async function markResumeWorkflowFailed({
  agentRunId,
  category,
  error,
}: {
  agentRunId: string;
  category?: WorkflowFailureCategory;
  error: string;
}) {
  const db = await getDatabase();
  const failureCategory = category ?? classifyWorkflowFailure(error);
  const [existingRun] = await db
    .select({ attempt: agentRuns.attempt })
    .from(agentRuns)
    .where(eq(agentRuns.id, agentRunId))
    .limit(1);
  const attempt = existingRun?.attempt ?? 1;
  const retryable = shouldRetryWorkflowFailure({
    attempt,
    category: failureCategory,
  });
  const nextRetryAt = retryable ? getNextRetryAt(attempt) : null;
  await db
    .update(agentRuns)
    .set({
      currentPhase: "failed",
      completedAt: new Date(),
      error,
      failureCategory,
      nextRetryAt,
      status: "failed",
    })
    .where(eq(agentRuns.id, agentRunId));
  const [item] = await db
    .update(resumeUploadItems)
    .set({
      failureCategory,
      lastError: error,
      nextRetryAt,
      status: "failed",
      workflowStatus: "failed",
    })
    .where(eq(resumeUploadItems.agentRunId, agentRunId))
    .returning({ batchId: resumeUploadItems.batchId });
  if (item?.batchId) await refreshResumeUploadBatchCounts(item.batchId);

  await indexCandidateEvidenceForAgentRun(agentRunId);
}

export async function markResumeQuotaDeferred({
  agentRunId,
  retryAt,
}: {
  agentRunId: string;
  retryAt: Date;
}) {
  const db = await getDatabase();
  await db
    .update(agentRuns)
    .set({
      currentPhase: "quota-wait",
      error: null,
      failureCategory: null,
      lastHeartbeatAt: new Date(),
      nextRetryAt: retryAt,
      status: "running",
    })
    .where(eq(agentRuns.id, agentRunId));
  await db
    .update(resumeUploadItems)
    .set({
      failureCategory: null,
      lastError: null,
      nextRetryAt: retryAt,
      status: "processing",
      workflowStatus: "processing",
    })
    .where(eq(resumeUploadItems.agentRunId, agentRunId));
}

export async function markResumeProcessingStarted({
  agentRunId,
}: {
  agentRunId: string;
}) {
  const db = await getDatabase();
  await db
    .update(agentRuns)
    .set({
      currentPhase: "extract-text",
      lastHeartbeatAt: new Date(),
      startedAt: new Date(),
      status: "running",
    })
    .where(eq(agentRuns.id, agentRunId));
  await db
    .update(resumeUploadItems)
    .set({
      status: "processing",
      workflowStatus: "processing",
    })
    .where(eq(resumeUploadItems.agentRunId, agentRunId));
}

export async function extractAndStoreResumeText(
  payload: ResumeReviewWorkflowPayload,
) {
  const db = await getDatabase();
  const [resume] = await db
    .select()
    .from(resumes)
    .where(eq(resumes.id, payload.resumeId))
    .limit(1);

  if (!resume) {
    throw new Error(`Resume ${payload.resumeId} was not found`);
  }

  if (resume.rawText?.trim()) {
    return {
      applicantEmail: resume.applicantEmail ?? undefined,
      applicantName: resume.applicantName ?? undefined,
      characterCount: resume.rawText.length,
      extractionMethod: "cached",
      rawText: resume.rawText,
    } satisfies ResumeTextExtraction;
  }

  const file = await downloadUploadThingFile({
    key: resume.id,
    url: resume.fileUrl,
  });
  const extraction = await extractResumeText({
    data: await file.arrayBuffer(),
    fileName: resume.fileName,
    fileType: resume.fileType,
  });

  await db
    .update(resumes)
    .set({
      applicantEmail: extraction.applicantEmail ?? resume.applicantEmail,
      applicantName: extraction.applicantName ?? resume.applicantName,
      rawText: extraction.rawText,
      status: "text_extracted",
    })
    .where(eq(resumes.id, resume.id));

  return extraction;
}

export async function markResumeExtractionCompleted({
  agentRunId,
  extraction,
}: {
  agentRunId: string;
  extraction: ResumeTextExtraction;
}) {
  const db = await getDatabase();
  const phases = await getExistingRunPhases(agentRunId);

  await db
    .update(agentRuns)
    .set({
      currentPhase: "awaiting-agent-review",
      phases: {
        ...phases,
        items: upsertRunPhase(phases.items, {
          action: "Extract resume text from uploaded file",
          artifacts: [],
          category: "Ingestion",
          completedAt: new Date().toISOString(),
          durationMs: undefined,
          evidence: [
            {
              id: "character-count",
              label: "Character count",
              snippet: extraction.characterCount.toString(),
              source: extraction.extractionMethod,
            },
          ],
          status: "completed",
          subAgents: [],
          summary: `Extracted ${extraction.characterCount} characters with ${extraction.extractionMethod}.`,
          title: "Text extraction",
          id: "text-extraction",
        }),
      },
      lastHeartbeatAt: new Date(),
      nextRetryAt: null,
      status: "running",
    })
    .where(eq(agentRuns.id, agentRunId));
}

export async function markResumeReviewStarted({
  agentRunId,
}: {
  agentRunId: string;
}) {
  const db = await getDatabase();
  const phases = await getExistingRunPhases(agentRunId);

  await db
    .update(agentRuns)
    .set({
      currentPhase: "review-candidate",
      phases: {
        ...phases,
        items: upsertRunPhase(phases.items, {
          action:
            "Coordinate specialist agents and synthesize candidate review",
          artifacts: [],
          category: "Review",
          evidence: [],
          id: "candidate-review",
          startedAt: new Date().toISOString(),
          status: "running",
          subAgents: [
            {
              id: "master-resume-review-agent",
              name: "Master Resume Review Agent",
              provider: "groq",
              status: "running",
              summary:
                "Coordinating profile, skills, evidence, scoring, and final recommendation.",
              findings: [],
            },
          ],
          summary:
            "Master agent is coordinating specialist review of extracted resume evidence.",
          title: "Master review",
        }),
      },
      lastHeartbeatAt: new Date(),
      status: "running",
    })
    .where(eq(agentRuns.id, agentRunId));
}

export async function markResumeReviewPhasesStarted({
  agentRunId,
  currentPhase,
  phases: startedPhases,
}: {
  agentRunId: string;
  currentPhase: string;
  phases: AgentRunPhase[];
}) {
  const db = await getDatabase();
  const phases = await getExistingRunPhases(agentRunId);

  await db
    .update(agentRuns)
    .set({
      currentPhase,
      phases: {
        ...phases,
        items: upsertRunPhases(phases.items, startedPhases),
      },
      lastHeartbeatAt: new Date(),
      nextRetryAt: null,
      status: "running",
    })
    .where(eq(agentRuns.id, agentRunId));
}

export async function loadResumeReviewInput(
  payload: ResumeReviewWorkflowPayload,
): Promise<ResumeReviewInput> {
  const db = await getDatabase();
  const [row] = await db
    .select({
      job: jobPostings,
      resume: resumes,
    })
    .from(resumes)
    .innerJoin(jobPostings, eq(jobPostings.id, resumes.jobPostingId))
    .where(eq(resumes.id, payload.resumeId))
    .limit(1);

  if (!row) {
    throw new Error(`Resume ${payload.resumeId} was not found`);
  }

  if (!row.resume.rawText) {
    throw new Error(`Resume ${payload.resumeId} has no extracted text`);
  }

  return {
    applicantEmail: row.resume.applicantEmail,
    applicantName: row.resume.applicantName,
    criteria: normalizeJobCriteria(row.job.criteria),
    jobDescription: row.job.description,
    jobTitle: row.job.title,
    rawText: row.resume.rawText,
    weights: normalizeJobWeights(row.job.weights),
  };
}

export async function markResumeReviewPhasesCompleted({
  agentRunId,
  currentPhase,
  phases: completedPhases,
}: {
  agentRunId: string;
  currentPhase: string;
  phases: ResumeReviewPipelinePhase[];
}) {
  const db = await getDatabase();
  const phases = await getExistingRunPhases(agentRunId);

  await db
    .update(agentRuns)
    .set({
      currentPhase,
      phases: {
        ...phases,
        items: upsertRunPhases(phases.items, completedPhases),
      },
      lastHeartbeatAt: new Date(),
      status: "running",
    })
    .where(eq(agentRuns.id, agentRunId));
}

export async function reviewAndStoreResume(
  payload: ResumeReviewWorkflowPayload,
  options: {
    platformCrawl?: PlatformCrawlReport | null;
    quotaKey?: string;
    specialistPhases?: ResumeReviewPipelinePhase[];
  } = {},
) {
  const db = await getDatabase();
  const [row] = await db
    .select({
      job: jobPostings,
      resume: resumes,
    })
    .from(resumes)
    .innerJoin(jobPostings, eq(jobPostings.id, resumes.jobPostingId))
    .where(eq(resumes.id, payload.resumeId))
    .limit(1);

  if (!row) {
    throw new Error(`Resume ${payload.resumeId} was not found`);
  }

  if (!row.resume.rawText) {
    throw new Error(`Resume ${payload.resumeId} has no extracted text`);
  }

  const criteria = normalizeJobCriteria(row.job.criteria);
  const weights = normalizeJobWeights(row.job.weights);
  const reviewRun = await runResumeReviewAgent(
    {
      applicantEmail: row.resume.applicantEmail,
      applicantName: row.resume.applicantName,
      criteria,
      jobDescription: row.job.description,
      jobTitle: row.job.title,
      platformCrawl: options.platformCrawl ?? null,
      rawText: row.resume.rawText,
      weights,
    },
    {
      quotaKey: options.quotaKey,
      specialistPhases: options.specialistPhases,
    },
  );
  const platformCrawl =
    options.platformCrawl ?? reviewRun.platformCrawl ?? null;
  const resultId = createAssessmentId(payload.agentRunId);
  const versionManifest = buildAssessmentVersionManifest(
    reviewRun,
    options.specialistPhases,
  );

  await db
    .insert(resumeResults)
    .values({
      agentRunId: payload.agentRunId,
      applicantInfo: reviewRun.review.applicant,
      certifications: [],
      education: reviewRun.review.education,
      experience: reviewRun.review.experience,
      finalScore: reviewRun.review.finalScore,
      githubData: platformCrawl?.githubData ?? null,
      id: resultId,
      inputHashes: {
        jobDescription: hashAssessmentInput(row.job.description),
        platformCrawl: hashAssessmentInput(platformCrawl),
        resumeText: hashAssessmentInput(row.resume.rawText),
        specialistPhases: hashAssessmentInput(options.specialistPhases ?? []),
      },
      modelVersions: versionManifest,
      platformData: platformCrawl?.platformData ?? null,
      projectMatches: reviewRun.review.projects.matches,
      projects: reviewRun.review.projects,
      rank: null,
      redFlags: reviewRun.review.risks.redFlags,
      resumeId: row.resume.id,
      rubricSnapshot: {
        criteria,
        jobTitle: row.job.title,
        weights,
      },
      skillVerification: reviewRun.review.skills.verification,
      skills: reviewRun.review.skills,
      summary: reviewRun.review.summary,
    })
    .onConflictDoNothing();

  await db
    .update(resumes)
    .set({
      applicantEmail:
        reviewRun.review.applicant.email ?? row.resume.applicantEmail,
      applicantName:
        reviewRun.review.applicant.name ?? row.resume.applicantName,
      status: "scored",
    })
    .where(eq(resumes.id, row.resume.id));

  return reviewRun;
}

export async function markResumeReviewCompleted({
  agentRunId,
  reviewRun,
}: {
  agentRunId: string;
  reviewRun: ResumeReviewRunResult;
}) {
  const db = await getDatabase();
  const phases = await getExistingRunPhases(agentRunId);
  const completedAt = new Date().toISOString();

  await db
    .update(agentRuns)
    .set({
      completedAt: new Date(),
      currentPhase: "completed",
      error: null,
      failureCategory: null,
      modelVersions: buildAssessmentVersionManifest(reviewRun),
      phases: {
        ...phases,
        items: upsertRunPhases(
          phases.items,
          buildCompletedReviewPhases(reviewRun, completedAt),
        ),
      },
      lastHeartbeatAt: new Date(),
      nextRetryAt: null,
      status: "completed",
      tokenUsage: reviewRun.tokenUsage ?? null,
    })
    .where(eq(agentRuns.id, agentRunId));
  const [item] = await db
    .update(resumeUploadItems)
    .set({
      completedAt: new Date(),
      failureCategory: null,
      lastError: null,
      nextRetryAt: null,
      status: "completed",
      workflowStatus: "completed",
    })
    .where(eq(resumeUploadItems.agentRunId, agentRunId))
    .returning({ batchId: resumeUploadItems.batchId });
  if (item?.batchId) await refreshResumeUploadBatchCounts(item.batchId);

  await indexCandidateEvidenceForAgentRun(agentRunId);
}

function buildCompletedReviewPhases(
  reviewRun: ResumeReviewRunResult,
  completedAt: string,
): AgentRunPhase[] {
  if (reviewRun.pipeline.phases.length > 0) {
    return reviewRun.pipeline.phases.map((phase) => ({
      ...phase,
      completedAt: phase.completedAt ?? completedAt,
      status: "completed",
      subAgents: phase.subAgents.map((subAgent) => ({
        ...subAgent,
        status: "completed",
      })),
    }));
  }

  const review = reviewRun.review;
  const educationSummary = formatEducationEntry(review.education.entries[0]);
  const allSkillNames = review.skills.all.map((skill) => skill.name);
  const categoryFindings = summarizeSkillCategories(review.skills.all);
  const verificationFindings = [
    ...review.skills.verification,
    ...review.risks.redFlags.map((flag) => `${flag.severity}: ${flag.message}`),
  ];

  return [
    {
      action: "Normalize applicant, education, and experience facts",
      artifacts: [],
      category: "Structuring",
      completedAt,
      evidence: compactEvidence([
        createPhaseEvidence({
          id: "applicant-name",
          label: "Applicant",
          snippet: review.applicant.name,
          source: reviewRun.provider,
        }),
        createPhaseEvidence({
          id: "education-entry",
          label: "Education",
          snippet: educationSummary,
          source: reviewRun.provider,
        }),
        createPhaseEvidence({
          id: "experience-level",
          label: "Experience",
          snippet: formatExperienceSummary(review),
          source: reviewRun.provider,
        }),
      ]),
      id: "profile-extraction",
      status: "completed",
      subAgents: [
        {
          findings: [
            review.applicant.email
              ? `Email: ${review.applicant.email}`
              : "Email missing",
            educationSummary
              ? `Education: ${educationSummary}`
              : "No structured education entry",
            formatExperienceSummary(review),
          ].filter(Boolean),
          id: "profile-structurer",
          model: reviewRun.model,
          name: "Profile Structurer",
          provider: reviewRun.provider,
          status: "completed",
          summary:
            "Separated applicant identity, education, and experience facts.",
        },
      ],
      summary: `Structured ${review.education.entries.length} education entr${
        review.education.entries.length === 1 ? "y" : "ies"
      } and ${formatExperienceLevel(review.experience.level)} experience signals.`,
      title: "Profile extraction",
    },
    {
      action: "Extract and categorize complete technical skill inventory",
      artifacts: [],
      category: "Taxonomy",
      completedAt,
      evidence: compactEvidence([
        createPhaseEvidence({
          id: "skill-count",
          label: "Skills extracted",
          snippet: `${allSkillNames.length}`,
          source: reviewRun.provider,
        }),
        createPhaseEvidence({
          id: "matched-skills",
          label: "Matched skills",
          snippet: formatList(review.skills.matched, 10),
          source: reviewRun.provider,
        }),
        createPhaseEvidence({
          id: "all-skills",
          label: "Skill inventory",
          snippet: formatList(allSkillNames, 16),
          source: reviewRun.provider,
        }),
      ]),
      id: "skills-extraction",
      status: "completed",
      subAgents: [
        {
          findings: [
            `${allSkillNames.length} total skills`,
            `${review.skills.matched.length} matched skills`,
            ...categoryFindings,
          ].slice(0, 8),
          id: "skills-taxonomy-agent",
          model: reviewRun.model,
          name: "Skills Taxonomy Agent",
          provider: reviewRun.provider,
          status: "completed",
          summary:
            "Created categorized skill inventory and job-matched subset.",
        },
      ],
      summary: `Extracted ${allSkillNames.length} total skills; ${review.skills.matched.length} matched this job.`,
      title: "Skills taxonomy",
    },
    {
      action: "Verify evidence quality and candidate risk flags",
      artifacts: [],
      category: "Verification",
      completedAt,
      evidence: compactEvidence([
        createPhaseEvidence({
          id: "verification",
          label: "Verification",
          snippet: formatList(review.skills.verification, 6),
          source: reviewRun.provider,
        }),
        createPhaseEvidence({
          id: "risk-flags",
          label: "Risk flags",
          snippet: formatList(
            review.risks.redFlags.map((flag) => flag.message),
            6,
          ),
          source: reviewRun.provider,
        }),
      ]),
      id: "evidence-verification",
      status: "completed",
      subAgents: [
        {
          findings: verificationFindings.slice(0, 8),
          id: "evidence-verifier",
          model: reviewRun.model,
          name: "Evidence Verifier",
          provider: reviewRun.provider,
          status: "completed",
          summary:
            "Checked extracted claims against resume evidence and risk rules.",
        },
      ],
      summary: `Verified evidence with ${review.risks.redFlags.length} risk flag${
        review.risks.redFlags.length === 1 ? "" : "s"
      }.`,
      title: "Evidence verification",
    },
    {
      action: "Score candidate fit and produce review artifacts",
      artifacts: [
        {
          id: "resume-result",
          name: "Stored resume result",
          type: "json",
        },
      ],
      category: "Review",
      completedAt,
      evidence: [
        {
          id: "final-score",
          label: "Final score",
          snippet: review.finalScore.toString(),
          source: reviewRun.provider,
        },
        {
          id: "decision",
          label: "Decision",
          snippet: review.decision,
          source: reviewRun.provider,
        },
      ],
      id: "candidate-review",
      status: "completed",
      subAgents: [
        {
          findings: [
            `Decision: ${review.decision}`,
            `Score: ${review.finalScore}`,
            ...review.risks.redFlags.map(
              (flag) => `${flag.severity}: ${flag.message}`,
            ),
          ].slice(0, 8),
          id: "resume-review-agent",
          model: reviewRun.model,
          name: "Resume Review Agent",
          provider: reviewRun.provider,
          status: "completed",
          summary: review.summary,
        },
      ],
      summary: review.summary,
      title: "Candidate review",
    },
  ];
}

function classifyWorkflowFailure(error: string): WorkflowFailureCategory {
  const value = error.toLowerCase();

  if (/\b(rate|429|quota|too many requests)\b/.test(value)) {
    return "rate_limit";
  }
  if (/\b(timeout|timed out|aborted)\b/.test(value)) return "timeout";
  if (/\b(ocr|tesseract|canvas|image)\b/.test(value)) return "ocr";
  if (/\b(extract|pdf|docx|mammoth|text)\b/.test(value)) {
    return "extraction";
  }
  if (/\b(groq|model|llm|schema|json|parse)\b/.test(value)) return "model";
  if (/\b(validate|validation|zod|invalid)\b/.test(value)) {
    return "validation";
  }
  if (/\b(crawl|github|portfolio|profile|url)\b/.test(value)) return "crawl";
  if (/\b(database|postgres|neon|drizzle|db)\b/.test(value)) return "db";
  return "workflow";
}

function createPhaseEvidence({
  id,
  label,
  snippet,
  source,
}: {
  id: string;
  label: string;
  snippet?: string | null;
  source: string;
}): AgentRunPhaseEvidence | null {
  if (!snippet?.trim()) return null;

  return {
    id,
    label,
    snippet: snippet.trim(),
    source,
  };
}

function compactEvidence(
  evidence: Array<AgentRunPhaseEvidence | null>,
): AgentRunPhaseEvidence[] {
  return evidence.filter(
    (item): item is AgentRunPhaseEvidence => item !== null,
  );
}

function formatEducationEntry(
  entry:
    | ResumeReviewRunResult["review"]["education"]["entries"][number]
    | undefined,
) {
  if (!entry) return null;

  const degree = [entry.degree, entry.field].filter(Boolean).join(" in ");
  const school = entry.institution;
  const details = [degree || null, school].filter(Boolean).join(" - ");

  return [details, formatGpa(entry.gpa)].filter(Boolean).join(" | ") || null;
}

function formatGpa(value: string | null | undefined) {
  if (!value) return null;
  return /\b(?:cgpa|gpa)\b/i.test(value) ? value : `CGPA: ${value}`;
}

function formatExperienceSummary(review: ResumeReviewRunResult["review"]) {
  const years = review.experience.yearsEstimate;
  const yearsLabel =
    years == null
      ? "unknown years"
      : years < 1
        ? "<1 year"
        : `${years} ${years === 1 ? "year" : "years"}`;

  return `${formatExperienceLevel(review.experience.level)}, ${yearsLabel}`;
}

function formatExperienceLevel(
  level: ResumeReviewRunResult["review"]["experience"]["level"],
) {
  if (level === "unknown") return "unknown-level";
  return `${level}-level`;
}

function summarizeSkillCategories(
  skills: ResumeReviewRunResult["review"]["skills"]["all"],
) {
  const counts = new Map<string, number>();

  for (const skill of skills) {
    counts.set(skill.category, (counts.get(skill.category) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([category, count]) => `${category}: ${count}`);
}

function formatList(values: string[], limit: number) {
  const cleaned = values
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, limit);

  if (cleaned.length === 0) return null;

  const extra = values.length - cleaned.length;
  return extra > 0
    ? `${cleaned.join(", ")} +${extra} more`
    : cleaned.join(", ");
}

function getResumeAgentRunId(
  resumeId: string,
  attempt = 1,
  uploadBatchId?: string | null,
) {
  if (attempt > 1 || uploadBatchId) {
    return `agent-run-${resumeId}-attempt-${attempt}`;
  }

  return `agent-run-${resumeId}`;
}

async function getNextResumeAgentRunAttempt(
  db: Awaited<ReturnType<typeof getDatabase>>,
  resumeId: string,
) {
  const [latest] = await db
    .select({ attempt: agentRuns.attempt })
    .from(agentRuns)
    .where(eq(agentRuns.resumeId, resumeId))
    .orderBy(desc(agentRuns.attempt))
    .limit(1);
  return Math.max(1, (latest?.attempt ?? 0) + 1);
}

function buildAssessmentVersionManifest(
  reviewRun: ResumeReviewRunResult,
  specialistPhases: ResumeReviewPipelinePhase[] = reviewRun.pipeline.phases,
): AssessmentVersionManifest {
  const specialistModels = Array.from(
    new Set(
      specialistPhases.flatMap((phase) =>
        phase.subAgents
          .map((agent) => agent.model)
          .filter((model): model is string => Boolean(model)),
      ),
    ),
  );
  const specialistProviders = Array.from(
    new Set(
      specialistPhases.flatMap((phase) =>
        phase.subAgents.map((agent) => agent.provider).filter(Boolean),
      ),
    ),
  );

  return {
    agentVersion: RESUME_REVIEW_AGENT_VERSION,
    assessmentSchemaVersion: ASSESSMENT_SCHEMA_VERSION,
    fallbackReason: reviewRun.fallbackReason,
    model: reviewRun.model,
    outputMode: reviewRun.pipeline.outputMode,
    pipelineStrategy: reviewRun.pipeline.strategy,
    prompts: {
      master: RESUME_MASTER_PROMPT_VERSION,
      specialist: RESUME_SPECIALIST_PROMPT_VERSION,
    },
    provider: reviewRun.provider,
    repairedOutput: reviewRun.pipeline.repairedOutput,
    scoringVersion: RESUME_SCORING_VERSION,
    specialistModels,
    specialistProviders,
    warnings: reviewRun.pipeline.warnings,
  };
}

function getWorkflowRunId(phases: unknown) {
  if (!phases || typeof phases !== "object" || Array.isArray(phases)) {
    return null;
  }

  const workflowRunId = (phases as Record<string, unknown>).workflowRunId;
  return typeof workflowRunId === "string" ? workflowRunId : null;
}

async function getExistingRunPhases(agentRunId: string) {
  const db = await getDatabase();
  const [run] = await db
    .select({ phases: agentRuns.phases })
    .from(agentRuns)
    .where(eq(agentRuns.id, agentRunId))
    .limit(1);

  return normalizeRunPhases(run?.phases);
}

function normalizeRunPhases(phases: unknown): {
  items: AgentRunPhase[];
  workflowRunId?: string;
} {
  if (Array.isArray(phases)) {
    return {
      items: phases.filter(isAgentRunPhase),
    };
  }

  if (phases && typeof phases === "object") {
    const record = phases as Record<string, unknown>;
    return {
      items: Array.isArray(record.items)
        ? record.items.filter(isAgentRunPhase)
        : [],
      workflowRunId:
        typeof record.workflowRunId === "string"
          ? record.workflowRunId
          : undefined,
    };
  }

  return { items: [] };
}

function upsertRunPhase(phases: AgentRunPhase[], phase: AgentRunPhase) {
  const nextPhases = phases.filter((item) => item.id !== phase.id);
  nextPhases.push(phase);
  return nextPhases;
}

function upsertRunPhases(phases: AgentRunPhase[], next: AgentRunPhase[]) {
  return next.reduce(upsertRunPhase, phases);
}

async function refreshResumeUploadBatchCounts(batchId: string) {
  const db = await getDatabase();
  const items = await db
    .select({ status: resumeUploadItems.status })
    .from(resumeUploadItems)
    .where(eq(resumeUploadItems.batchId, batchId));
  const counts = summarizeBatchItemCounts(items);

  await db
    .update(resumeUploadBatches)
    .set({
      ...counts,
      status: resolveBatchStatus(counts),
    })
    .where(eq(resumeUploadBatches.id, batchId));
}

function isAgentRunPhase(value: unknown): value is AgentRunPhase {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    typeof (value as AgentRunPhase).id === "string" &&
    typeof (value as AgentRunPhase).title === "string"
  );
}

function toIsoString(value: Date | string | null | undefined) {
  if (!value) return undefined;
  if (value instanceof Date) return value.toISOString();

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}
