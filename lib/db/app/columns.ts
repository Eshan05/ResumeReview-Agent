import { timestamp as pgTimestamp } from "drizzle-orm/pg-core";

export const timestamp = (name = "created_at") =>
  pgTimestamp(name).defaultNow().notNull();

export const updatedTimestamp = (name = "updated_at") =>
  pgTimestamp(name)
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull();

export const timestampNullable = (name: string) =>
  pgTimestamp(name);
