import { WorkflowRetryAfterError } from "@upstash/workflow";
import { describe, expect, it } from "vitest";
import { ProviderQuotaDeferredError } from "@/lib/ai/provider-quota";
import { createWorkflowQuotaRetryError } from "./provider-quota";

describe("workflow provider quota deferral", () => {
  it("turns shared-ledger denial into a durable workflow retry", () => {
    const now = Date.now();
    const result = createWorkflowQuotaRetryError(
      new ProviderQuotaDeferredError({
        model: "model",
        provider: "groq",
        retryAt: new Date(now + 12_100),
      }),
      "master-review",
      now,
    );

    expect(result).toBeInstanceOf(WorkflowRetryAfterError);
    expect(result?.retryAfter).toBe(13);
  });

  it("leaves unrelated failures alone", () => {
    expect(
      createWorkflowQuotaRetryError(new Error("provider failed"), "master"),
    ).toBeNull();
  });
});
