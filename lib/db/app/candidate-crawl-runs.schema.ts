import { index, integer, json, pgTable, text } from "drizzle-orm/pg-core";
import { timestamp, timestampNullable, updatedTimestamp } from "./columns";
import { jobPostings } from "./job-postings.schema";
import { resumes } from "./resumes.schema";

export type CandidateCrawlRunStatus =
  | "completed"
  | "failed"
  | "queued"
  | "running"
  | "skipped"
  | "triggered";

export const candidateCrawlRuns = pgTable(
  "candidate_crawl_runs",
  {
    id: text("id").primaryKey(),
    chunksIndexed: integer("chunks_indexed").notNull().default(0),
    completedAt: timestampNullable("completed_at"),
    createdAt: timestamp("created_at"),
    error: text("error"),
    jobPostingId: text("job_posting_id")
      .notNull()
      .references(() => jobPostings.id),
    reason: text("reason"),
    resumeId: text("resume_id")
      .notNull()
      .references(() => resumes.id),
    startedAt: timestampNullable("started_at"),
    status: text("status").$type<CandidateCrawlRunStatus>().notNull(),
    updatedAt: updatedTimestamp("updated_at"),
    urls: json("urls").$type<string[]>().notNull().default([]),
    workflowRunId: text("workflow_run_id"),
  },
  (table) => [
    index("candidate_crawl_runs_job_idx").on(table.jobPostingId),
    index("candidate_crawl_runs_resume_idx").on(table.resumeId),
    index("candidate_crawl_runs_status_idx").on(table.status),
    index("candidate_crawl_runs_workflow_idx").on(table.workflowRunId),
  ],
);
