ALTER TABLE "resume_results"
  ADD COLUMN IF NOT EXISTS "input_hashes" json,
  ADD COLUMN IF NOT EXISTS "rubric_snapshot" json;

CREATE UNIQUE INDEX IF NOT EXISTS "resume_results_agent_run_unique_idx"
  ON "resume_results" ("agent_run_id")
  WHERE "agent_run_id" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "resume_results_latest_idx"
  ON "resume_results" ("resume_id", "created_at" DESC, "id");
