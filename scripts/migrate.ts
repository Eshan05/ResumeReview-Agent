import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");

  const [{ neon }, { drizzle }, { migrate }] = await Promise.all([
    import("@neondatabase/serverless"),
    import("drizzle-orm/neon-http"),
    import("drizzle-orm/neon-http/migrator"),
  ]);
  const client = neon(databaseUrl);
  const db = drizzle(client);
  await migrate(db, { migrationsFolder: "./lib/db/migrations" });
}

main().catch((error) => {
  const cause =
    error instanceof Error && error.cause instanceof Error
      ? `\nCause: ${error.cause.stack ?? error.cause.message}`
      : "";
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : "Database migration failed"}${cause}\n`,
  );
  process.exitCode = 1;
});
