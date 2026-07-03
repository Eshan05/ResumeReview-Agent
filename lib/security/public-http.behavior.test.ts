import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  addresses: [{ address: "93.184.216.34", family: 4 }],
  dnsLookup: vi.fn(),
  mode: "ok" as
    | "ok"
    | "redirect-private"
    | "large"
    | "stream-large"
    | "timeout",
  request: vi.fn(),
}));

vi.mock("node:dns", () => ({ lookup: mocks.dnsLookup }));
vi.mock("node:http", () => ({ request: mocks.request }));
vi.mock("node:https", () => ({ request: mocks.request }));

import { fetchPublicHttpUrl } from "./public-http";

describe("public HTTP fetch behavior", () => {
  beforeEach(() => {
    mocks.addresses = [{ address: "93.184.216.34", family: 4 }];
    mocks.mode = "ok";
    mocks.dnsLookup.mockReset();
    mocks.request.mockReset();
    mocks.dnsLookup.mockImplementation((...args: unknown[]) => {
      const callback = args.at(-1) as (
        error: Error | null,
        addresses: Array<{ address: string; family: number }>,
      ) => void;
      callback(null, mocks.addresses);
    });
    mocks.request.mockImplementation(
      (
        url: URL,
        options: {
          lookup: (
            hostname: string,
            options: { all: boolean; family: number; hints: number },
            callback: (error: Error | null) => void,
          ) => void;
          signal: AbortSignal;
        },
        callback: (response: MockResponse) => void,
      ) => createMockRequest(url, options, callback),
    );
  });

  it("rejects mixed public and private DNS answers before connecting", async () => {
    mocks.addresses = [
      { address: "93.184.216.34", family: 4 },
      { address: "127.0.0.1", family: 4 },
    ];

    await expect(fetchPublicHttpUrl("https://example.com")).rejects.toThrow(
      /private|special-purpose/i,
    );
  });

  it("revalidates redirect destinations", async () => {
    mocks.mode = "redirect-private";

    await expect(
      fetchPublicHttpUrl("https://example.com/redirect"),
    ).rejects.toThrow(/private|special-purpose/i);
    expect(mocks.request).toHaveBeenCalledTimes(1);
  });

  it("rejects oversized declared and streamed responses", async () => {
    mocks.mode = "large";
    await expect(
      fetchPublicHttpUrl("https://example.com/large", { maxBytes: 10 }),
    ).rejects.toThrow(/size limit/i);

    mocks.mode = "stream-large";
    await expect(
      fetchPublicHttpUrl("https://example.com/stream", { maxBytes: 10 }),
    ).rejects.toThrow(/size limit/i);
  });

  it("aborts requests that exceed the timeout", async () => {
    mocks.mode = "timeout";

    await expect(
      fetchPublicHttpUrl("https://example.com/slow", { timeoutMs: 5 }),
    ).rejects.toThrow(/timed out/i);
  });
});

interface MockResponse extends EventEmitter {
  destroy(error?: Error): void;
  headers: Record<string, string>;
  resume(): void;
  statusCode: number;
}

function createMockRequest(
  url: URL,
  options: {
    lookup: (
      hostname: string,
      options: { all: boolean; family: number; hints: number },
      callback: (error: Error | null) => void,
    ) => void;
    signal: AbortSignal;
  },
  callback: (response: MockResponse) => void,
) {
  const request = new EventEmitter() as EventEmitter & { end(): void };
  options.signal.addEventListener("abort", () => {
    request.emit(
      "error",
      options.signal.reason instanceof Error
        ? options.signal.reason
        : new Error("Request aborted"),
    );
  });
  request.end = () => {
    if (mocks.mode === "timeout") return;
    options.lookup(
      url.hostname,
      { all: false, family: 0, hints: 0 },
      (error) => {
        if (error) {
          request.emit("error", error);
          return;
        }
        emitResponse(callback);
      },
    );
  };
  return request;
}

function emitResponse(callback: (response: MockResponse) => void) {
  const response = new EventEmitter() as MockResponse;
  response.statusCode = mocks.mode === "redirect-private" ? 302 : 200;
  response.headers =
    mocks.mode === "redirect-private"
      ? { location: "http://169.254.169.254/latest/meta-data" }
      : mocks.mode === "large"
        ? { "content-length": "100" }
        : { "content-type": "text/plain" };
  response.resume = vi.fn();
  response.destroy = (error) => {
    if (error) queueMicrotask(() => response.emit("error", error));
  };
  callback(response);

  if (mocks.mode === "redirect-private" || mocks.mode === "large") return;
  queueMicrotask(() => {
    response.emit(
      "data",
      Buffer.from(mocks.mode === "stream-large" ? "too many bytes" : "ok"),
    );
    response.emit("end");
  });
}
