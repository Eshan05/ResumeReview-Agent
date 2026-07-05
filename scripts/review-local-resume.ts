import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
process.env.PROVIDER_QUOTA_WAIT_MAX_MS ??= "120000";

interface Args {
  filePath: string;
  jobId?: string;
  resumeId?: string;
  userId?: string;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const filePath = path.resolve(args.filePath);
  const [file, fileStat] = await Promise.all([
    readFile(filePath),
    stat(filePath),
  ]);
  const resumeId = args.resumeId ?? createResumeId(filePath, file);
  const userId =
    args.userId ??
    process.env.UPLOAD_DEV_USER_ID ??
    process.env.DEV_UPLOAD_USER_ID ??
    "local-dev-user";
  const { ensureDefaultCandidateJob } = await import(
    "../lib/candidates/default-job"
  );
  const {
    createResumeAgentRun,
    createResumeUploadRecord,
    loadResumeReviewInput,
    markResumeExtractionCompleted,
    markResumeProcessingStarted,
    markResumeReviewPhasesCompleted,
    markResumeReviewCompleted,
    markResumeReviewStarted,
    reviewAndStoreResume,
  } = await import("../lib/resumes/service");
  const {
    runResumeReviewPlatformCrawlingPhase,
    runResumeReviewSpecialistPhase,
  } = await import("../lib/resumes/review-agent");
  const { extractResumeText } = await import("../lib/resumes/text-extraction");
  const { db } = await import("../lib/db/db");
  const { resumes } = await import("../lib/db/app/resumes.schema");
  const { eq } = await import("drizzle-orm");
  const job = args.jobId
    ? { id: args.jobId }
    : await ensureDefaultCandidateJob();
  const fileName = path.basename(filePath);
  const fileType = getMimeType(fileName);

  await createResumeUploadRecord({
    fileKey: resumeId,
    fileName,
    fileSize: fileStat.size,
    fileType,
    fileUrl: pathToFileURL(filePath).toString(),
    jobId: job.id,
    resumeId,
    uploadAttempt: 1,
    uploadBatchId: "local-file-review",
    uploadedBy: userId,
  });

  const agentRun = await createResumeAgentRun({
    jobId: job.id,
    resumeId,
  });

  await markResumeProcessingStarted({ agentRunId: agentRun.id });

  const extraction = await extractResumeText({
    data: file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength),
    fileName,
    fileType,
  });

  await db
    .update(resumes)
    .set({
      applicantEmail: extraction.applicantEmail,
      applicantName: extraction.applicantName,
      rawText: extraction.rawText,
      status: "text_extracted",
    })
    .where(eq(resumes.id, resumeId));

  await markResumeExtractionCompleted({
    agentRunId: agentRun.id,
    extraction,
  });
  await markResumeReviewStarted({ agentRunId: agentRun.id });

  const workflowPayload = {
    agentRunId: agentRun.id,
    fileKey: resumeId,
    jobId: job.id,
    resumeId,
  };
  const reviewInput = await loadResumeReviewInput(workflowPayload);
  const [applicantInfoPhase, educationPhase, structuredPhase, profileCrawl] =
    await Promise.all([
      runResumeReviewSpecialistPhase({
        input: reviewInput,
        phaseId: "applicant-info",
      }),
      runResumeReviewSpecialistPhase({
        input: reviewInput,
        phaseId: "education-certifications",
      }),
      runResumeReviewSpecialistPhase({
        input: reviewInput,
        phaseId: "structured-data-extraction",
      }),
      runResumeReviewPlatformCrawlingPhase({
        input: reviewInput,
      }),
    ]);
  const reviewInputWithProfile = {
    ...reviewInput,
    platformCrawl: profileCrawl.report,
  };
  const redFlagPhase = await runResumeReviewSpecialistPhase({
    input: reviewInputWithProfile,
    phaseId: "red-flag-detection",
  });
  const primaryPhases = [
    applicantInfoPhase,
    educationPhase,
    structuredPhase,
    profileCrawl.phase,
    redFlagPhase,
  ];

  await markResumeReviewPhasesCompleted({
    agentRunId: agentRun.id,
    currentPhase: "skills-verification",
    phases: primaryPhases,
  });

  const verificationPhases = await Promise.all([
    runResumeReviewSpecialistPhase({
      input: reviewInputWithProfile,
      phaseId: "skills-verification",
    }),
    runResumeReviewSpecialistPhase({
      input: reviewInputWithProfile,
      phaseId: "project-matching",
    }),
  ]);

  await markResumeReviewPhasesCompleted({
    agentRunId: agentRun.id,
    currentPhase: "fit-scoring",
    phases: verificationPhases,
  });

  const scoringPhase = await runResumeReviewSpecialistPhase({
    input: reviewInputWithProfile,
    phaseId: "fit-scoring",
  });
  await markResumeReviewPhasesCompleted({
    agentRunId: agentRun.id,
    currentPhase: "master-review",
    phases: [scoringPhase],
  });

  const specialistPhases = [
    ...primaryPhases,
    ...verificationPhases,
    scoringPhase,
  ];

  const reviewRun = await reviewAndStoreResume(
    {
      ...workflowPayload,
    },
    { platformCrawl: profileCrawl.report, specialistPhases },
  );

  await markResumeReviewCompleted({
    agentRunId: agentRun.id,
    reviewRun,
  });

  console.log(
    JSON.stringify(
      {
        applicant: reviewRun.review.applicant,
        decision: reviewRun.review.decision,
        extractionMethod: extraction.extractionMethod,
        finalScore: reviewRun.review.finalScore,
        jobId: job.id,
        model: reviewRun.model,
        outputMode: reviewRun.pipeline.outputMode,
        pipelinePhases: reviewRun.pipeline.phases.map((phase) => phase.id),
        provider: reviewRun.provider,
        repairedOutput: reviewRun.pipeline.repairedOutput,
        resumeId,
        usedFallback: Boolean(reviewRun.fallbackReason),
      },
      null,
      2,
    ),
  );
}

function parseArgs(argv: string[]): Args {
  const filePath = argv.find((arg) => !arg.startsWith("--"));
  if (!filePath) {
    throw new Error(
      "Usage: pnpm resumes:review-local <resume-path> [--job <jobId>] [--resume-id <resumeId>] [--user <userId>]",
    );
  }

  return {
    filePath,
    jobId: readOption(argv, "--job"),
    resumeId: readOption(argv, "--resume-id"),
    userId: readOption(argv, "--user"),
  };
}

function readOption(argv: string[], name: string) {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

function createResumeId(filePath: string, file: Buffer) {
  const hash = createHash("sha256")
    .update(filePath)
    .update(file)
    .digest("hex")
    .slice(0, 16);

  return `local-resume-${hash}`;
}

function getMimeType(fileName: string) {
  const extension = path.extname(fileName).toLowerCase();
  const types: Record<string, string> = {
    ".doc": "application/msword",
    ".docx":
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".jpeg": "image/jpeg",
    ".jpg": "image/jpeg",
    ".md": "text/markdown",
    ".pdf": "application/pdf",
    ".png": "image/png",
    ".txt": "text/plain",
    ".webp": "image/webp",
  };

  return types[extension] ?? "application/octet-stream";
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  if (process.env.DEBUG_RESUME_REVIEW_ERRORS === "true") {
    console.error(error);
  }
  process.exitCode = 1;
});
