import { text, json, timestamp as pgTimestamp, pgTable } from "drizzle-orm/pg-core";
import { users, organizations } from "../auth.schema";
import { timestamp, updatedTimestamp } from "./columns";

export const jobPostings = pgTable("job_postings", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  organizationId: text("organization_id").references(
    () => organizations.id,
  ),
  title: text("title").notNull(),
  description: text("description").notNull(),
  weights: json("weights")
    .$type<{
      skills: number;
      experience: number;
      projects: number;
      trust: number;
    }>()
    .notNull()
    .default({ skills: 40, experience: 30, projects: 20, trust: 10 }),
  location: text("location"),
  employmentType: text("employment_type").default("full_time"),
  deadline: pgTimestamp("deadline"),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at"),
  updatedAt: updatedTimestamp("updated_at"),
});
