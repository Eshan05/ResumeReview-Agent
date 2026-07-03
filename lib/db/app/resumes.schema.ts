import { integer, pgTable, text } from "drizzle-orm/pg-core";
import { users } from "../auth.schema";
import { timestamp } from "./columns";
import { jobPostings } from "./job-postings.schema";

export const resumes = pgTable("resumes", {
  id: text("id").primaryKey(),
  jobPostingId: text("job_posting_id")
    .notNull()
    .references(() => jobPostings.id),
  fileName: text("file_name").notNull(),
  fileUrl: text("file_url").notNull(),
  fileType: text("file_type").notNull(),
  fileSize: integer("file_size"),
  uploadBatchId: text("upload_batch_id"),
  uploadFileKey: text("upload_file_key"),
  uploadAttempt: integer("upload_attempt"),
  uploadedBy: text("uploaded_by")
    .notNull()
    .references(() => users.id),
  applicantName: text("applicant_name"),
  applicantEmail: text("applicant_email"),
  rawText: text("raw_text"),
  status: text("status").notNull().default("uploaded"),
  createdAt: timestamp("created_at"),
});
