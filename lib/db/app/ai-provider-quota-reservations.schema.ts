import {
  index,
  integer,
  json,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const aiProviderQuotaReservations = pgTable(
  "ai_provider_quota_reservations",
  {
    id: text("id").primaryKey(),
    actualInputTokens: integer("actual_input_tokens"),
    actualOutputTokens: integer("actual_output_tokens"),
    blockedUntil: timestamp("blocked_until", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    errorCode: text("error_code"),
    estimatedTokens: integer("estimated_tokens").notNull(),
    metadata: json("metadata").$type<Record<string, unknown>>(),
    model: text("model").notNull(),
    provider: text("provider").notNull(),
    requestKey: text("request_key").notNull(),
    requestKind: text("request_kind").notNull(),
    reservedAt: timestamp("reserved_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    status: text("status").notNull().default("reserved"),
  },
  (table) => [
    index("ai_provider_quota_scope_time_idx").on(
      table.provider,
      table.model,
      table.reservedAt,
    ),
    index("ai_provider_quota_request_key_idx").on(table.requestKey),
  ],
);
