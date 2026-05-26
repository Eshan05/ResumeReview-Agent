import { text, json, pgTable } from "drizzle-orm/pg-core";
import { resumes } from "./resumes.schema";
import { jobPostings } from "./job-postings.schema";
import { timestamp, timestampNullable } from "./columns";

export const agentRuns = pgTable("agent_runs", {
  id: text("id").primaryKey(),
  resumeId: text("resume_id")
    .notNull()
    .references(() => resumes.id),
  jobPostingId: text("job_posting_id")
    .notNull()
    .references(() => jobPostings.id),
  status: text("status").notNull().default("running"),
  currentPhase: text("current_phase"),
  phases: json("phases").notNull().default({}),
  modelVersions: json("model_versions"),
  tokenUsage: json("token_usage"),
  startedAt: timestamp("started_at"),
  completedAt: timestampNullable("completed_at"),
  error: text("error"),
});
