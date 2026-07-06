import { and, asc, eq, inArray, sql } from "drizzle-orm";
import {
  jobPostings,
  resumeUploadBatches,
  resumeUploadItems,
} from "@/lib/db/app";
import { users } from "@/lib/db/auth.schema";
import {
  createResumeAgentRun,
  type ResumeReviewWorkflowPayload,
} from "@/lib/resumes/service";
import { triggerResumeReviewWorkflow } from "@/lib/workflows/resume-review";
import {
  getNextRetryAt,
  RESUME_BATCH_DISPATCH_LIMIT,
  RESUME_BATCH_MAX_ATTEMPTS,
  resolveBatchStatus,
  shouldRetryWorkflowFailure,
  summarizeBatchItemCounts,
} from "./policy";

export interface ResumeBatchFileInput {
  id: string;
  lastModified?: number;
  name: string;
  preflightIssue?: string;
  preflightStatus: "accepted" | "rejected";
  size?: number;
  type: string;
}

export interface CreateResumeUploadBatchInput {
  files: ResumeBatchFileInput[];
  id: string;
  jobId: string;
  uploadedBy: string;
}

export interface DispatchResumeUploadBatchOptions {
  baseUrl?: string;
  forceRetryFailed?: boolean;
  limit?: number;
}

interface ClaimedUploadItem {
  attempt: number;
  batchId: string;
  fileKey: string | null;
  id: string;
  jobPostingId: string;
  resumeId: string | null;
}

async function getDatabase() {
  const { db } = await import("@/lib/db/db");
  return db;
}

export async function createResumeUploadBatch(
  input: CreateResumeUploadBatchInput,
) {
  const db = await getDatabase();
  await ensureLocalBatchReferences(input);

  const counts = summarizeBatchItemCounts(
    input.files.map((file) => ({
      status: file.preflightStatus === "rejected" ? "rejected" : "created",
    })),
  );

  const [batch] = await db
    .insert(resumeUploadBatches)
    .values({
      id: input.id,
      ...counts,
      jobPostingId: input.jobId,
      status: resolveBatchStatus(counts),
      uploadedBy: input.uploadedBy,
    })
    .onConflictDoUpdate({
      target: resumeUploadBatches.id,
      set: {
        ...counts,
        jobPostingId: input.jobId,
        lastError: null,
        status: resolveBatchStatus(counts),
        uploadedBy: input.uploadedBy,
      },
    })
    .returning();

  if (input.files.length > 0) {
    await db
      .insert(resumeUploadItems)
      .values(
        input.files.map((file) => ({
          id: file.id,
          batchId: input.id,
          fileName: file.name,
          fileSize: file.size,
          fileType: file.type,
          jobPostingId: input.jobId,
          lastModified: file.lastModified,
          preflightIssue: file.preflightIssue,
          preflightStatus: file.preflightStatus,
          status:
            file.preflightStatus === "rejected"
              ? ("rejected" as const)
              : ("created" as const),
          uploadStatus: "pending" as const,
          workflowStatus:
            file.preflightStatus === "rejected"
              ? ("skipped" as const)
              : ("not_started" as const),
        })),
      )
      .onConflictDoUpdate({
        target: resumeUploadItems.id,
        set: {
          batchId: input.id,
          failureCategory: null,
          jobPostingId: input.jobId,
          lastError: null,
          nextRetryAt: null,
          preflightStatus: sql`excluded.preflight_status`,
          preflightIssue: sql`excluded.preflight_issue`,
          status: sql`excluded.status`,
          uploadStatus: sql`excluded.upload_status`,
          workflowStatus: sql`excluded.workflow_status`,
        },
      });
  }

  return batch;
}

export async function getResumeUploadBatch(batchId: string) {
  const db = await getDatabase();
  const [batch] = await db
    .select()
    .from(resumeUploadBatches)
    .where(eq(resumeUploadBatches.id, batchId))
    .limit(1);

  if (!batch) return null;

  const items = await db
    .select()
    .from(resumeUploadItems)
    .where(eq(resumeUploadItems.batchId, batchId))
    .orderBy(asc(resumeUploadItems.createdAt));
  const counts = summarizeBatchItemCounts(items);

  return {
    batch: {
      ...batch,
      ...counts,
      status: resolveBatchStatus(counts),
    },
    items,
  };
}

export async function markResumeUploadItemUploaded({
  batchId,
  fileKey,
  fileUrl,
  itemId,
  resumeId,
}: {
  batchId: string;
  fileKey: string;
  fileUrl: string;
  itemId: string;
  resumeId: string;
}) {
  const db = await getDatabase();
  await db
    .update(resumeUploadItems)
    .set({
      fileKey,
      fileUrl,
      lastError: null,
      resumeId,
      status: "uploaded",
      uploadStatus: "uploaded",
      workflowStatus: "not_started",
    })
    .where(eq(resumeUploadItems.id, itemId));

  await refreshResumeUploadBatchCounts(batchId);
}

