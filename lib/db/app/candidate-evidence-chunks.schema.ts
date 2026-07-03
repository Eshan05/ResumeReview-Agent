import { sql } from "drizzle-orm";
import { index, json, pgTable, text } from "drizzle-orm/pg-core";
import { timestamp, updatedTimestamp } from "./columns";
import { jobPostings } from "./job-postings.schema";
import { resumes } from "./resumes.schema";

export type CandidateEvidenceSourceType =
  | "crawl"
  | "job"
  | "pipeline"
  | "resume"
  | "result";

export const candidateEvidenceChunks = pgTable(
  "candidate_evidence_chunks",
  {
    id: text("id").primaryKey(),
    content: text("content").notNull(),
    contentHash: text("content_hash").notNull(),
    createdAt: timestamp("created_at"),
    jobPostingId: text("job_posting_id")
      .notNull()
      .references(() => jobPostings.id),
    metadata: json("metadata"),
    resumeId: text("resume_id").references(() => resumes.id),
    sourceId: text("source_id").notNull(),
    sourceType: text("source_type")
      .$type<CandidateEvidenceSourceType>()
      .notNull(),
    title: text("title").notNull(),
    updatedAt: updatedTimestamp("updated_at"),
  },
  (table) => [
    index("candidate_evidence_chunks_job_idx").on(table.jobPostingId),
    index("candidate_evidence_chunks_resume_idx").on(table.resumeId),
    index("candidate_evidence_chunks_search_idx").using(
      "gin",
      sql`to_tsvector('english', coalesce(${table.title}, '') || ' ' || coalesce(${table.content}, ''))`,
    ),
    index("candidate_evidence_chunks_source_idx").on(
      table.sourceType,
      table.sourceId,
    ),
  ],
);
