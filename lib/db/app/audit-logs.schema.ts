import { text, json, pgTable } from "drizzle-orm/pg-core";
import { timestamp } from "./columns";

export const auditLogs = pgTable("audit_logs", {
  id: text("id").primaryKey(),
  event: text("event").notNull(),
  method: text("method").notNull(),
  path: text("path").notNull(),
  userId: text("user_id"),
  sessionId: text("session_id"),
  accountId: text("account_id"),
  providerId: text("provider_id"),
  targetUserId: text("target_user_id"),
  actorUserId: text("actor_user_id"),
  email: text("email"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  metadata: json("metadata"),
  createdAt: timestamp("created_at"),
});
