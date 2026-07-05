import { createHash } from "node:crypto";
import type { CandidateEvidenceSourceType } from "@/lib/db/app";
import { parsePublicHttpUrl } from "@/lib/security/public-http";

export interface EvidenceChunkIdentityInput {
  jobPostingId: string;
  resumeId?: string | null;
  sourceId: string;
  sourceType: CandidateEvidenceSourceType;
}

export interface EvidenceScoringChunk {
  content: string;
  sourceType: CandidateEvidenceSourceType;
  title: string;
}

export interface GithubPublicUrl {
  kind: "profile" | "repo";
  owner: string;
  repo?: string;
}

export const NON_EVIDENCE_CRAWL_HOSTS = new Set([
  "gmail.com",
  "googlemail.com",
  "mail.google.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "yahoo.com",
  "icloud.com",
  "proton.me",
  "protonmail.com",
]);

export function createEvidenceChunkId(
  chunk: EvidenceChunkIdentityInput,
  contentHash: string,
) {
  return [
    "chunk",
    chunk.sourceType,
    chunk.jobPostingId,
    chunk.resumeId ?? "job",
    hashText(chunk.sourceId).slice(0, 12),
    contentHash.slice(0, 16),
  ].join(":");
}

export function hashText(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function filterCandidateCitations<TCitation extends { chunkId: string }>(
  retrieved: TCitation[],
  selected: TCitation[],
) {
  if (selected.length === 0) return retrieved.slice(0, 3);
  const selectedIds = new Set(selected.map((citation) => citation.chunkId));
  const filtered = retrieved.filter((citation) =>
    selectedIds.has(citation.chunkId),
  );
  return filtered.length > 0 ? filtered : retrieved.slice(0, 3);
}

export function scoreEvidenceChunk(
  chunk: EvidenceScoringChunk,
  question: string,
) {
  const terms = tokenize(question);
  if (terms.length === 0) return 0;

  const haystack = `${chunk.title} ${chunk.content}`.toLowerCase();
  const matchedTerms = terms.filter((term) => haystack.includes(term));
  if (matchedTerms.length === 0) return 0;

  const sourceBoost: Record<CandidateEvidenceSourceType, number> = {
    crawl: 4,
    job: 3,
    pipeline: 6,
    result: 5,
    resume: 2,
  };
  const crawlIntentBoost =
    chunk.sourceType === "crawl" &&
    /\b(github|repository|repo|portfolio|public|crawl|profile|leetcode|huggingface|live demo)\b/i.test(
      question,
    )
      ? 10
      : 0;
  const rubricIntentBoost =
    chunk.sourceType === "job" &&
    /\b(criteria|rubric|weights?|requirements?|required skills?|must-have|bonus skills?|education preference|scoring criteria)\b/i.test(
      question,
    )
      ? 10
      : 0;
  const phraseBoost = haystack.includes(question.toLowerCase()) ? 8 : 0;
  const density = matchedTerms.length / Math.max(1, terms.length);

  return (
    sourceBoost[chunk.sourceType] +
    crawlIntentBoost +
    rubricIntentBoost +
    phraseBoost +
    density * 10
  );
}

export function shouldRecommendEvidenceCrawl(question: string, gaps: string[]) {
  return /\b(github|leetcode|huggingface|portfolio|repo|repository|code|crawl|external|profile|live|demo)\b/i.test(
    `${question} ${gaps.join(" ")}`,
  );
}

export function extractPublicUrls(text: string) {
  return Array.from(text.matchAll(/https?:\/\/[^\s"'<>),;]+/gi), (match) =>
    normalizeUrl(match[0]),
  ).filter(isCrawlablePublicUrl);
}

export function redactNonEvidenceUrls(value: string) {
  return value.replace(/https?:\/\/[^\s"'<>),;]+/gi, (match) => {
    const normalized = normalizeUrl(match);
    try {
      const host = new URL(normalized).hostname.replace(/^www\./i, "");
      if (NON_EVIDENCE_CRAWL_HOSTS.has(host)) {
        return "[email provider URL omitted]";
      }
    } catch {
      return match;
    }
    return normalized;
  });
}

export function isCrawlablePublicUrl(value: string) {
  try {
    const url = parsePublicHttpUrl(value);
    if (/linkedin\.com/i.test(url.hostname)) return false;
    if (NON_EVIDENCE_CRAWL_HOSTS.has(url.hostname.replace(/^www\./i, ""))) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function parseGithubPublicUrl(value: string): GithubPublicUrl | null {
  try {
    const url = new URL(normalizeUrl(value));
    const host = url.hostname.replace(/^www\./i, "").toLowerCase();
    if (host !== "github.com") return null;

    const parts = url.pathname
      .split("/")
      .map((part) => part.trim())
      .filter(Boolean);
    const owner = parts[0];

    if (!owner || GITHUB_NON_PROFILE_PATHS.has(owner.toLowerCase())) {
      return null;
    }

    const repo = parts[1];
    if (!repo) return { kind: "profile", owner };
    if (GITHUB_NON_REPO_PATHS.has(repo.toLowerCase())) {
      return { kind: "profile", owner };
    }

    return {
      kind: "repo",
      owner,
      repo,
    };
  } catch {
    return null;
  }
}

export function chunkText(text: string) {
  const paragraphs = normalizeText(text)
    .split(/\n{2,}/)
    .map((item) => item.trim())
    .filter(Boolean);
  const chunks: string[] = [];
  let current = "";

  for (const paragraph of paragraphs) {
    if (`${current}\n\n${paragraph}`.length > 1200 && current) {
      chunks.push(current);
      current = paragraph;
    } else {
      current = [current, paragraph].filter(Boolean).join("\n\n");
    }
  }

  if (current) chunks.push(current);
  return chunks.length > 0 ? chunks : [normalizeText(text)].filter(Boolean);
}

export function extractReadableText(value: string) {
  return normalizeText(
    value
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">"),
  );
}

export function normalizeModelConfidence(
  confidence?: "high" | "low" | "medium" | number,
) {
  if (typeof confidence === "string") return confidence;
  if (typeof confidence === "number") {
    if (confidence >= 0.75) return "high";
    if (confidence >= 0.45) return "medium";
    return "low";
  }
  return "medium";
}

export function cleanChunkId(chunkId: string) {
  return chunkId.trim().replace(/^\[/, "").replace(/\]$/, "");
}

export function normalizeText(value: string) {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function normalizeUrl(value: string) {
  return value.replace(/[),.;]+$/g, "").trim();
}

export function shorten(value: string, maxLength: number) {
  const normalized = normalizeText(value).replace(/\n+/g, " ");
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1).trim()}...`;
}

function tokenize(value: string) {
  return Array.from(
    new Set(
      value
        .toLowerCase()
        .split(/[^a-z0-9+#.]+/)
        .map((term) => term.trim())
        .filter((term) => term.length >= 2),
    ),
  );
}

const GITHUB_NON_PROFILE_PATHS = new Set([
  "about",
  "apps",
  "blog",
  "collections",
  "contact",
  "customer-stories",
  "enterprise",
  "events",
  "explore",
  "features",
  "login",
  "marketplace",
  "new",
  "notifications",
  "orgs",
  "organizations",
  "pricing",
  "pulls",
  "search",
  "security",
  "settings",
  "sponsors",
  "team",
  "topics",
]);

const GITHUB_NON_REPO_PATHS = new Set([
  "followers",
  "following",
  "gists",
  "packages",
  "projects",
  "repositories",
  "stars",
  "tab",
]);