export async function cancelResumeUploadBatch(batchId: string) {
  const db = await getDatabase();
  await db
    .update(resumeUploadBatches)
    .set({
      cancelledAt: new Date(),
      status: "cancelled",
    })
    .where(eq(resumeUploadBatches.id, batchId));

  await db
    .update(resumeUploadItems)
    .set({
      lastError: "Batch cancelled before dispatch.",
      status: "cancelled",
      workflowStatus: "skipped",
    })
    .where(
      and(
        eq(resumeUploadItems.batchId, batchId),
        inArray(resumeUploadItems.status, [
          "created",
          "uploaded",
          "queued",
          "dispatching",
        ]),
      ),
    );

  await refreshResumeUploadBatchCounts(batchId);
}

export async function dispatchResumeUploadBatch(
  batchId: string,
  options: DispatchResumeUploadBatchOptions = {},
) {
  const db = await getDatabase();
  const batchState = await getResumeUploadBatch(batchId);
  if (!batchState) {
    return { claimed: 0, failed: 0, queued: 0, status: "not_found" as const };
  }
  if (batchState.batch.status === "cancelled") {
    return { claimed: 0, failed: 0, queued: 0, status: "cancelled" as const };
  }

  const claimToken = crypto.randomUUID();
  const claimedItems = await claimDispatchableItems({
    batchId,
    claimToken,
    forceRetryFailed: options.forceRetryFailed ?? false,
    limit: options.limit ?? RESUME_BATCH_DISPATCH_LIMIT,
  });
  let queued = 0;
  let failed = 0;

  for (const item of claimedItems) {
    if (!item.resumeId || !item.fileKey) {
      failed += 1;
      await markItemDispatchFailed({
        category: "workflow",
        error: "Uploaded resume item is missing resume id or file key.",
        itemId: item.id,
      });
      continue;
    }

    const attempt = item.attempt + 1;
    const agentRun = await createResumeAgentRun({
      attempt,
      jobId: item.jobPostingId,
      resumeId: item.resumeId,
      uploadBatchId: item.batchId,
    });
    const payload: ResumeReviewWorkflowPayload = {
      agentRunId: agentRun.id,
      fileKey: item.fileKey,
      jobId: item.jobPostingId,
      resumeId: item.resumeId,
    };
    const workflowRunId = `resume-review-${agentRun.id}`;
    const workflow = await triggerResumeReviewWorkflow(payload, {
      baseUrl: options.baseUrl,
      workflowRunId,
    });

    if (workflow.status === "triggered") {
      queued += 1;
      await db
        .update(resumeUploadItems)
        .set({
          agentRunId: agentRun.id,
          attempt,
          claimToken,
          failureCategory: null,
          lastError: null,
          nextRetryAt: null,
          status: "queued",
          workflowRunId: workflow.workflowRunId,
          workflowStatus: "queued",
        })
        .where(eq(resumeUploadItems.id, item.id));
    } else {
      failed += 1;
      await markItemDispatchFailed({
        category: "workflow",
        error:
          workflow.status === "failed"
            ? workflow.error
            : (workflow.reason ?? "Workflow dispatch was skipped."),
        itemId: item.id,
      });
    }
  }

  await refreshResumeUploadBatchCounts(batchId);

  return {
    claimed: claimedItems.length,
    failed,
    queued,
    status: "dispatched" as const,
  };
}

export async function markBatchItemWorkflowQueued({
  agentRunId,
  workflowRunId,
}: {
  agentRunId: string;
  workflowRunId: string;
}) {
  const db = await getDatabase();
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
}

export async function markBatchItemWorkflowProcessing(agentRunId: string) {
  const db = await getDatabase();
  await db
    .update(resumeUploadItems)
    .set({
      status: "processing",
      workflowStatus: "processing",
    })
    .where(eq(resumeUploadItems.agentRunId, agentRunId));
}

export async function markBatchItemWorkflowCompleted(agentRunId: string) {
  const db = await getDatabase();
  const [item] = await db
    .update(resumeUploadItems)
    .set({
      completedAt: new Date(),
      lastError: null,
      nextRetryAt: null,
      status: "completed",
      workflowStatus: "completed",
    })
    .where(eq(resumeUploadItems.agentRunId, agentRunId))
    .returning({ batchId: resumeUploadItems.batchId });

  if (item?.batchId) await refreshResumeUploadBatchCounts(item.batchId);
}

export async function markBatchItemWorkflowFailed({
  agentRunId,
  attempt,
  category,
  error,
}: {
  agentRunId: string;
  attempt: number;
  category: string;
  error: string;
}) {
  const db = await getDatabase();
  const retryable = shouldRetryWorkflowFailure({ attempt, category });
  const [item] = await db
    .update(resumeUploadItems)
    .set({
      failureCategory: category,
      lastError: error,
      nextRetryAt: retryable ? getNextRetryAt(attempt) : null,
      status: "failed",
      workflowStatus: "failed",
    })
    .where(eq(resumeUploadItems.agentRunId, agentRunId))
    .returning({ batchId: resumeUploadItems.batchId });

  if (item?.batchId) await refreshResumeUploadBatchCounts(item.batchId);
}

