import { bigint, index, integer, pgTable, text } from "drizzle-orm/pg-core";
import { timestamp, timestampNullable, updatedTimestamp } from "./columns";
import { jobPostings } from "./job-postings.schema";
import { resumeUploadBatches } from "./resume-upload-batches.schema";
import { resumes } from "./resumes.schema";

export type ResumeUploadItemStatus =
  | "cancelled"
  | "completed"
  | "created"
  | "dispatching"
  | "failed"
  | "processing"
  | "queued"
  | "rejected"
  | "uploaded"
  | "uploading";

export type ResumeUploadItemPreflightStatus = "accepted" | "rejected";
export type ResumeUploadItemUploadStatus =
  | "failed"
  | "pending"
  | "uploaded"
  | "uploading";
export type ResumeUploadItemWorkflowStatus =
  | "completed"
  | "dispatching"
  | "failed"
  | "not_started"
  | "processing"
  | "queued"
  | "skipped";

export const resumeUploadItems = pgTable(
  "resume_upload_items",
  {
    id: text("id").primaryKey(),
    agentRunId: text("agent_run_id"),
    attempt: integer("attempt").notNull().default(0),
    batchId: text("batch_id")
      .notNull()
      .references(() => resumeUploadBatches.id),
    claimToken: text("claim_token"),
    claimedAt: timestampNullable("claimed_at"),
    completedAt: timestampNullable("completed_at"),
    createdAt: timestamp("created_at"),
    failureCategory: text("failure_category"),
    fileKey: text("file_key"),
    fileName: text("file_name").notNull(),
    fileSize: integer("file_size"),
    fileType: text("file_type").notNull(),
    fileUrl: text("file_url"),
    jobPostingId: text("job_posting_id")
      .notNull()
      .references(() => jobPostings.id),
    lastError: text("last_error"),
    lastModified: bigint("last_modified", { mode: "number" }),
    nextRetryAt: timestampNullable("next_retry_at"),
    preflightIssue: text("preflight_issue"),
    preflightStatus: text("preflight_status")
      .$type<ResumeUploadItemPreflightStatus>()
      .notNull(),
    resumeId: text("resume_id").references(() => resumes.id),
    status: text("status")
      .$type<ResumeUploadItemStatus>()
      .notNull()
      .default("created"),
    updatedAt: updatedTimestamp("updated_at"),
    uploadStatus: text("upload_status")
      .$type<ResumeUploadItemUploadStatus>()
      .notNull()
      .default("pending"),
    workflowRunId: text("workflow_run_id"),
    workflowStatus: text("workflow_status")
      .$type<ResumeUploadItemWorkflowStatus>()
      .notNull()
      .default("not_started"),
  },
  (table) => [
    index("resume_upload_items_agent_run_idx").on(table.agentRunId),
    index("resume_upload_items_batch_status_idx").on(
      table.batchId,
      table.status,
    ),
    index("resume_upload_items_dispatch_idx").on(
      table.batchId,
      table.workflowStatus,
      table.nextRetryAt,
    ),
    index("resume_upload_items_job_idx").on(table.jobPostingId),
    index("resume_upload_items_resume_idx").on(table.resumeId),
    index("resume_upload_items_workflow_idx").on(table.workflowRunId),
  ],
);
