import { z } from "zod";
import {
  cleanChunkId,
  filterCandidateCitations,
  normalizeModelConfidence,
  normalizeText,
  shorten,
} from "./evidence-helpers";
import type { CandidateAskCitation, CandidateAskResponse } from "./types";

export type CandidateAskAnswerDraft = Omit<
  CandidateAskResponse,
  "crawlRequest"
>;

const askModelOutputSchema = z.object({
  answer: z.string().min(1).max(2500),
  citationChunkIds: z.array(z.string()).max(8),
  confidence: z.enum(["high", "medium", "low"]),
  followUps: z.array(z.string()).max(5),
  gaps: z.array(z.string()).max(6),
  needsCrawl: z.boolean(),
});

const looseAskModelOutputSchema = z.object({
  answer: z.string().min(1).max(5000),
  citationChunkIds: z.array(z.string()).max(12).optional(),
  citationIds: z.array(z.string()).max(12).optional(),
  citations: z
    .array(
      z.union([
        z.string(),
        z.object({
          chunkId: z.string().optional(),
          id: z.string().optional(),
        }),
      ]),
    )
    .max(12)
    .optional(),
  confidence: z
    .union([z.enum(["high", "medium", "low"]), z.number().min(0).max(1)])
    .optional(),
  followUps: z.array(z.string()).max(8).optional(),
  gaps: z.array(z.string()).max(8).optional(),
  needsCrawl: z.boolean().optional(),
});

export function createGroundedAskModelResponse({
  citations,
  output,
  question,
}: {
  citations: CandidateAskCitation[];
  output: unknown;
  question: string;
}): CandidateAskAnswerDraft | null {
  const parsed = coerceAskModelOutput(output);
  if (!parsed) return null;

  const selectedCitations = filterCandidateCitations(
    citations,
    citations.filter((citation) =>
      parsed.citationChunkIds.includes(citation.chunkId),
    ),
  );
  const unsupportedTerms = findUnsupportedAnswerClaimTerms({
    answer: parsed.answer,
    citations: selectedCitations,
    gaps: parsed.gaps,
  });

  if (unsupportedTerms.length > 0) {
    const fallback = createExtractiveAskResponse({
      citations: selectedCitations,
      question,
    });

    return {
      ...fallback,
      confidence: "low",
      gaps: uniqueStrings([
        ...fallback.gaps,
        ...parsed.gaps,
        `Generated answer omitted unsupported claim(s): ${unsupportedTerms.join(
          ", ",
        )}.`,
      ]).slice(0, 6),
      needsCrawl: parsed.needsCrawl,
    };
  }

  return {
    answer: parsed.answer,
    citations: selectedCitations,
    confidence: parsed.confidence,
    followUps: parsed.followUps,
    gaps: parsed.gaps,
    needsCrawl: parsed.needsCrawl,
  };
}

export function createExtractiveAskResponse({
  citations,
  question,
}: {
  citations: CandidateAskCitation[];
  question: string;
}): CandidateAskAnswerDraft {
  const top = citations.slice(0, 3);

  return {
    answer: [
      `Stored evidence for "${question}":`,
      ...top.map((citation) => `- ${citation.title}: ${citation.snippet}`),
    ].join("\n"),
    citations: top,
    confidence: top.length >= 3 ? "medium" : "low",
    followUps: [
      "Ask which evidence supports the score.",
      "Ask what evidence is missing.",
    ],
    gaps:
      citations.length < 2
        ? ["Only limited stored evidence matched this question."]
        : [],
    needsCrawl: false,
  };
}

function coerceAskModelOutput(output: unknown) {
  const strict = askModelOutputSchema.safeParse(output);
  if (strict.success) return strict.data;

  const loose = looseAskModelOutputSchema.safeParse(output);
  if (!loose.success) return null;

  const citationChunkIds =
    loose.data.citationChunkIds ??
    loose.data.citationIds ??
    loose.data.citations
      ?.map((citation) =>
        typeof citation === "string"
          ? citation
          : (citation.chunkId ?? citation.id),
      )
      .filter((citationId): citationId is string => Boolean(citationId)) ??
    [];

  return askModelOutputSchema.parse({
    answer: shorten(loose.data.answer, 2400),
    citationChunkIds: citationChunkIds.map(cleanChunkId).slice(0, 8),
    confidence: normalizeModelConfidence(loose.data.confidence),
    followUps: (loose.data.followUps ?? []).slice(0, 5),
    gaps: (loose.data.gaps ?? []).slice(0, 6),
    needsCrawl: loose.data.needsCrawl ?? false,
  });
}

