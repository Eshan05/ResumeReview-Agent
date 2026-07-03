import { getResumeWorkflowStatuses } from "@/lib/resumes/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_STREAM_IDS = 25;
const POLL_INTERVAL_MS = 1000;
const HEARTBEAT_INTERVAL_MS = 15_000;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const resumeIds = parseResumeIds(url.searchParams.get("ids"));

  if (resumeIds.length === 0) {
    return new Response("At least one resume id is required", { status: 400 });
  }

  if (resumeIds.length > MAX_STREAM_IDS) {
    return new Response(
      `At most ${MAX_STREAM_IDS} resume ids can be streamed`,
      {
        status: 400,
      },
    );
  }

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
          const statuses = await getResumeWorkflowStatuses(resumeIds);
          const snapshot = JSON.stringify({ statuses });
          const now = Date.now();

          if (snapshot !== lastSnapshot) {
            send("snapshot", { statuses });
            lastSnapshot = snapshot;
            lastHeartbeatAt = now;
          } else if (now - lastHeartbeatAt >= HEARTBEAT_INTERVAL_MS) {
            send("heartbeat", { at: new Date(now).toISOString() });
            lastHeartbeatAt = now;
          }

          if (statuses.length > 0 && statuses.every(isTerminalStatus)) {
            break;
          }

          await sleep(POLL_INTERVAL_MS, request.signal);
        }
      } catch (error) {
        if (!request.signal.aborted) {
          send("error", {
            message:
              error instanceof Error ? error.message : "Progress stream failed",
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

function parseResumeIds(value: string | null) {
  if (!value) return [];

  return Array.from(
    new Set(
      value
        .split(",")
        .map((resumeId) => resumeId.trim())
        .filter(Boolean),
    ),
  );
}

function isTerminalStatus(status: {
  currentPhase: string | null;
  resumeStatus: string;
  runStatus: string | null;
}) {
  return (
    status.runStatus === "completed" ||
    status.runStatus === "failed" ||
    status.currentPhase === "failed" ||
    status.resumeStatus === "scored"
  );
}

function sleep(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timeout);
        reject(new Error("Progress stream aborted"));
      },
      { once: true },
    );
  });
}
