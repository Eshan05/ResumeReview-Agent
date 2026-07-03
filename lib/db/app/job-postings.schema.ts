import {
  json,
  pgTable,
  timestamp as pgTimestamp,
  text,
} from "drizzle-orm/pg-core";
import {
  DEFAULT_JOB_CRITERIA,
  DEFAULT_JOB_WEIGHTS,
  type JobCriteria,
  type JobWeights,
} from "@/lib/jobs/criteria";
import { organizations, users } from "../auth.schema";
import { timestamp, updatedTimestamp } from "./columns";

export const jobPostings = pgTable("job_postings", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  organizationId: text("organization_id").references(() => organizations.id),
  title: text("title").notNull(),
  description: text("description").notNull(),
  weights: json("weights")
    .$type<JobWeights>()
    .notNull()
    .default(DEFAULT_JOB_WEIGHTS),
  criteria: json("criteria")
    .$type<JobCriteria>()
    .notNull()
    .default(DEFAULT_JOB_CRITERIA),
  location: text("location"),
  employmentType: text("employment_type").default("full_time"),
  deadline: pgTimestamp("deadline"),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at"),
  updatedAt: updatedTimestamp("updated_at"),
});
