import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getGroqRetryDelayMs,
  getSpecialistProviderOrder,
} from "./review-agent";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Groq retry delay", () => {
  it("honors short provider retry windows with a collision buffer", () => {
    expect(
      getGroqRetryDelayMs(
        new Error("Rate limit reached. Please try again in 4.05s."),
        1,
      ),
    ).toBe(5_050);
  });

  it("does not hold a function open for a long quota reset", () => {
    expect(
      getGroqRetryDelayMs(
        new Error("Rate limit reached. Please try again in 22m31.2s."),
        1,
      ),
    ).toBeNull();
  });

  it("uses exponential backoff when a rate-limit response omits timing", () => {
    expect(getGroqRetryDelayMs(new Error("HTTP 429"), 3)).toBe(4_000);
  });
});

describe("specialist provider routing", () => {
  it("reserves Cerebras for two evidence-heavy phases in balanced mode", () => {
    vi.stubEnv("RESUME_SPECIALIST_PROVIDER", "balanced");
    vi.stubEnv("RESUME_SPECIALIST_FALLBACK_PROVIDER", "groq");

    expect(getSpecialistProviderOrder("structured-data-extraction")).toEqual([
      "cerebras",
      "groq",
    ]);
    expect(getSpecialistProviderOrder("red-flag-detection")).toEqual([
      "cerebras",
      "groq",
    ]);
    expect(getSpecialistProviderOrder("applicant-info")).toEqual(["groq"]);
    expect(getSpecialistProviderOrder("fit-scoring")).toEqual(["groq"]);
  });

  it("keeps explicit single-provider routing available", () => {
    vi.stubEnv("RESUME_SPECIALIST_PROVIDER", "cerebras");
    vi.stubEnv("RESUME_SPECIALIST_FALLBACK_PROVIDER", "groq");

    expect(getSpecialistProviderOrder("applicant-info")).toEqual([
      "cerebras",
      "groq",
    ]);
  });
});
