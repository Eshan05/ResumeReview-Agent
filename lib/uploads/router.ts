import { createUploadthing, type FileRouter } from "uploadthing/next";
import { UploadThingError, UTFiles } from "uploadthing/server";
import { z } from "zod";
import { markResumeUploadItemUploaded } from "@/lib/resume-batches/service";
import { createResumeUploadRecord } from "@/lib/resumes/service";

const f = createUploadthing();

export type ResumeUploadWorkflowState =
  | { status: "failed"; error: string }
  | { status: "pending_dispatch"; reason: string }
  | { status: "skipped"; reason: string }
  | { status: "triggered"; workflowRunId?: string };

export interface ResumeUploadServerData {
  agentRunId: string | null;
  fileKey: string;
  key: string;
  name: string;
  resumeId: string;
  size: number;
  type: string;
  uploadBatchId: string;
  uploadedAt: number;
  url: string;
  workflow: ResumeUploadWorkflowState;
}

const uploadInputFileSchema = z.object({
  id: z.string().min(1),
  lastModified: z.number().int().nonnegative(),
  name: z.string().min(1),
  size: z.number().int().nonnegative(),
});

export const uploadRouter = {
  resumeUpload: f({
    blob: {
      maxFileCount: 8,
      maxFileSize: "16MB",
    },
    image: {
      maxFileCount: 8,
      maxFileSize: "16MB",
    },
    pdf: {
      maxFileCount: 8,
      maxFileSize: "16MB",
    },
    text: {
      maxFileCount: 8,
      maxFileSize: "2MB",
    },
  })
    .input(
      z.object({
        attempt: z.number().int().positive().default(1),
        files: z.array(uploadInputFileSchema).min(1).max(8),
        jobId: z.string().min(1),
        uploadBatchId: z.string().min(1),
      }),
    )
    .middleware(async ({ files, input, req }) => {
      const userId = await resolveUploadUserId(req);

      return {
        attempt: input.attempt,
        files: input.files,
        jobId: input.jobId,
        uploadBatchId: input.uploadBatchId,
        uploadedAt: Date.now(),
        uploadedBy: userId,
        [UTFiles]: files.map((file, index) => {
          const inputFile =
            input.files[index] ?? findInputFileForUpload(file, input.files);

          return {
            ...file,
            customId: inputFile?.id ?? crypto.randomUUID(),
          };
        }),
      };
    })
    .onUploadComplete(async ({ file, metadata }) => {
      const resumeId = file.customId ?? crypto.randomUUID();
      const resume = await createResumeUploadRecord({
        fileKey: file.key,
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
        fileUrl: file.ufsUrl,
        jobId: metadata.jobId,
        resumeId,
        uploadAttempt: metadata.attempt,
        uploadBatchId: metadata.uploadBatchId,
        uploadedBy: metadata.uploadedBy,
      });
      await markResumeUploadItemUploaded({
        batchId: metadata.uploadBatchId,
        fileKey: file.key,
        fileUrl: file.ufsUrl,
        itemId: resume.id,
        resumeId: resume.id,
      });

      return {
        agentRunId: null,
        fileKey: resumeId,
        key: file.key,
        name: file.name,
        resumeId: resume.id,
        size: file.size,
        type: file.type,
        uploadBatchId: metadata.uploadBatchId,
        uploadedAt: metadata.uploadedAt,
        url: file.ufsUrl,
        workflow: {
          status: "pending_dispatch" as const,
          reason: "Uploaded and waiting for the batch dispatcher.",
        },
      } satisfies ResumeUploadServerData;
    }),
  avatarImage: f({
    image: {
      maxFileCount: 1,
      maxFileSize: "2MB",
    },
  })
    .middleware(async () => ({ uploadedAt: Date.now() }))
    .onUploadComplete(async ({ file, metadata }) => ({
      key: file.key,
      name: file.name,
      size: file.size,
      type: file.type,
      uploadedAt: metadata.uploadedAt,
      url: file.ufsUrl,
    })),
  messageAttachment: f({
    image: {
      maxFileCount: 4,
      maxFileSize: "8MB",
    },
    pdf: {
      maxFileCount: 2,
      maxFileSize: "8MB",
    },
    text: {
      maxFileCount: 2,
      maxFileSize: "1MB",
    },
  })
    .middleware(async () => ({ uploadedAt: Date.now() }))
    .onUploadComplete(async ({ file, metadata }) => ({
      key: file.key,
      name: file.name,
      size: file.size,
      type: file.type,
      uploadedAt: metadata.uploadedAt,
      url: file.ufsUrl,
    })),
} satisfies FileRouter;

export type UploadRouter = typeof uploadRouter;

function findInputFileForUpload(
  file: { name: string; size: number },
  inputFiles: z.infer<typeof uploadInputFileSchema>[],
) {
  return inputFiles.find(
    (inputFile) => inputFile.name === file.name && inputFile.size === file.size,
  );
}

async function resolveUploadUserId(req: Request) {
  const devUserId =
    process.env.UPLOAD_DEV_USER_ID ?? process.env.DEV_UPLOAD_USER_ID;

  try {
    const { auth } = await import("@/lib/auth/auth");
    const session = await auth.api.getSession({
      headers: req.headers,
    });

    if (session?.user?.id) return session.user.id;
  } catch {
    // Fall through to the explicit dev user id below.
  }

  if (devUserId) return devUserId;

  if (process.env.NODE_ENV !== "production") {
    return "local-dev-user";
  }

  throw new UploadThingError("Unauthorized");
}
