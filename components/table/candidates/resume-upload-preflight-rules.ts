export const RESUME_UPLOAD_MAX_FILES = 100;
export const RESUME_BINARY_MAX_BYTES = 16 * 1024 * 1024;
export const RESUME_TEXT_MAX_BYTES = 2 * 1024 * 1024;

export const ACCEPTED_RESUME_EXTENSIONS = [
  "pdf",
  "doc",
  "docx",
  "txt",
  "md",
  "png",
  "jpg",
  "jpeg",
  "webp",
];

const acceptedExtensionSet = new Set(ACCEPTED_RESUME_EXTENSIONS);

export type ResumeUploadValidationStatus = "accepted" | "rejected";

export interface ResumePreflightFileInput {
  id: string;
  lastModified: number;
  name: string;
  size: number;
  type: string;
}

export interface ResumePreflightFileResult extends ResumePreflightFileInput {
  extension: string;
  issue?: string;
  limitBytes: number;
  status: ResumeUploadValidationStatus;
}

export interface ResumePreflightProgress {
  current: number;
  total: number;
}

export function validateResumePreflightFile(
  file: ResumePreflightFileInput,
  index: number,
): ResumePreflightFileResult {
  const extension = getFileExtension(file.name);
  const limitBytes = getResumeFileLimit(file);

  if (index >= RESUME_UPLOAD_MAX_FILES) {
    return {
      ...file,
      extension,
      issue: `Only ${RESUME_UPLOAD_MAX_FILES} files can be uploaded in one batch.`,
      limitBytes,
      status: "rejected",
    };
  }

  if (!acceptedExtensionSet.has(extension)) {
    return {
      ...file,
      extension,
      issue: "Unsupported file type.",
      limitBytes,
      status: "rejected",
    };
  }

  if (file.size > limitBytes) {
    return {
      ...file,
      extension,
      issue: `Max ${formatResumeUploadBytes(limitBytes)}.`,
      limitBytes,
      status: "rejected",
    };
  }

  return {
    ...file,
    extension,
    limitBytes,
    status: "accepted",
  };
}

export function getFileExtension(fileName: string) {
  return fileName.split(".").pop()?.toLowerCase() ?? "";
}

export function getResumeFileLimit(file: { name: string; type: string }) {
  const extension = getFileExtension(file.name);
  return extension === "txt" ||
    extension === "md" ||
    file.type.startsWith("text/")
    ? RESUME_TEXT_MAX_BYTES
    : RESUME_BINARY_MAX_BYTES;
}

export function formatResumeUploadBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
