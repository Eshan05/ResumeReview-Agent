import { text, json, pgTable } from "drizzle-orm/pg-core";
import { users } from "../auth.schema";
import { resumes } from "./resumes.schema";
import { jobPostings } from "./job-postings.schema";
import { timestamp } from "./columns";

export const emailLogs = pgTable("email_logs", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => users.id),
  resumeId: text("resume_id").references(() => resumes.id),
  jobPostingId: text("job_posting_id").references(() => jobPostings.id),
  recipientEmail: text("recipient_email").notNull(),
  emailType: text("email_type").notNull(),
  subject: text("subject").notNull(),
  status: text("status").notNull().default("sent"),
  metadata: json("metadata"),
  createdAt: timestamp("created_at"),
});
