import { text, integer, json, pgTable } from "drizzle-orm/pg-core";
import { resumes } from "./resumes.schema";
import { timestamp } from "./columns";

export const resumeResults = pgTable("resume_results", {
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
  modelVersions: json("model_versions"),
  createdAt: timestamp("created_at"),
});
