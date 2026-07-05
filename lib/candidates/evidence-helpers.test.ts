import { describe, expect, it } from "vitest";
import {
  createEvidenceChunkId,
  extractPublicUrls,
  filterCandidateCitations,
  hashText,
  isCrawlablePublicUrl,
  normalizeModelConfidence,
  parseGithubPublicUrl,
  redactNonEvidenceUrls,
  scoreEvidenceChunk,
  shouldRecommendEvidenceCrawl,
} from "./evidence-helpers";

describe("candidate evidence helpers", () => {
  it("creates deterministic chunk ids from source identity and content hash", () => {
    const identity = {
      jobPostingId: "job_1",
      resumeId: "resume_1",
      sourceId: "resume-text",
      sourceType: "resume" as const,
    };
    const first = createEvidenceChunkId(identity, hashText("same content"));
    const second = createEvidenceChunkId(identity, hashText("same content"));
    const changed = createEvidenceChunkId(identity, hashText("changed"));

    expect(second).toBe(first);
    expect(changed).not.toBe(first);
  });

  it("extracts only bounded public evidence urls", () => {
    const urls = extractPublicUrls(
      [
        "https://github.com/acme/project",
        "https://portfolio.example.dev/path.",
        "http://localhost:3001/private",
        "https://linkedin.com/in/applicant",
        "https://mail.google.com/mail/u/0",
        "https://192.168.0.1/router",
      ].join(" "),
    );

    expect(urls).toEqual([
      "https://github.com/acme/project",
      "https://portfolio.example.dev/path",
    ]);
  });

  it("rejects metadata and special-purpose crawl targets", () => {
    expect(
      isCrawlablePublicUrl("http://169.254.169.254/latest/meta-data"),
    ).toBe(false);
    expect(isCrawlablePublicUrl("http://[::1]/private")).toBe(false);
    expect(isCrawlablePublicUrl("https://portfolio.example.dev")).toBe(true);
  });

  it("redacts non-evidence mail provider urls", () => {
    expect(
      redactNonEvidenceUrls("See https://mail.google.com/mail/u/0 for email."),
    ).toBe("See [email provider URL omitted] for email.");
  });

  it("parses GitHub profile and repository URLs for crawler enrichment", () => {
    expect(parseGithubPublicUrl("https://github.com/Eshan05")).toEqual({
      kind: "profile",
      owner: "Eshan05",
    });
    expect(parseGithubPublicUrl("https://github.com/acme/project")).toEqual({
      kind: "repo",
      owner: "acme",
      repo: "project",
    });
    expect(parseGithubPublicUrl("https://github.com/features/copilot")).toBe(
      null,
    );
  });

  it("filters model citations to retrieved chunks and falls back to top chunks", () => {
    const retrieved = [
      { chunkId: "a", snippet: "A" },
      { chunkId: "b", snippet: "B" },
      { chunkId: "c", snippet: "C" },
      { chunkId: "d", snippet: "D" },
    ];

    expect(
      filterCandidateCitations(retrieved, [{ chunkId: "b", snippet: "B" }]),
    ).toEqual([{ chunkId: "b", snippet: "B" }]);
    expect(
      filterCandidateCitations(retrieved, [
        { chunkId: "missing", snippet: "" },
      ]),
    ).toEqual(retrieved.slice(0, 3));
    expect(filterCandidateCitations(retrieved, [])).toEqual(
      retrieved.slice(0, 3),
    );
  });

  it("recommends crawl only when the question or gaps need public evidence", () => {
    expect(
      shouldRecommendEvidenceCrawl("Which GitHub repos support RBAC?", []),
    ).toBe(true);
    expect(
      shouldRecommendEvidenceCrawl("Why did this score 77?", [
        "Only limited stored evidence matched.",
      ]),
    ).toBe(false);
  });

  it("boosts pipeline and scoring evidence above raw resume text", () => {
    const question = "Why did auth RBAC support the project score?";
    const resumeScore = scoreEvidenceChunk(
      {
        content: "Built auth and RBAC for a dashboard.",
        sourceType: "resume",
        title: "Resume text",
      },
      question,
    );
    const pipelineScore = scoreEvidenceChunk(
      {
        content: "Project scorecard: auth and RBAC support the project score.",
        sourceType: "pipeline",
        title: "Project scorecards",
      },
      question,
    );

    expect(pipelineScore).toBeGreaterThan(resumeScore);
  });

  it("boosts crawled evidence for public profile questions", () => {
    const question = "What GitHub evidence supports project scoring?";
    const pipelineScore = scoreEvidenceChunk(
      {
        content: "GitHub URL available for later verification.",
        sourceType: "pipeline",
        title: "Profile crawling",
      },
      question,
    );
    const crawlScore = scoreEvidenceChunk(
      {
        content: "Eshan05 GitHub profile public repositories.",
        sourceType: "crawl",
        title: "Crawled public page: https://github.com/Eshan05",
      },
      question,
    );

    expect(crawlScore).toBeGreaterThan(pipelineScore);
  });

  it("boosts job criteria evidence for rubric and weight questions", () => {
    const question =
      "What required skills and weights are in the job criteria?";
    const jobScore = scoreEvidenceChunk(
      {
        content:
          "Required skills: React, Next.js, TypeScript. Job weights: skills 30, projects 30.",
        sourceType: "job",
        title: "Job criteria: Full Stack Intern",
      },
      question,
    );
    const crawlScore = scoreEvidenceChunk(
      {
        content:
          "GitHub repository uses TypeScript and React in a public project.",
        sourceType: "crawl",
        title: "GitHub repository evidence",
      },
      question,
    );

    expect(jobScore).toBeGreaterThan(crawlScore);
  });

  it("normalizes model confidence values", () => {
    expect(normalizeModelConfidence(0.9)).toBe("high");
    expect(normalizeModelConfidence(0.55)).toBe("medium");
    expect(normalizeModelConfidence(0.2)).toBe("low");
    expect(normalizeModelConfidence("high")).toBe("high");
    expect(normalizeModelConfidence()).toBe("medium");
  });
});
