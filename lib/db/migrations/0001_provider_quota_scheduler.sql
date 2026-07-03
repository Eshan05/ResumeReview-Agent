CREATE TABLE IF NOT EXISTS "ai_provider_quota_reservations" (
  "id" text PRIMARY KEY NOT NULL,
  "actual_input_tokens" integer,
  "actual_output_tokens" integer,
  "blocked_until" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "error_code" text,
  "estimated_tokens" integer NOT NULL,
  "metadata" json,
  "model" text NOT NULL,
  "provider" text NOT NULL,
  "request_key" text NOT NULL,
  "request_kind" text NOT NULL,
  "reserved_at" timestamp with time zone DEFAULT now() NOT NULL,
  "status" text DEFAULT 'reserved' NOT NULL
);

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_provider_quota_scope_time_idx"
  ON "ai_provider_quota_reservations" ("provider", "model", "reserved_at");

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_provider_quota_request_key_idx"
  ON "ai_provider_quota_reservations" ("request_key");
