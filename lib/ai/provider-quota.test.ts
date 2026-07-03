import { afterEach, describe, expect, it, vi } from "vitest";
import {
  estimateModelTokens,
  getProviderQuotaPolicy,
  isProviderQuotaDeferredError,
  ProviderQuotaDeferredError,
  ProviderQuotaRequestTooLargeError,
  reserveProviderQuota,
} from "./provider-quota";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("provider quota policy", () => {
  it("keeps safety headroom below published free-tier limits", () => {
    expect(getProviderQuotaPolicy("cerebras", "gpt-oss-120b")).toEqual({
      requestsPerDay: 800_000,
      requestsPerMinute: 4,
      tokensPerDay: 800_000,
      tokensPerHour: 800_000,
      tokensPerMinute: 24_000,
    });
    expect(getProviderQuotaPolicy("groq", "llama-3.3-70b-versatile")).toEqual({
      requestsPerDay: 800,
      requestsPerMinute: 24,
      tokensPerDay: 80_000,
      tokensPerHour: 80_000,
      tokensPerMinute: 9_600,
    });
  });

  it("reserves batch headroom for interactive Candidate Ask calls", () => {
    expect(
      getProviderQuotaPolicy("groq", "llama-3.3-70b-versatile", "ask")
        .tokensPerMinute,
    ).toBe(11_400);
  });

  it("supports deployment-specific overrides without removing headroom", () => {
    vi.stubEnv("GROQ_QUOTA_TPM", "20000");
    vi.stubEnv("GROQ_QUOTA_HEADROOM", "0.8");
    expect(getProviderQuotaPolicy("groq", "custom").tokensPerMinute).toBe(
      16_000,
    );
  });
});

describe("provider quota accounting", () => {
  it("estimates input plus bounded completion tokens", () => {
    expect(estimateModelTokens("a".repeat(400), 200)).toBe(300);
  });

  it("recognizes quota deferrals across workflow error boundaries", () => {
    const error = new ProviderQuotaDeferredError({
      model: "model",
      provider: "groq",
      retryAt: new Date(Date.now() + 1_000),
    });
    expect(isProviderQuotaDeferredError(error)).toBe(true);
  });

  it("rejects a request that can never fit instead of retrying forever", async () => {
    vi.stubEnv("PROVIDER_QUOTA_SCHEDULER_ENABLED", "false");
    await expect(
      reserveProviderQuota({
        estimatedTokens: 50_000,
        model: "gpt-oss-120b",
        provider: "cerebras",
        requestKind: "specialist",
      }),
    ).rejects.toBeInstanceOf(ProviderQuotaRequestTooLargeError);
  });
});
