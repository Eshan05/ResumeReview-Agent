import { sql } from "drizzle-orm";
import {
  index,
  integer,
  json,
  pgTable,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type {
  AssessmentInputHashes,
  AssessmentRubricSnapshot,
  AssessmentVersionManifest,
} from "@/lib/resumes/assessment";
import { timestamp } from "./columns";
import { resumes } from "./resumes.schema";

export const resumeResults = pgTable(
  "resume_results",
  {
    id: text("id").primaryKey(),
    resumeId: text("resume_id")
      .notNull()
      .references(() => resumes.id),
    agentRunId: text("agent_run_id"),
    applicantInfo: json("applicant_info"),
    education: json("education"),
    certifications: json("certifications"),
    skills: json("skills"),
    experience: json("experience"),
    projects: json("projects"),
    githubData: json("github_data"),
    platformData: json("platform_data"),
    redFlags: json("red_flags"),
    skillVerification: json("skill_verification"),
    projectMatches: json("project_matches"),
    finalScore: integer("final_score"),
    rank: integer("rank"),
    summary: text("summary"),
    inputHashes: json("input_hashes").$type<AssessmentInputHashes>(),
    modelVersions: json("model_versions").$type<AssessmentVersionManifest>(),
    rubricSnapshot: json("rubric_snapshot").$type<AssessmentRubricSnapshot>(),
    createdAt: timestamp("created_at"),
  },
  (table) => [
    uniqueIndex("resume_results_agent_run_unique_idx")
      .on(table.agentRunId)
      .where(sql`${table.agentRunId} is not null`),
    index("resume_results_latest_idx").on(
      table.resumeId,
      table.createdAt.desc(),
      table.id,
    ),
  ],
);
