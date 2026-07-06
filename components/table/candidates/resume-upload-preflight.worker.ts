import {
  type ResumePreflightFileInput,
  validateResumePreflightFile,
} from "./resume-upload-preflight-rules";

type ValidateRequest = {
  files: ResumePreflightFileInput[];
  id: string;
  type: "validate";
};

type CancelRequest = {
  id?: string;
  type: "cancel";
};

type RequestMessage = ValidateRequest | CancelRequest;

const cancelledIds = new Set<string>();

function post(message: unknown) {
  (self as unknown as Worker).postMessage(message);
}

self.onmessage = (event: MessageEvent<RequestMessage>) => {
  const message = event.data;

  if (message.type === "cancel") {
    if (message.id) cancelledIds.add(message.id);
    return;
  }

  if (message.type !== "validate") return;

  cancelledIds.delete(message.id);

  try {
    const results = [];
    const total = message.files.length;
    post({ current: 0, id: message.id, total, type: "progress" });

    for (const [index, file] of message.files.entries()) {
      if (cancelledIds.has(message.id)) {
        post({ id: message.id, type: "cancelled" });
        cancelledIds.delete(message.id);
        return;
      }

      results.push(validateResumePreflightFile(file, index));
      post({
        current: index + 1,
        id: message.id,
        total,
        type: "progress",
      });
    }

    post({ id: message.id, results, type: "result" });
  } catch (error) {
    post({
      id: message.id,
      message: error instanceof Error ? error.message : String(error),
      type: "error",
    });
  }
};
