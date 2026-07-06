import {
  type ResumePreflightFileInput,
  type ResumePreflightFileResult,
  type ResumePreflightProgress,
  validateResumePreflightFile,
} from "./resume-upload-preflight-rules";

type ValidateOptions = {
  onProgress?: (progress: ResumePreflightProgress) => void;
  signal?: AbortSignal;
};

type WorkerResultMessage = {
  id: string;
  results: ResumePreflightFileResult[];
  type: "result";
};

type WorkerProgressMessage = ResumePreflightProgress & {
  id: string;
  type: "progress";
};

type WorkerErrorMessage = {
  id: string;
  message: string;
  type: "error";
};

type WorkerCancelledMessage = {
  id: string;
  type: "cancelled";
};

type WorkerMessage =
  | WorkerCancelledMessage
  | WorkerErrorMessage
  | WorkerProgressMessage
  | WorkerResultMessage;

let workerSingleton: Worker | null = null;

function getWorker() {
  if (workerSingleton) return workerSingleton;

  workerSingleton = new Worker(
    new URL("./resume-upload-preflight.worker.ts", import.meta.url),
    { type: "module" },
  );

  return workerSingleton;
}

function canUseWorker() {
  return typeof Worker !== "undefined";
}

export async function validateResumeUploadFiles(
  files: ResumePreflightFileInput[],
  options?: ValidateOptions,
) {
  if (!canUseWorker()) {
    return validateInProcess(files, options);
  }

  const worker = getWorker();
  const id = createRequestId();

  return new Promise<ResumePreflightFileResult[]>((resolve, reject) => {
    const cleanup = () => {
      worker.removeEventListener("message", onMessage);
      worker.removeEventListener("error", onError);
      options?.signal?.removeEventListener("abort", onAbort);
    };

    const onAbort = () => {
      try {
        worker.postMessage({ id, type: "cancel" });
      } catch {
        // Ignore worker cancellation failures; the caller is already aborting.
      }
      cleanup();
      reject(new DOMException("Aborted", "AbortError"));
    };

    const onError = () => {
      cleanup();
      reject(new Error("Resume preflight worker error"));
    };

    const onMessage = (event: MessageEvent<WorkerMessage>) => {
      const message = event.data;
      if (!message || message.id !== id) return;

      if (message.type === "progress") {
        options?.onProgress?.({
          current: Number(message.current) || 0,
          total: Number(message.total) || 0,
        });
        return;
      }

      if (message.type === "cancelled") {
        cleanup();
        reject(new DOMException("Aborted", "AbortError"));
        return;
      }

      if (message.type === "error") {
        cleanup();
        reject(new Error(message.message || "Resume preflight failed"));
        return;
      }

      cleanup();
      resolve(message.results);
    };

    worker.addEventListener("message", onMessage);
    worker.addEventListener("error", onError);

    if (options?.signal) {
      if (options.signal.aborted) {
        onAbort();
        return;
      }
      options.signal.addEventListener("abort", onAbort);
    }

    worker.postMessage({ files, id, type: "validate" });
  });
}

function validateInProcess(
  files: ResumePreflightFileInput[],
  options?: ValidateOptions,
) {
  const results: ResumePreflightFileResult[] = [];
  const total = files.length;

  options?.onProgress?.({ current: 0, total });

  for (const [index, file] of files.entries()) {
    if (options?.signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }

    results.push(validateResumePreflightFile(file, index));
    options?.onProgress?.({ current: index + 1, total });
  }

  return results;
}

function createRequestId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
