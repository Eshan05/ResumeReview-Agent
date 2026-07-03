import { integer, pgTable, text } from "drizzle-orm/pg-core";
import { users } from "../auth.schema";
import { timestamp, timestampNullable, updatedTimestamp } from "./columns";
import { jobPostings } from "./job-postings.schema";

export type ResumeUploadBatchStatus =
  | "cancelled"
  | "completed"
  | "created"
  | "dispatching"
  | "failed"
  | "partial"
  | "processing"
  | "uploading";

export const resumeUploadBatches = pgTable("resume_upload_batches", {
  id: text("id").primaryKey(),
  acceptedCount: integer("accepted_count").notNull().default(0),
  cancelledAt: timestampNullable("cancelled_at"),
  cancelledCount: integer("cancelled_count").notNull().default(0),
  completedAt: timestampNullable("completed_at"),
  completedCount: integer("completed_count").notNull().default(0),
  createdAt: timestamp("created_at"),
  dispatchParallelism: integer("dispatch_parallelism").notNull().default(4),
  failedCount: integer("failed_count").notNull().default(0),
  jobPostingId: text("job_posting_id")
    .notNull()
    .references(() => jobPostings.id),
  lastError: text("last_error"),
  maxConcurrency: integer("max_concurrency").notNull().default(4),
  queuedCount: integer("queued_count").notNull().default(0),
  rateLimit: integer("rate_limit").notNull().default(24),
  ratePeriodSeconds: integer("rate_period_seconds").notNull().default(60),
  rejectedCount: integer("rejected_count").notNull().default(0),
  runningCount: integer("running_count").notNull().default(0),
  startedAt: timestampNullable("started_at"),
  status: text("status")
    .$type<ResumeUploadBatchStatus>()
    .notNull()
    .default("created"),
  totalCount: integer("total_count").notNull().default(0),
  updatedAt: updatedTimestamp("updated_at"),
  uploadedBy: text("uploaded_by")
    .notNull()
    .references(() => users.id),
  uploadedCount: integer("uploaded_count").notNull().default(0),
});
