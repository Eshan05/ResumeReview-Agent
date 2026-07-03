import { getResumeUploadBatch } from "@/lib/resume-batches/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const POLL_INTERVAL_MS = 1000;
const HEARTBEAT_INTERVAL_MS = 15_000;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ batchId: string }> },
) {
  const { batchId } = await params;
  const encoder = new TextEncoder();
  let lastSnapshot = "";
  let lastHeartbeatAt = 0;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, payload: unknown) => {
        controller.enqueue(
          encoder.encode(
            `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`,
          ),
        );
      };

      try {
        while (!request.signal.aborted) {
          const state = await getResumeUploadBatch(batchId);

          if (!state) {
            send("error", { message: `Resume batch ${batchId} was not found` });
            break;
          }

          const snapshot = JSON.stringify(toProgressPayload(state));
          const now = Date.now();

          if (snapshot !== lastSnapshot) {
            send("snapshot", JSON.parse(snapshot));
            lastSnapshot = snapshot;
            lastHeartbeatAt = now;
          } else if (now - lastHeartbeatAt >= HEARTBEAT_INTERVAL_MS) {
            send("heartbeat", { at: new Date(now).toISOString() });
            lastHeartbeatAt = now;
          }

          if (isTerminalBatchStatus(state.batch.status)) break;

          await sleep(POLL_INTERVAL_MS, request.signal);
        }
      } catch (error) {
        if (!request.signal.aborted) {
          send("error", {
            message:
              error instanceof Error
                ? error.message
                : "Batch progress stream failed",
          });
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream; charset=utf-8",
      "X-Accel-Buffering": "no",
    },
  });
}

function toProgressPayload(
  state: NonNullable<Awaited<ReturnType<typeof getResumeUploadBatch>>>,
) {
  return {
    batch: state.batch,
    items: state.items.map((item) => ({
      agentRunId: item.agentRunId,
      attempt: item.attempt,
      failureCategory: item.failureCategory,
      id: item.id,
      lastError: item.lastError,
      resumeId: item.resumeId,
      status: item.status,
      workflowRunId: item.workflowRunId,
      workflowStatus: item.workflowStatus,
    })),
  };
}

function isTerminalBatchStatus(status: string) {
  return (
    status === "cancelled" ||
    status === "completed" ||
    status === "failed" ||
    status === "partial"
  );
}

function sleep(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timeout);
        reject(new Error("Batch progress stream aborted"));
      },
      { once: true },
    );
  });
}
