"use client";

import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  FileText,
  Loader2,
  RefreshCcw,
  RotateCcw,
  Upload,
  X,
} from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import type { ClientUploadedFileData } from "uploadthing/types";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  chunkItems,
  RESUME_UPLOAD_CHUNK_CONCURRENCY,
  RESUME_UPLOAD_CHUNK_SIZE,
} from "@/lib/resume-batches/policy";
import type { ResumeUploadServerData } from "@/lib/uploads/router";
import { uploadFiles } from "@/lib/uploads/uploadthing";
import { cn } from "@/lib/utils";
import { validateResumeUploadFiles } from "./resume-upload-preflight";
import {
  formatResumeUploadBytes,
  getFileExtension,
  RESUME_UPLOAD_MAX_FILES,
  type ResumePreflightFileInput,
} from "./resume-upload-preflight-rules";

type ResumeUploadResult = ClientUploadedFileData<ResumeUploadServerData>;
type UploadStep =
  | "complete"
  | "error"
  | "ready"
  | "select"
  | "uploading"
  | "validating";
type ResumeUploadFileStatus =
  | "accepted"
  | "completed"
  | "failed"
  | "queued"
  | "rejected"
  | "uploading";
type UploadMode = "accepted" | "failed";

interface CandidateUploadDialogProps {
  jobId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUploaded?: (files: ResumeUploadResult[]) => void;
}

interface ResumeWorkflowStatus {
  agentRunId: string | null;
  completedAt: string | null;
  currentPhase: string | null;
  error: string | null;
  failureCategory: string | null;
  fileName: string;
  nextRetryAt: string | null;
  phases: unknown;
  resumeId: string;
  resumeStatus: string;
  runStatus: string | null;
  startedAt: string | null;
  uploadBatchId: string | null;
  workflowRunId: string | null;
}

interface ResumeBatchProgress {
  acceptedCount: number;
  cancelledCount: number;
  completedCount: number;
  failedCount: number;
  queuedCount: number;
  rejectedCount: number;
  runningCount: number;
  status: string;
  totalCount: number;
  uploadedCount: number;
}

interface ResumeUploadItem extends ResumePreflightFileInput {
  extension: string;
  file: File;
  issue?: string;
  limitBytes: number;
  progress: number;
  result?: ResumeUploadResult;
  status: ResumeUploadFileStatus;
}

const ACCEPTED_INPUT_TYPES = [
  ".pdf",
  ".doc",
  ".docx",
  ".txt",
  ".md",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/png",
  "image/jpeg",
  "image/webp",
  "text/plain",
  "text/markdown",
].join(",");

