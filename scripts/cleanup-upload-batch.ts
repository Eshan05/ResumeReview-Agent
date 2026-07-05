import dotenv from "dotenv";
import { eq, inArray } from "drizzle-orm";
import { UTApi } from "uploadthing/server";
import { agentRuns } from "../lib/db/app/agent-runs.schema";
import { candidateNotes } from "../lib/db/app/candidates.schema";
import { emailLogs } from "../lib/db/app/email-logs.schema";
import { interviews } from "../lib/db/app/interviews.schema";
import { resumeResults } from "../lib/db/app/resume-results.schema";
import { resumes } from "../lib/db/app/resumes.schema";
import { deleteUploadThingCustomIds } from "../lib/files/storage";

type Database = typeof import("../lib/db/db").db;

interface CleanupArgs {
  batchId?: string;
  dryRun: boolean;
  resumeIds: string[];
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

async function main() {
  dotenv.config({ path: ".env.local" });

  const { db } = await import("../lib/db/db");
  const args = parseArgs(process.argv.slice(2));

  if (!(args.batchId || args.resumeIds.length > 0)) {
    printUsage();
    process.exitCode = 1;
    return;
  }

  await cleanupUploadBatch(args, db);
}

async function cleanupUploadBatch(args: CleanupArgs, db: Database) {
  const rows = args.batchId
    ? await db
        .select()
        .from(resumes)
        .where(eq(resumes.uploadBatchId, args.batchId))
    : await db
        .select()
        .from(resumes)
        .where(inArray(resumes.id, args.resumeIds));

  const resumeIds = unique(rows.map((row) => row.id));
  const uploadFileKeys = unique(
    rows.map((row) => row.uploadFileKey).filter(isString),
  );

  if (resumeIds.length === 0) {
    console.log("No matching resumes found.");
    return;
  }

  console.log(
    `${args.dryRun ? "Would clean" : "Cleaning"} ${resumeIds.length} resume rows`,
  );
  console.table(
    rows.map((row) => ({
      fileName: row.fileName,
      resumeId: row.id,
      uploadBatchId: row.uploadBatchId,
      uploadFileKey: row.uploadFileKey,
    })),
  );

  if (args.dryRun) return;

  const deletedByCustomId = await deleteUploadThingCustomIds(resumeIds, {
    concurrency: 8,
  });
  const deletedCustomIds = new Set(deletedByCustomId.deleted);
  const missingCustomIds = resumeIds.filter(
    (resumeId) => !deletedCustomIds.has(resumeId),
  );

  if (missingCustomIds.length > 0 && uploadFileKeys.length > 0) {
    console.warn(
      `Files SDK did not confirm ${missingCustomIds.length} custom id deletes; falling back to UploadThing file keys.`,
    );
    const utapi = new UTApi();
    await utapi.deleteFiles(uploadFileKeys);
  }

  await db.delete(emailLogs).where(inArray(emailLogs.resumeId, resumeIds));
  await db.delete(interviews).where(inArray(interviews.resumeId, resumeIds));
  await db
    .delete(candidateNotes)
    .where(inArray(candidateNotes.resumeId, resumeIds));
  await db
    .delete(resumeResults)
    .where(inArray(resumeResults.resumeId, resumeIds));
  await db.delete(agentRuns).where(inArray(agentRuns.resumeId, resumeIds));
  await db.delete(resumes).where(inArray(resumes.id, resumeIds));

  console.log("Cleanup complete.");
}

function parseArgs(values: string[]): CleanupArgs {
  const resumeIds: string[] = [];
  let batchId: string | undefined;
  let dryRun = false;

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];

    if (value === "--dry-run") {
      dryRun = true;
      continue;
    }

    if (value === "--") continue;

    if (value === "--batch") {
      batchId = values[index + 1];
      index += 1;
      continue;
    }

    if (value === "--resume") {
      const rawResumeIds = values[index + 1] ?? "";
      resumeIds.push(
        ...rawResumeIds
          .split(",")
          .map((resumeId) => resumeId.trim())
          .filter(Boolean),
      );
      index += 1;
    }
  }

  return {
    batchId,
    dryRun,
    resumeIds: unique(resumeIds),
  };
}

function printUsage() {
  console.log(
    [
      "Usage:",
      "  pnpm uploads:cleanup -- --batch <uploadBatchId>",
      "  pnpm uploads:cleanup -- --resume <resumeId[,resumeId]>",
      "  pnpm uploads:cleanup -- --batch <uploadBatchId> --dry-run",
    ].join("\n"),
  );
}

function unique<TValue>(values: TValue[]) {
  return Array.from(new Set(values));
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}