function findUnsupportedAnswerClaimTerms({
  answer,
  citations,
  gaps,
}: {
  answer: string;
  citations: CandidateAskCitation[];
  gaps: string[];
}) {
  const evidence = normalizeText(
    [
      ...citations.flatMap((citation) => [
        citation.title,
        citation.label,
        citation.snippet,
      ]),
      ...gaps,
    ].join(" "),
  ).toLowerCase();
  const negativeSentences = splitSentences(answer).filter((sentence) =>
    NEGATIVE_CLAIM_PATTERN.test(sentence),
  );
  const unsupported = new Set<string>();

  for (const sentence of negativeSentences) {
    for (const claim of GUARDED_CLAIM_TERMS) {
      if (hasTerm(sentence, claim) && !hasTerm(evidence, claim)) {
        unsupported.add(claim.label);
      }
    }
  }

  return Array.from(unsupported);
}

function splitSentences(value: string) {
  return value
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.trim().toLowerCase())
    .filter(Boolean);
}

function hasTerm(value: string, term: GuardedClaimTerm) {
  return term.patterns.some((pattern) => pattern.test(value));
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

interface GuardedClaimTerm {
  label: string;
  patterns: RegExp[];
}

const NEGATIVE_CLAIM_PATTERN =
  /\b(drag|dragged|weak|weigh|weighs|missing|gap|gaps|lack|lacks|unverified|unsupported|not higher|no evidence|limited)\b/i;

const GUARDED_CLAIM_TERMS: GuardedClaimTerm[] = [
  { label: "AI/LLM", patterns: [/\bai\b/i, /\bllm\b/i, /\blangchain\b/i] },
  { label: "Angular", patterns: [/\bangular\b/i] },
  { label: "Authentication", patterns: [/\bauth(?:entication)?\b/i] },
  { label: "AWS", patterns: [/\baws\b/i, /\bs3\b/i, /\blambda\b/i] },
  { label: "Azure", patterns: [/\bazure\b/i] },
  { label: "CI/CD", patterns: [/\bci\/cd\b/i, /\bgithub actions\b/i] },
  { label: "Docker", patterns: [/\bdocker\b/i] },
  { label: "Express", patterns: [/\bexpress\b/i] },
  { label: "GCP", patterns: [/\bgcp\b/i, /\bgoogle cloud\b/i] },
  { label: "GraphQL", patterns: [/\bgraphql\b/i] },
  { label: "Java", patterns: [/\bjava\b/i] },
  { label: "JavaScript", patterns: [/\bjavascript\b/i, /\bjs\b/i] },
  { label: "Kubernetes", patterns: [/\bkubernetes\b/i, /\bk8s\b/i] },
  { label: "MongoDB", patterns: [/\bmongodb\b/i, /\bmongo\b/i] },
  { label: "NestJS", patterns: [/\bnestjs\b/i, /\bnest\.js\b/i] },
  { label: "Next.js", patterns: [/\bnext\.?js\b/i] },
  { label: "Node.js", patterns: [/\bnode\.?js\b/i, /\bnode\b/i] },
  { label: "OAuth", patterns: [/\boauth\b/i] },
  { label: "PostgreSQL", patterns: [/\bpostgres(?:ql)?\b/i] },
  { label: "Python", patterns: [/\bpython\b/i] },
  { label: "RBAC", patterns: [/\brbac\b/i] },
  { label: "React", patterns: [/\breact\b/i] },
  { label: "Redis", patterns: [/\bredis\b/i] },
  { label: "SQL", patterns: [/\bsql\b/i] },
  { label: "Testing", patterns: [/\btesting\b/i, /\btests?\b/i] },
  { label: "TypeScript", patterns: [/\btypescript\b/i, /\bts\b/i] },
  { label: "Vue", patterns: [/\bvue\b/i, /\bvuejs\b/i] },
];
