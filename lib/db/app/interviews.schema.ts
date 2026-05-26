import { text, integer, timestamp as pgTimestamp, pgTable } from "drizzle-orm/pg-core";
import { users } from "../auth.schema";
import { resumes } from "./resumes.schema";
import { jobPostings } from "./job-postings.schema";
import { timestamp } from "./columns";

export const interviews = pgTable("interviews", {
  id: text("id").primaryKey(),
  resumeId: text("resume_id")
    .notNull()
    .references(() => resumes.id),
  jobPostingId: text("job_posting_id")
    .notNull()
    .references(() => jobPostings.id),
  scheduledBy: text("scheduled_by")
    .notNull()
    .references(() => users.id),
  scheduledAt: pgTimestamp("scheduled_at").notNull(),
  durationMinutes: integer("duration_minutes").default(30),
  interviewType: text("interview_type").default("video"),
  meetingUrl: text("meeting_url"),
  status: text("status").notNull().default("scheduled"),
  notes: text("notes"),
  createdAt: timestamp("created_at"),
});
