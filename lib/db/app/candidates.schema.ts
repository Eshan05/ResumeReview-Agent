import { text, pgTable } from "drizzle-orm/pg-core";
import { users } from "../auth.schema";
import { resumes } from "./resumes.schema";
import { timestamp, updatedTimestamp } from "./columns";

export const candidateNotes = pgTable("candidate_notes", {
  id: text("id").primaryKey(),
  resumeId: text("resume_id")
    .notNull()
    .references(() => resumes.id),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  content: text("content").notNull(),
  createdAt: timestamp("created_at"),
  updatedAt: updatedTimestamp("updated_at"),
});