export async function recoverStaleResumeUploadItems(batchId?: string) {
  const db = await getDatabase();
  const staleBefore = new Date(Date.now() - 15 * 60_000);
  const rows = await db
    .select()
    .from(resumeUploadItems)
    .where(
      batchId
        ? eq(resumeUploadItems.batchId, batchId)
        : inArray(resumeUploadItems.status, ["queued", "dispatching"]),
    );
  const staleItems = rows.filter((item) => {
    if (item.status === "dispatching" && item.claimedAt) {
      return item.claimedAt < staleBefore;
    }
    if (item.status === "queued" && !item.workflowRunId) return true;
    return false;
  });

  if (staleItems.length > 0) {
    await db
      .update(resumeUploadItems)
      .set({
        claimToken: null,
        claimedAt: null,
        lastError: "Recovered stale dispatch state.",
        status: "uploaded",
        workflowStatus: "not_started",
      })
      .where(
        inArray(
          resumeUploadItems.id,
          staleItems.map((item) => item.id),
        ),
      );
  }

  const batchIds = Array.from(new Set(staleItems.map((item) => item.batchId)));
  await Promise.all(batchIds.map(refreshResumeUploadBatchCounts));

  return {
    recovered: staleItems.length,
    scanned: rows.length,
  };
}

async function claimDispatchableItems({
  batchId,
  claimToken,
  forceRetryFailed,
  limit,
}: {
  batchId: string;
  claimToken: string;
  forceRetryFailed: boolean;
  limit: number;
}): Promise<ClaimedUploadItem[]> {
  const db = await getDatabase();
  const retryCondition = forceRetryFailed
    ? sql`or (status = 'failed' and workflow_status = 'failed' and attempt < ${RESUME_BATCH_MAX_ATTEMPTS})`
    : sql`or (status = 'failed' and workflow_status = 'failed' and next_retry_at is not null and next_retry_at <= now() and attempt < ${RESUME_BATCH_MAX_ATTEMPTS})`;

  const result = await db.execute(sql`
    with claim as (
      select id
      from resume_upload_items
      where batch_id = ${batchId}
        and upload_status = 'uploaded'
        and (
          (status = 'uploaded' and workflow_status = 'not_started')
          ${retryCondition}
        )
      order by created_at asc
      limit ${Math.max(1, limit)}
    )
    update resume_upload_items
    set
      status = 'dispatching',
      workflow_status = 'dispatching',
      claim_token = ${claimToken},
      claimed_at = now(),
      updated_at = now()
    where id in (select id from claim)
      and upload_status = 'uploaded'
      and (
        (status = 'uploaded' and workflow_status = 'not_started')
        ${retryCondition}
      )
    returning
      id,
      batch_id as "batchId",
      job_posting_id as "jobPostingId",
      resume_id as "resumeId",
      file_key as "fileKey",
      attempt
  `);

  return toRows<ClaimedUploadItem>(result);
}

async function markItemDispatchFailed({
  category,
  error,
  itemId,
}: {
  category: string;
  error: string;
  itemId: string;
}) {
  const db = await getDatabase();
  await db
    .update(resumeUploadItems)
    .set({
      failureCategory: category,
      lastError: error,
      status: "failed",
      workflowStatus: "failed",
    })
    .where(eq(resumeUploadItems.id, itemId));
}

async function refreshResumeUploadBatchCounts(batchId: string) {
  const db = await getDatabase();
  const items = await db
    .select({ status: resumeUploadItems.status })
    .from(resumeUploadItems)
    .where(eq(resumeUploadItems.batchId, batchId));
  const counts = summarizeBatchItemCounts(items);
  const status = resolveBatchStatus(counts);

  await db
    .update(resumeUploadBatches)
    .set({
      ...counts,
      completedAt:
        status === "completed" || status === "failed" || status === "partial"
          ? new Date()
          : null,
      status,
    })
    .where(eq(resumeUploadBatches.id, batchId));
}

async function ensureLocalBatchReferences(input: CreateResumeUploadBatchInput) {
  if (process.env.NODE_ENV === "production") return;

  const db = await getDatabase();
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
      description:
        "Development job posting created for local resume batch upload testing.",
      status: "active",
      title: "Senior Full-Stack Engineer",
      userId: input.uploadedBy,
    })
    .onConflictDoNothing();
}

function toRows<T>(result: unknown): T[] {
  const rows = (result as { rows?: unknown[] }).rows;
  return Array.isArray(rows) ? (rows as T[]) : [];
}