export function CandidateUploadDialog({
  jobId,
  open,
  onOpenChange,
  onUploaded,
}: CandidateUploadDialogProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const activeUploadIdsRef = React.useRef<string[]>([]);
  const registeredBatchIdRef = React.useRef<string | null>(null);
  const uploadControllerRef = React.useRef<AbortController | null>(null);
  const validationControllerRef = React.useRef<AbortController | null>(null);
  const [batchId, setBatchId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [isUploading, setIsUploading] = React.useState(false);
  const [items, setItems] = React.useState<ResumeUploadItem[]>([]);
  const [progress, setProgress] = React.useState(0);
  const [results, setResults] = React.useState<ResumeUploadResult[]>([]);
  const [retryingWorkflowIds, setRetryingWorkflowIds] = React.useState(
    () => new Set<string>(),
  );
  const [step, setStep] = React.useState<UploadStep>("select");
  const [uploadAttempt, setUploadAttempt] = React.useState(0);
  const [validationProgress, setValidationProgress] = React.useState({
    current: 0,
    total: 0,
  });
  const [workflowStatuses, setWorkflowStatuses] = React.useState<
    Record<string, ResumeWorkflowStatus>
  >({});
  const [batchProgress, setBatchProgress] =
    React.useState<ResumeBatchProgress | null>(null);

  const acceptedCount = items.filter(
    (item) => item.status === "accepted",
  ).length;
  const failedCount = items.filter((item) => item.status === "failed").length;
  const rejectedCount = items.filter(
    (item) => item.status === "rejected",
  ).length;
  const completedCount = items.filter(
    (item) => item.status === "completed",
  ).length;
  const uploadedResumeIdsKey = React.useMemo(
    () =>
      items
        .map((item) => item.result?.serverData.resumeId)
        .filter(isString)
        .join(","),
    [items],
  );

  const resetState = React.useCallback(() => {
    validationControllerRef.current?.abort();
    validationControllerRef.current = null;
    uploadControllerRef.current?.abort();
    uploadControllerRef.current = null;
    activeUploadIdsRef.current = [];
    setBatchId(null);
    setError(null);
    setIsUploading(false);
    setItems([]);
    setProgress(0);
    setResults([]);
    setRetryingWorkflowIds(new Set());
    setStep("select");
    setUploadAttempt(0);
    setValidationProgress({ current: 0, total: 0 });
    setWorkflowStatuses({});
    setBatchProgress(null);
    registeredBatchIdRef.current = null;
    if (inputRef.current) inputRef.current.value = "";
  }, []);

  const markActiveItemsFailed = React.useCallback((message: string) => {
    const activeIds = new Set(activeUploadIdsRef.current);

    setItems((currentItems) =>
      currentItems.map((item) =>
        activeIds.has(item.id) &&
        (item.status === "queued" || item.status === "uploading")
          ? {
              ...item,
              issue: message,
              progress: 0,
              status: "failed",
            }
          : item,
      ),
    );
    setError(message);
    setStep("error");
  }, []);

  const refreshWorkflowStatuses = React.useCallback(
    async (resumeIds: string[]) => {
      if (resumeIds.length === 0) return [];

      const statusChunks = await Promise.all(
        chunkItems(Array.from(new Set(resumeIds)), 25).map(async (chunk) => {
          const response = await fetch(
            `/api/resumes/status?ids=${chunk.map(encodeURIComponent).join(",")}`,
            { cache: "no-store" },
          );

          if (!response.ok) {
            throw new Error("Failed to load workflow status.");
          }

          return (await response.json()) as {
            statuses: ResumeWorkflowStatus[];
          };
        }),
      );
      const statuses = statusChunks.flatMap((data) => data.statuses);

      setWorkflowStatuses((currentStatuses) => {
        const nextStatuses = { ...currentStatuses };
        for (const status of statuses) {
          nextStatuses[status.resumeId] = status;
        }
        return nextStatuses;
      });

      return statuses;
    },
    [],
  );

  React.useEffect(() => {
    if (!(open && uploadedResumeIdsKey)) return;

    const resumeIds = uploadedResumeIdsKey.split(",").filter(Boolean);
    let disposed = false;

    const refresh = async () => {
      if (disposed) return;

      try {
        await refreshWorkflowStatuses(resumeIds);
      } catch {
        // Polling should not interrupt the upload flow.
      }
    };

    void refresh();
    const interval = window.setInterval(refresh, 2500);

    return () => {
      disposed = true;
      window.clearInterval(interval);
    };
  }, [open, refreshWorkflowStatuses, uploadedResumeIdsKey]);

  React.useEffect(() => {
    if (!(open && batchId)) return;

    const source = new EventSource(
      `/api/resume-batches/${encodeURIComponent(batchId)}/progress/stream`,
    );

    source.addEventListener("snapshot", (event) => {
      try {
        const payload = JSON.parse((event as MessageEvent<string>).data) as {
          batch?: ResumeBatchProgress;
        };
        if (payload.batch) setBatchProgress(payload.batch);
      } catch {
        // Ignore malformed progress events; polling remains active.
      }
    });

    source.addEventListener("error", () => {
      source.close();
    });

    return () => source.close();
  }, [batchId, open]);

  const applyFiles = React.useCallback(
    async (incomingFiles: FileList | File[]) => {
      const nextFiles = Array.from(incomingFiles);
      if (nextFiles.length === 0) return;

      validationControllerRef.current?.abort();
      const controller = new AbortController();
      validationControllerRef.current = controller;

      const draftItems = nextFiles.map(toUploadItem);
      const nextBatchId = createClientId();

      setBatchId(nextBatchId);
      setError(null);
      setItems(draftItems);
      setProgress(0);
      setResults([]);
      setRetryingWorkflowIds(new Set());
      setStep("validating");
      setUploadAttempt(0);
      setValidationProgress({ current: 0, total: draftItems.length });
      setWorkflowStatuses({});
      setBatchProgress(null);
      registeredBatchIdRef.current = null;

      try {
        const preflightResults = await validateResumeUploadFiles(
          draftItems.map(toPreflightInput),
          {
            onProgress: setValidationProgress,
            signal: controller.signal,
          },
        );

        if (controller.signal.aborted) return;

        const validatedItems = draftItems.map((item, index) => {
          const result = preflightResults[index];

          return {
            ...item,
            extension: result.extension,
            issue: result.issue,
            limitBytes: result.limitBytes,
            status: result.status,
          };
        });
        const rejectedMessages = validatedItems
          .filter((item) => item.status === "rejected")
          .map((item) => `${item.name}: ${item.issue}`);
        const uploadableCount = validatedItems.filter(
          (item) => item.status === "accepted",
        ).length;

        setItems(validatedItems);
        setError(
          rejectedMessages.length > 0 ? rejectedMessages.join(" ") : null,
        );
        setStep(uploadableCount > 0 ? "ready" : "select");
      } catch (preflightError) {
        if (
          preflightError instanceof DOMException &&
          preflightError.name === "AbortError"
        ) {
          return;
        }

        const message =
          preflightError instanceof Error
            ? preflightError.message
            : "Resume preflight failed.";
        setError(message);
        setStep("error");
        toast.error(message);
      } finally {
        if (validationControllerRef.current === controller) {
          validationControllerRef.current = null;
        }
      }
    },
    [],
  );

  const ensureBatchRegistered = React.useCallback(
    async (activeBatchId: string) => {
      if (registeredBatchIdRef.current === activeBatchId) return;

      const response = await fetch("/api/resume-batches", {
        body: JSON.stringify({
          files: items.map((item) => ({
            id: item.id,
            lastModified: item.lastModified,
            name: item.name,
            preflightIssue: item.issue,
            preflightStatus:
              item.status === "rejected" ? "rejected" : "accepted",
            size: item.size,
            type: item.type || "application/octet-stream",
          })),
          id: activeBatchId,
          jobId,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Failed to create resume upload batch.");
      }

      registeredBatchIdRef.current = activeBatchId;
    },
    [items, jobId],
  );

  const dispatchBatch = React.useCallback(async (activeBatchId: string) => {
    const response = await fetch(
      `/api/resume-batches/${encodeURIComponent(activeBatchId)}/dispatch`,
      {
        headers: { "Content-Type": "application/json" },
        method: "POST",
      },
    );

    if (!response.ok) {
      throw new Error("Failed to dispatch uploaded resumes.");
    }
  }, []);

  const handleUpload = React.useCallback(
    async (mode: UploadMode = "accepted") => {
      const uploadItems = items.filter((item) =>
        mode === "failed"
          ? item.status === "failed"
          : item.status === "accepted",
      );

      if (uploadItems.length === 0) {
        setError(
          mode === "failed"
            ? "There are no failed files to retry."
            : "Choose at least one accepted resume before uploading.",
        );
        return;
      }

      const activeBatchId = batchId ?? createClientId();
      const nextAttempt = uploadAttempt + 1;
      const uploadController = new AbortController();

      activeUploadIdsRef.current = uploadItems.map((item) => item.id);
      uploadControllerRef.current = uploadController;
      setBatchId(activeBatchId);
      setError(null);
      setIsUploading(true);
      setProgress(0);
      setStep("uploading");
      setUploadAttempt(nextAttempt);
      setItems((currentItems) =>
        currentItems.map((item) =>
          activeUploadIdsRef.current.includes(item.id)
            ? { ...item, issue: undefined, progress: 0, status: "queued" }
            : item,
        ),
      );

      try {
        await ensureBatchRegistered(activeBatchId);

        const uploadedFiles: ResumeUploadResult[] = [];
        const uploadChunks = chunkItems(uploadItems, RESUME_UPLOAD_CHUNK_SIZE);
        const progressByItemId = new Map(
          uploadItems.map((item) => [item.id, 0]),
        );
        const totalBytes = uploadItems.reduce(
          (total, item) => total + Math.max(1, item.size),
          0,
        );
        let nextChunkIndex = 0;
        const updateAggregateProgress = () => {
          const uploadedBytes = uploadItems.reduce(
            (total, item) =>
              total +
              Math.max(1, item.size) *
                ((progressByItemId.get(item.id) ?? 0) / 100),
            0,
          );
          setProgress(
            Math.min(100, Math.round((uploadedBytes / totalBytes) * 100)),
          );
        };
        const uploadChunk = async (chunk: ResumeUploadItem[]) => {
          const chunkIds = new Set(chunk.map((item) => item.id));
          const chunkResults = await uploadFiles("resumeUpload", {
            files: chunk.map((item) => item.file),
            input: {
              attempt: nextAttempt,
              files: chunk.map(toUploadInput),
              jobId,
              uploadBatchId: activeBatchId,
            },
            signal: uploadController.signal,
            onUploadBegin: ({ file }) => {
              setError(null);
              setItems((currentItems) =>
                currentItems.map((item) =>
                  chunkIds.has(item.id) && item.name === file
                    ? { ...item, progress: 0, status: "uploading" }
                    : item,
                ),
              );
              setStep("uploading");
            },
            onUploadProgress: ({ file, progress: fileProgress }) => {
              const matchingItem = chunk.find(
                (item) => item.name === file.name,
              );
              if (matchingItem) {
                progressByItemId.set(matchingItem.id, fileProgress);
              }
              updateAggregateProgress();
              setItems((currentItems) =>
                currentItems.map((item) =>
                  chunkIds.has(item.id) && item.name === file.name
                    ? { ...item, progress: fileProgress, status: "uploading" }
                    : item,
                ),
              );
            },
          });

          if (!chunkResults) {
            throw new Error("Upload did not return a result.");
          }

          uploadedFiles.push(...chunkResults);
          for (const item of chunk) progressByItemId.set(item.id, 100);
          updateAggregateProgress();
          await dispatchBatch(activeBatchId);
        };
        const workers = Array.from({
          length: Math.min(
            RESUME_UPLOAD_CHUNK_CONCURRENCY,
            uploadChunks.length,
          ),
        }).map(async () => {
          while (nextChunkIndex < uploadChunks.length) {
            const chunk = uploadChunks[nextChunkIndex];
            nextChunkIndex += 1;
            if (chunk) await uploadChunk(chunk);
          }
        });

        await Promise.all(workers);
        const activeIds = new Set(activeUploadIdsRef.current);
        const resultsByResumeId = new Map(
          uploadedFiles.map((file) => [file.serverData.resumeId, file]),
        );
        const missingCount = activeUploadIdsRef.current.filter(
          (itemId) => !resultsByResumeId.has(itemId),
        ).length;

        setItems((currentItems) =>
          currentItems.map((item) => {
            if (!activeIds.has(item.id)) return item;

            const result = resultsByResumeId.get(item.id);
            if (!result) {
              return {
                ...item,
                issue: "Upload completed without a server result.",
                progress: 0,
                status: "failed",
              };
            }

            return {
              ...item,
              issue: undefined,
              progress: 100,
              result,
              status: "completed",
            };
          }),
        );
        setResults((currentResults) =>
          mergeUploadResults(currentResults, uploadedFiles),
        );
        setProgress(100);

        if (missingCount > 0) {
          setError(
            `${missingCount} upload result was missing from the server.`,
          );
          setStep("error");
        } else {
          setError(null);
          setStep("complete");
        }

        toast.success(
          `${uploadedFiles.length} resume${uploadedFiles.length === 1 ? "" : "s"} uploaded`,
        );
        onUploaded?.(uploadedFiles);
      } catch (uploadError) {
        const wasCanceled = uploadController.signal.aborted;
        const message = wasCanceled
          ? "Upload canceled."
          : uploadError instanceof Error
            ? uploadError.message
            : "Resume upload failed.";
        markActiveItemsFailed(message);
        if (wasCanceled) {
          toast.info(message);
        } else {
          toast.error(message);
        }
      } finally {
        activeUploadIdsRef.current = [];
        if (uploadControllerRef.current === uploadController) {
          uploadControllerRef.current = null;
        }
        setIsUploading(false);
      }
    },
    [
      batchId,
      dispatchBatch,
      ensureBatchRegistered,
      items,
      jobId,
      markActiveItemsFailed,
      onUploaded,
      uploadAttempt,
    ],
  );

  const handleCancelUpload = React.useCallback(() => {
    if (!uploadControllerRef.current) return;
    uploadControllerRef.current.abort();
  }, []);

  const handleRetryWorkflow = React.useCallback(
    async (item: ResumeUploadItem) => {
      const resumeId = item.result?.serverData.resumeId;
      if (!resumeId) return;

      setRetryingWorkflowIds((currentIds) => {
        const nextIds = new Set(currentIds);
        nextIds.add(resumeId);
        return nextIds;
      });

      try {
        const response = await fetch(
          `/api/resumes/${encodeURIComponent(resumeId)}/workflow/retry`,
          { method: "POST" },
        );

        if (!response.ok) {
          throw new Error("Workflow retry failed.");
        }

        await refreshWorkflowStatuses([resumeId]);
        toast.success("Workflow retry queued");
      } catch (retryError) {
        toast.error(
          retryError instanceof Error
            ? retryError.message
            : "Workflow retry failed.",
        );
      } finally {
        setRetryingWorkflowIds((currentIds) => {
          const nextIds = new Set(currentIds);
          nextIds.delete(resumeId);
          return nextIds;
        });
      }
    },
    [refreshWorkflowStatuses],
  );

  const handleOpenChange = React.useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen && isUploading) {
        toast.warning("Wait for the upload to finish before closing.");
        return;
      }

      if (!nextOpen) resetState();
      onOpenChange(nextOpen);
    },
    [isUploading, onOpenChange, resetState],
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="px-5 pt-5">
          <DialogTitle className="flex items-center gap-2">
            <Upload className="size-4" aria-hidden="true" />
            Upload resumes
          </DialogTitle>
          <DialogDescription>
            Add PDF, Word, text, Markdown, or scanned image resumes to this job.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(90vh-7rem)]">
          <div className="space-y-4 px-5 pb-5">
            <button
              type="button"
              disabled={isUploading || step === "validating"}
              className={cn(
                "w-full rounded-lg border border-dashed bg-muted/30 p-5 text-center transition-colors",
                isUploading || step === "validating"
                  ? "cursor-not-allowed opacity-70"
                  : "cursor-pointer hover:border-primary/50 hover:bg-muted/50",
              )}
              onClick={() => {
                if (!(isUploading || step === "validating")) {
                  inputRef.current?.click();
                }
              }}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                if (!(isUploading || step === "validating")) {
                  void applyFiles(event.dataTransfer.files);
                }
              }}
            >
              <Upload
                className="mx-auto mb-3 size-9 text-muted-foreground"
                aria-hidden="true"
              />
              <p className="text-sm font-medium">Drop resumes here</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Up to {RESUME_UPLOAD_MAX_FILES} files. PDFs, Word files, and
                images up to 16 MB; text files up to 2 MB.
              </p>
            </button>
            <input
              ref={inputRef}
              id="resume-upload-files"
              name="resume-upload-files"
              type="file"
              multiple
              accept={ACCEPTED_INPUT_TYPES}
              className="hidden"
              onChange={(event) => {
                if (event.target.files) void applyFiles(event.target.files);
              }}
            />

            {step === "validating" && (
              <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Loader2 className="size-4 animate-spin text-primary" />
                  Checking files
                </div>
                <Progress value={getProgressValue(validationProgress)} />
                <p className="text-xs tabular-nums text-muted-foreground">
                  {validationProgress.total > 0
                    ? `${validationProgress.current} of ${validationProgress.total}`
                    : "Starting"}
                </p>
              </div>
            )}

            {error && (
              <Alert variant={step === "error" ? "destructive" : "default"}>
                <AlertCircle className="size-4" />
                <AlertTitle>
                  {step === "error"
                    ? "Upload needs attention"
                    : "Some files were skipped"}
                </AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {batchProgress && (
              <div className="rounded-lg border bg-muted/20 px-3 py-2">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium">
                    Batch {batchProgress.status}
                  </p>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {batchProgress.completedCount +
                      batchProgress.failedCount +
                      batchProgress.rejectedCount}
                    /{batchProgress.totalCount} settled
                  </span>
                </div>
                <div className="mt-2 grid grid-cols-4 gap-2 text-xs">
                  <BatchCount
                    label="Uploaded"
                    value={batchProgress.uploadedCount}
                  />
                  <BatchCount
                    label="Queued"
                    value={batchProgress.queuedCount}
                  />
                  <BatchCount
                    label="Running"
                    value={batchProgress.runningCount}
                  />
                  <BatchCount
                    label="Failed"
                    value={batchProgress.failedCount}
                  />
                </div>
              </div>
            )}

            {items.length > 0 && (
              <div className="rounded-lg border">
                <div className="flex items-center justify-between gap-3 px-3 py-2">
                  <div>
                    <p className="text-sm font-medium">Selected files</p>
                    <p className="text-xs text-muted-foreground">
                      {acceptedCount} accepted, {completedCount} completed
                      {failedCount > 0 ? `, ${failedCount} failed` : ""}
                      {rejectedCount > 0 ? `, ${rejectedCount} rejected` : ""}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={isUploading || step === "validating"}
                    onClick={resetState}
                  >
                    <X className="size-3.5" />
                    Clear
                  </Button>
                </div>
                <Separator />
                <div className="divide-y">
                  {items.map((item) => {
                    const workflowStatus = item.result
                      ? workflowStatuses[item.result.serverData.resumeId]
                      : undefined;

                    return (
                      <div key={item.id} className="space-y-2 px-3 py-2">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex min-w-0 items-center gap-2">
                            <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted">
                              <UploadStatusIcon status={item.status} />
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">
                                {item.name}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {formatResumeUploadBytes(item.size)} of{" "}
                                {formatResumeUploadBytes(item.limitBytes)}
                              </p>
                            </div>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <Badge variant={getStatusBadgeVariant(item.status)}>
                              {getUploadStatusLabel(item.status)}
                            </Badge>
                            <Badge variant="outline">
                              {item.extension
                                ? item.extension.toUpperCase()
                                : getFileExtension(item.name).toUpperCase()}
                            </Badge>
                          </div>
                        </div>

                        {item.status === "uploading" && (
                          <Progress value={item.progress} />
                        )}

                        {item.issue && (
                          <p className="text-xs text-destructive">
                            {item.issue}
                          </p>
                        )}

                        {item.result && (
                          <div className="flex items-start justify-between gap-3 rounded-md bg-muted/40 px-3 py-2">
                            <div className="min-w-0 space-y-1">
                              <p className="truncate text-xs font-medium">
                                {getWorkflowLabel(item.result, workflowStatus)}
                              </p>
                              <p className="truncate text-xs text-muted-foreground">
                                Resume {item.result.serverData.resumeId}
                              </p>
                            </div>
                            {canRetryWorkflow(item.result, workflowStatus) && (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={retryingWorkflowIds.has(
                                  item.result.serverData.resumeId,
                                )}
                                onClick={() => void handleRetryWorkflow(item)}
                              >
                                {retryingWorkflowIds.has(
                                  item.result.serverData.resumeId,
                                ) ? (
                                  <Loader2 className="size-3.5 animate-spin" />
                                ) : (
                                  <RefreshCcw className="size-3.5" />
                                )}
                                Retry
                              </Button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {step === "uploading" && (
              <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Loader2 className="size-4 animate-spin text-primary" />
                  Uploading resumes
                </div>
                <Progress value={progress} />
                <p className="text-xs tabular-nums text-muted-foreground">
                  {Math.round(progress)}%
                </p>
              </div>
            )}

            {step === "complete" && results.length > 0 && (
              <div className="rounded-lg border border-green-500/30 bg-green-500/5 px-3 py-2">
                <div className="flex items-center gap-2 text-sm font-medium text-green-700 dark:text-green-300">
                  <CheckCircle2 className="size-4" />
                  Upload complete
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Workflow status will keep updating while this dialog is open.
                </p>
              </div>
            )}
          </div>
        </ScrollArea>

        <div className="flex flex-col-reverse gap-2 border-t bg-muted/40 px-5 py-3 sm:flex-row sm:justify-end">
          {isUploading && (
            <Button
              type="button"
              variant="outline"
              onClick={handleCancelUpload}
            >
              <X className="size-3.5" />
              Cancel upload
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            disabled={isUploading}
            onClick={() => handleOpenChange(false)}
          >
            Close
          </Button>
          {step === "complete" ? (
            <Button type="button" variant="secondary" onClick={resetState}>
              <RotateCcw className="size-3.5" />
              Upload another
            </Button>
          ) : (
            <>
              {failedCount > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={isUploading || step === "validating"}
                  onClick={() => void handleUpload("failed")}
                >
                  <RefreshCcw className="size-3.5" />
                  Retry failed
                </Button>
              )}
              <Button
                type="button"
                disabled={
                  acceptedCount === 0 || isUploading || step === "validating"
                }
                onClick={() => void handleUpload("accepted")}
              >
                {isUploading && <Loader2 className="size-3.5 animate-spin" />}
                Upload
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function UploadStatusIcon({ status }: { status: ResumeUploadFileStatus }) {
  if (status === "completed") {
    return <CheckCircle2 className="size-4 text-green-600" />;
  }

  if (status === "failed" || status === "rejected") {
    return <AlertCircle className="size-4 text-destructive" />;
  }

  if (status === "queued") {
    return <Clock3 className="size-4 text-muted-foreground" />;
  }

  if (status === "uploading") {
    return <Loader2 className="size-4 animate-spin text-primary" />;
  }

  return <FileText className="size-4 text-muted-foreground" />;
}

function BatchCount({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md bg-background/70 px-2 py-1">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className="text-sm font-medium tabular-nums">{value}</p>
    </div>
  );
}

function toUploadItem(file: File): ResumeUploadItem {
  const extension = getFileExtension(file.name);

  return {
    extension,
    file,
    id: createClientId(),
    lastModified: file.lastModified,
    limitBytes: 0,
    name: file.name,
    progress: 0,
    size: file.size,
    status: "queued",
    type: file.type,
  };
}

function toPreflightInput(item: ResumeUploadItem): ResumePreflightFileInput {
  return {
    id: item.id,
    lastModified: item.lastModified,
    name: item.name,
    size: item.size,
    type: item.type,
  };
}

function toUploadInput(item: ResumeUploadItem) {
  return {
    id: item.id,
    lastModified: item.lastModified,
    name: item.name,
    size: item.size,
  };
}

function getProgressValue(progress: { current: number; total: number }) {
  if (progress.total === 0) return 0;
  return Math.round((progress.current / progress.total) * 100);
}

function getStatusBadgeVariant(status: ResumeUploadFileStatus) {
  if (status === "failed" || status === "rejected") return "destructive";
  if (status === "completed") return "secondary";
  return "outline";
}

function getUploadStatusLabel(status: ResumeUploadFileStatus) {
  const labels: Record<ResumeUploadFileStatus, string> = {
    accepted: "Accepted",
    completed: "Completed",
    failed: "Failed",
    queued: "Queued",
    rejected: "Rejected",
    uploading: "Uploading",
  };

  return labels[status];
}

function getWorkflowLabel(
  result: ResumeUploadResult,
  status: ResumeWorkflowStatus | undefined,
) {
  if (status?.runStatus === "failed" || status?.currentPhase === "failed") {
    return status.failureCategory
      ? `${formatFailureCategory(status.failureCategory)}: ${
          status.error ?? "Workflow failed"
        }`
      : (status.error ?? "Workflow failed");
  }

  if (status?.resumeStatus === "scored" || status?.runStatus === "completed") {
    return "Scored";
  }

  if (status?.currentPhase === "awaiting-agent-review") {
    return "Reviewing candidate";
  }

  if (status?.currentPhase === "extract-text") {
    return "Extracting resume text";
  }

  if (status?.currentPhase === "quota-wait") {
    return status.nextRetryAt
      ? `Waiting for model quota until ${new Date(status.nextRetryAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
      : "Waiting for model quota";
  }

  if (
    status?.currentPhase === "workflow-queued" ||
    status?.runStatus === "queued"
  ) {
    return status.workflowRunId
      ? `Workflow queued: ${status.workflowRunId}`
      : "Workflow queued";
  }

  const workflow = result.serverData.workflow;

  if (workflow.status === "triggered") {
    return workflow.workflowRunId
      ? `Workflow queued: ${workflow.workflowRunId}`
      : "Workflow queued";
  }

  if (workflow.status === "failed") {
    return workflow.error ?? "Workflow trigger failed";
  }

  return workflow.reason ?? "Workflow not triggered in this environment";
}

function formatFailureCategory(category: string) {
  return category
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function canRetryWorkflow(
  result: ResumeUploadResult,
  status: ResumeWorkflowStatus | undefined,
) {
  if (status?.runStatus === "failed" || status?.currentPhase === "failed") {
    return true;
  }

  if (
    status?.runStatus === "queued" ||
    status?.runStatus === "running" ||
    status?.runStatus === "completed" ||
    status?.currentPhase === "workflow-queued" ||
    status?.currentPhase === "extract-text" ||
    status?.currentPhase === "awaiting-agent-review" ||
    status?.currentPhase === "quota-wait"
  ) {
    return false;
  }

  return (
    result.serverData.workflow.status === "failed" ||
    result.serverData.workflow.status === "skipped"
  );
}

function mergeUploadResults(
  currentResults: ResumeUploadResult[],
  nextResults: ResumeUploadResult[],
) {
  const resultsByResumeId = new Map<string, ResumeUploadResult>();

  for (const result of [...currentResults, ...nextResults]) {
    resultsByResumeId.set(result.serverData.resumeId, result);
  }

  return Array.from(resultsByResumeId.values());
}

function createClientId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}
