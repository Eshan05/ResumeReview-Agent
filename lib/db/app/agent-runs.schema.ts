import { index, integer, json, pgTable, text } from "drizzle-orm/pg-core";
import { timestamp, timestampNullable } from "./columns";
import { jobPostings } from "./job-postings.schema";
import { resumeUploadBatches } from "./resume-upload-batches.schema";
import { resumes } from "./resumes.schema";

export const agentRuns = pgTable(
  "agent_runs",
  {
    id: text("id").primaryKey(),
    attempt: integer("attempt").notNull().default(1),
    completedAt: timestampNullable("completed_at"),
    currentPhase: text("current_phase"),
    error: text("error"),
    failureCategory: text("failure_category"),
    jobPostingId: text("job_posting_id")
      .notNull()
      .references(() => jobPostings.id),
    lastHeartbeatAt: timestampNullable("last_heartbeat_at"),
    modelVersions: json("model_versions"),
    nextRetryAt: timestampNullable("next_retry_at"),
    phases: json("phases").notNull().default({}),
    queuedAt: timestampNullable("queued_at"),
    resumeId: text("resume_id")
      .notNull()
      .references(() => resumes.id),
    retryCount: integer("retry_count").notNull().default(0),
    startedAt: timestamp("started_at"),
    status: text("status").notNull().default("running"),
    tokenUsage: json("token_usage"),
    uploadBatchId: text("upload_batch_id").references(
      () => resumeUploadBatches.id,
    ),
    workflowRunId: text("workflow_run_id"),
  },
  (table) => [
    index("agent_runs_batch_idx").on(table.uploadBatchId),
    index("agent_runs_job_idx").on(table.jobPostingId),
    index("agent_runs_resume_attempt_idx").on(table.resumeId, table.attempt),
    index("agent_runs_retry_idx").on(table.status, table.nextRetryAt),
    index("agent_runs_workflow_idx").on(table.workflowRunId),
  ],
);
