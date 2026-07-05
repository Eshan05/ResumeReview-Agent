import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import {
  formatUntrustedModelData,
  UNTRUSTED_MODEL_DATA_INSTRUCTIONS,
} from "@/lib/ai/prompt-security";
import {
  estimateModelTokens,
  runWithProviderQuota,
} from "@/lib/ai/provider-quota";
import {
  agentRuns,
  type CandidateCrawlRunStatus,
  type CandidateEvidenceSourceType,
  candidateCrawlRuns,
  candidateEvidenceChunks,
  jobPostings,
  resumeResults,
  resumes,
} from "@/lib/db/app";
import {
  formatJobCriteriaForPrompt,
  normalizeJobCriteria,
  normalizeJobWeights,
} from "@/lib/jobs/criteria";
import { crawlPlatformUrl } from "@/lib/resumes/platform-crawlers";
import { fetchPublicHttpUrl } from "@/lib/security/public-http";
import {
  createExtractiveAskResponse,
  createGroundedAskModelResponse,
} from "./ask-grounding";
import {
  chunkText,
  createEvidenceChunkId,
  extractPublicUrls,
  extractReadableText,
  filterCandidateCitations,
  hashText,
  isCrawlablePublicUrl,
  normalizeText,
  parseGithubPublicUrl,
  redactNonEvidenceUrls,
  scoreEvidenceChunk,
  shorten,
  shouldRecommendEvidenceCrawl,
} from "./evidence-helpers";
import {
  type CandidateAskCitation,
  type CandidateAskResponse,
  candidateAskResponseSchema,
} from "./types";

type EvidenceChunkRecord = typeof candidateEvidenceChunks.$inferSelect;

interface ParsedEvidenceItem {
  label: string;
  snippet: string;
}

interface ParsedSubAgent {
  findings: string[];
  id: string;
  name: string;
  summary: string;
}

interface ParsedPhaseItem {
  action: string;
  evidence: ParsedEvidenceItem[];
  id: string;
  subAgents: ParsedSubAgent[];
  summary: string;
  title: string;
}

interface EvidenceChunkInput {
  content: string;
  jobPostingId: string;
  metadata?: Record<string, unknown>;
  resumeId?: string | null;
  sourceId: string;
  sourceType: CandidateEvidenceSourceType;
  title: string;
}

const MAX_RETRIEVED_CHUNKS = 10;
const MAX_CRAWL_PAGES = 8;
const CRAWL_TIMEOUT_MS = 8000;

export async function indexCandidateEvidenceForAgentRun(agentRunId: string) {
  const db = await getDatabase();
  const [record] = await db
    .select({
      job: jobPostings,
      result: resumeResults,
      resume: resumes,
      run: agentRuns,
    })
    .from(agentRuns)
    .innerJoin(resumes, eq(resumes.id, agentRuns.resumeId))
    .innerJoin(jobPostings, eq(jobPostings.id, agentRuns.jobPostingId))
    .leftJoin(resumeResults, eq(resumeResults.agentRunId, agentRuns.id))
    .where(eq(agentRuns.id, agentRunId))
    .limit(1);

  if (!record?.result) return { chunksIndexed: 0 };

  return indexCandidateEvidenceRecord(record);
}

export async function refreshJobCriteriaEvidence(jobId: string) {
  const db = await getDatabase();
  const [job] = await db
    .select()
    .from(jobPostings)
    .where(eq(jobPostings.id, jobId))
    .limit(1);

  if (!job) return { chunksIndexed: 0 };

  await db
    .delete(candidateEvidenceChunks)
    .where(
      and(
        eq(candidateEvidenceChunks.jobPostingId, jobId),
        eq(candidateEvidenceChunks.sourceType, "job"),
      ),
    );

  await upsertEvidenceChunks([buildJobEvidenceChunk(job)]);

  return { chunksIndexed: 1 };
}

export async function askCandidateEvidence({
  candidateId,
  question,
}: {
  candidateId: string;
  question: string;
}): Promise<CandidateAskResponse | null> {
  const db = await getDatabase();
  const [resume] = await db
    .select()
    .from(resumes)
    .where(eq(resumes.id, candidateId))
    .limit(1);

  if (!resume) return null;

  await ensureCandidateEvidenceIndexed(candidateId);

  const chunks = await searchEvidenceChunks({
    candidateId,
    jobId: resume.jobPostingId,
    limit: MAX_RETRIEVED_CHUNKS,
    question,
    scope: "candidate",
  });

  return answerFromEvidence({
    candidateId,
    chunks,
    jobId: resume.jobPostingId,
    question,
    scope: "candidate",
  });
}

export async function askJobEvidence({
  jobId,
  question,
}: {
  jobId: string;
  question: string;
}): Promise<CandidateAskResponse | null> {
  const db = await getDatabase();
  const [job] = await db
    .select()
    .from(jobPostings)
    .where(eq(jobPostings.id, jobId))
    .limit(1);

  if (!job) return null;

  await ensureJobEvidenceIndexed(jobId);

  const chunks = await searchEvidenceChunks({
    jobId,
    limit: MAX_RETRIEVED_CHUNKS,
    question,
    scope: "job",
  });

  return answerFromEvidence({
    chunks,
    jobId,
    question,
    scope: "job",
  });
}

export async function crawlCandidateEvidence({
  candidateId,
  reason,
  runId,
}: {
  candidateId: string;
  reason?: string;
  runId?: string;
}) {
  const db = await getDatabase();
  const [resume] = await db
    .select()
    .from(resumes)
    .where(eq(resumes.id, candidateId))
    .limit(1);

  if (!resume) return null;

  await ensureCandidateEvidenceIndexed(candidateId);
  if (runId) await updateCandidateCrawlRun(runId, { status: "running" });

  const existingRun = runId ? await getCandidateCrawlRunById(runId) : null;
  const urls =
    existingRun && existingRun.urls.length > 0
      ? existingRun.urls
      : await getCandidatePublicUrls(candidateId);
  const chunks: EvidenceChunkInput[] = [];

  for (const url of urls.slice(0, MAX_CRAWL_PAGES)) {
    const crawled = await crawlPublicUrl(url);
    chunks.push({
      content: crawled.content,
      jobPostingId: resume.jobPostingId,
      metadata: {
        reason,
        status: crawled.status,
        url,
      },
      resumeId: candidateId,
      sourceId: url,
      sourceType: "crawl",
      title: crawled.title,
    });
  }

  await db
    .delete(candidateEvidenceChunks)
    .where(
      and(
        eq(candidateEvidenceChunks.resumeId, candidateId),
        eq(candidateEvidenceChunks.sourceType, "crawl"),
      ),
    );

  if (chunks.length > 0) await upsertEvidenceChunks(chunks);
  if (runId) {
    await updateCandidateCrawlRun(runId, {
      chunksIndexed: chunks.length,
      status: chunks.length > 0 ? "completed" : "skipped",
    });
  }

  return {
    chunksIndexed: chunks.length,
    urls,
  };
}

export async function createCandidateCrawlRun({
  candidateId,
  reason,
}: {
  candidateId: string;
  reason?: string;
}) {
  const db = await getDatabase();
  const [resume] = await db
    .select()
    .from(resumes)
    .where(eq(resumes.id, candidateId))
    .limit(1);

  if (!resume) return null;

  await ensureCandidateEvidenceIndexed(candidateId);
  const urls = await getCandidatePublicUrls(candidateId);
  const status: CandidateCrawlRunStatus =
    urls.length > 0 ? "queued" : "skipped";
  const [run] = await db
    .insert(candidateCrawlRuns)
    .values({
      completedAt: status === "skipped" ? new Date() : null,
      error:
        status === "skipped"
          ? "No crawlable public profile or project URLs were found."
          : null,
      id: `candidate-crawl-run-${crypto.randomUUID()}`,
      jobPostingId: resume.jobPostingId,
      reason,
      resumeId: candidateId,
      startedAt: null,
      status,
      urls,
    })
    .returning();

  return run ? toCandidateCrawlRunResponse(run) : null;
}

export async function markCandidateCrawlRunTriggered({
  runId,
  workflowRunId,
}: {
  runId: string;
  workflowRunId: string;
}) {
  return updateCandidateCrawlRun(runId, {
    status: "triggered",
    workflowRunId,
  });
}

export async function markCandidateCrawlRunSkipped({
  error,
  runId,
}: {
  error: string;
  runId: string;
}) {
  return updateCandidateCrawlRun(runId, {
    error,
    status: "skipped",
  });
}

export async function markCandidateCrawlRunFailed({
  error,
  runId,
}: {
  error: string;
  runId: string;
}) {
  return updateCandidateCrawlRun(runId, {
    error,
    status: "failed",
  });
}

export async function getCandidateCrawlRun({
  candidateId,
  runId,
}: {
  candidateId: string;
  runId?: string | null;
}) {
  const db = await getDatabase();
  const rows = await db
    .select()
    .from(candidateCrawlRuns)
    .where(
      runId
        ? and(
            eq(candidateCrawlRuns.resumeId, candidateId),
            eq(candidateCrawlRuns.id, runId),
          )
        : eq(candidateCrawlRuns.resumeId, candidateId),
    )
    .orderBy(desc(candidateCrawlRuns.createdAt))
    .limit(1);

  return rows[0] ? toCandidateCrawlRunResponse(rows[0]) : null;
}

async function indexCandidateEvidenceRecord({
  job,
  result,
  resume,
  run,
}: {
  job: typeof jobPostings.$inferSelect;
  result: typeof resumeResults.$inferSelect | null;
  resume: typeof resumes.$inferSelect;
  run: typeof agentRuns.$inferSelect;
}) {
  const db = await getDatabase();
  const chunks = buildEvidenceChunks({ job, result, resume, run });

  await db
    .delete(candidateEvidenceChunks)
    .where(
      and(
        eq(candidateEvidenceChunks.resumeId, resume.id),
        inArray(candidateEvidenceChunks.sourceType, [
          "pipeline",
          "result",
          "resume",
        ]),
      ),
    );

  if (chunks.length > 0) await upsertEvidenceChunks(chunks);

  return { chunksIndexed: chunks.length };
}

async function ensureCandidateEvidenceIndexed(candidateId: string) {
  const db = await getDatabase();
  const existing = await db
    .select({ id: candidateEvidenceChunks.id })
    .from(candidateEvidenceChunks)
    .where(eq(candidateEvidenceChunks.resumeId, candidateId))
    .limit(1);

  if (existing.length > 0) return;

  const [run] = await db
    .select({ id: agentRuns.id })
    .from(agentRuns)
    .innerJoin(resumeResults, eq(resumeResults.agentRunId, agentRuns.id))
    .where(eq(agentRuns.resumeId, candidateId))
    .orderBy(desc(resumeResults.createdAt), desc(resumeResults.id))
    .limit(1);

  if (run) await indexCandidateEvidenceForAgentRun(run.id);
}

async function ensureJobEvidenceIndexed(jobId: string) {
  const db = await getDatabase();
  const candidates = await db
    .select({ id: resumes.id })
    .from(resumes)
    .where(eq(resumes.jobPostingId, jobId));

  for (const candidate of candidates) {
    await ensureCandidateEvidenceIndexed(candidate.id);
  }
}

function buildEvidenceChunks({
  job,
  result,
  resume,
  run,
}: {
  job: typeof jobPostings.$inferSelect;
  result: typeof resumeResults.$inferSelect | null;
  resume: typeof resumes.$inferSelect;
  run: typeof agentRuns.$inferSelect;
}): EvidenceChunkInput[] {
  const chunks: EvidenceChunkInput[] = [buildJobEvidenceChunk(job)];

  if (resume.rawText) {
    chunks.push(
      ...chunkText(resume.rawText).map((content, index) => ({
        content,
        jobPostingId: job.id,
        metadata: { fileName: resume.fileName, index },
        resumeId: resume.id,
        sourceId: `${resume.id}:resume:${index}`,
        sourceType: "resume" as const,
        title: `${resume.fileName} resume text ${index + 1}`,
      })),
    );
  }

  chunks.push(
    ...buildResultChunks({ jobId: job.id, result, resumeId: resume.id }),
  );
  chunks.push(
    ...buildPipelineChunks({ jobId: job.id, resumeId: resume.id, run }),
  );

  return chunks.filter((chunk) => normalizeText(chunk.content).length > 0);
}

function buildResultChunks({
  jobId,
  result,
  resumeId,
}: {
  jobId: string;
  result: typeof resumeResults.$inferSelect | null;
  resumeId: string;
}): EvidenceChunkInput[] {
  if (!result) return [];

  return compactChunkInputs([
    {
      content: [
        `Final score: ${result.finalScore ?? "unknown"}`,
        `Summary: ${result.summary ?? ""}`,
      ].join("\n"),
      jobPostingId: jobId,
      resumeId,
      sourceId: `${resumeId}:result:summary`,
      sourceType: "result",
      title: "Final review summary",
    },
    {
      content: JSON.stringify(result.skills ?? {}, null, 2),
      jobPostingId: jobId,
      resumeId,
      sourceId: `${resumeId}:result:skills`,
      sourceType: "result",
      title: "Skill extraction and verification",
    },
    {
      content: JSON.stringify(result.projects ?? {}, null, 2),
      jobPostingId: jobId,
      resumeId,
      sourceId: `${resumeId}:result:projects`,
      sourceType: "result",
      title: "Project matching result",
    },
    {
      content: JSON.stringify(result.redFlags ?? [], null, 2),
      jobPostingId: jobId,
      resumeId,
      sourceId: `${resumeId}:result:flags`,
      sourceType: "result",
      title: "Risk and red flags",
    },
  ]);
}

function buildPipelineChunks({
  jobId,
  resumeId,
  run,
}: {
  jobId: string;
  resumeId: string;
  run: typeof agentRuns.$inferSelect;
}): EvidenceChunkInput[] {
  const phases = parsePhaseItems(run.phases);
  const chunks: EvidenceChunkInput[] = [];

  for (const phase of phases) {
    chunks.push({
      content: [
        phase.title,
        phase.summary,
        phase.action,
        ...phase.evidence.map((item) => `${item.label}: ${item.snippet}`),
      ].join("\n\n"),
      jobPostingId: jobId,
      metadata: { phaseId: phase.id },
      resumeId,
      sourceId: `${resumeId}:phase:${phase.id}:evidence`,
      sourceType: "pipeline",
      title: `${phase.title} evidence`,
    });

    for (const agent of phase.subAgents) {
      chunks.push({
        content: [agent.name, agent.summary, ...agent.findings].join("\n"),
        jobPostingId: jobId,
        metadata: { agentId: agent.id, phaseId: phase.id },
        resumeId,
        sourceId: `${resumeId}:phase:${phase.id}:agent:${agent.id}`,
        sourceType: "pipeline",
        title: `${phase.title}: ${agent.name}`,
      });
    }
  }

  return compactChunkInputs(chunks);
}

function buildJobEvidenceChunk(
  job: typeof jobPostings.$inferSelect,
): EvidenceChunkInput {
  return {
    content: [
      `Job title: ${job.title}`,
      "Job description:",
      job.description,
      "Structured criteria:",
      formatJobCriteriaForPrompt(normalizeJobCriteria(job.criteria)),
    ].join("\n\n"),
    jobPostingId: job.id,
    metadata: {
      criteria: normalizeJobCriteria(job.criteria),
      employmentType: job.employmentType,
      weights: normalizeJobWeights(job.weights),
    },
    resumeId: null,
    sourceId: `${job.id}:description`,
    sourceType: "job",
    title: `Job criteria: ${job.title}`,
  };
}

function compactChunkInputs(chunks: EvidenceChunkInput[]) {
  return chunks.filter((chunk) => normalizeText(chunk.content).length > 0);
}

async function upsertEvidenceChunks(chunks: EvidenceChunkInput[]) {
  const db = await getDatabase();
  const values = chunks.map((chunk) => {
    const content = normalizeText(chunk.content);
    const contentHash = hashText(content);
    return {
      content,
      contentHash,
      id: createEvidenceChunkId(chunk, contentHash),
      jobPostingId: chunk.jobPostingId,
      metadata: chunk.metadata ?? {},
      resumeId: chunk.resumeId ?? null,
      sourceId: chunk.sourceId,
      sourceType: chunk.sourceType,
      title: chunk.title,
    };
  });

  if (values.length === 0) return;

  await db
    .insert(candidateEvidenceChunks)
    .values(values)
    .onConflictDoUpdate({
      target: candidateEvidenceChunks.id,
      set: {
        content: sql`excluded.content`,
        contentHash: sql`excluded.content_hash`,
        metadata: sql`excluded.metadata`,
        title: sql`excluded.title`,
        updatedAt: new Date(),
      },
    });
}

async function searchEvidenceChunks({
  candidateId,
  jobId,
  limit,
  question,
  scope,
}: {
  candidateId?: string;
  jobId: string;
  limit: number;
  question: string;
  scope: "candidate" | "job";
}) {
  const db = await getDatabase();
  const scopeWhere =
    scope === "candidate" && candidateId
      ? or(
          eq(candidateEvidenceChunks.resumeId, candidateId),
          and(
            eq(candidateEvidenceChunks.jobPostingId, jobId),
            eq(candidateEvidenceChunks.sourceType, "job"),
          ),
        )
      : eq(candidateEvidenceChunks.jobPostingId, jobId);
  const searchVector = sql`to_tsvector('english', coalesce(${candidateEvidenceChunks.title}, '') || ' ' || coalesce(${candidateEvidenceChunks.content}, ''))`;
  const searchQuery = sql`websearch_to_tsquery('english', ${question})`;
  const fullTextRows = await db
    .select()
    .from(candidateEvidenceChunks)
    .where(and(scopeWhere, sql`${searchVector} @@ ${searchQuery}`))
    .limit(limit * 4);
  const rows =
    fullTextRows.length > 0
      ? fullTextRows
      : await db.select().from(candidateEvidenceChunks).where(scopeWhere);

  return rows
    .map((chunk) => ({
      chunk,
      score: scoreEvidenceChunk(chunk, question),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

async function answerFromEvidence({
  candidateId,
  chunks,
  jobId,
  question,
  scope,
}: {
  candidateId?: string;
  chunks: Array<{ chunk: EvidenceChunkRecord; score: number }>;
  jobId: string;
  question: string;
  scope: "candidate" | "job";
}): Promise<CandidateAskResponse> {
  const citations = chunks.map(toCitation);

  if (citations.length === 0) {
    return candidateAskResponseSchema.parse({
      answer:
        "I could not find stored evidence for that question yet. Index or review the candidate first, then ask again.",
      citations: [],
      confidence: "low",
      crawlRequest: null,
      followUps: ["Ask why the candidate received their current score."],
      gaps: ["No matching candidate evidence chunks were found."],
      needsCrawl: false,
    });
  }

  const publicUrls = candidateId
    ? await getCandidatePublicUrls(candidateId)
    : [];
  const asksForPublicEvidence = shouldRecommendEvidenceCrawl(question, []);

  if (candidateId && asksForPublicEvidence && publicUrls.length === 0) {
    return candidateAskResponseSchema.parse({
      answer:
        "Stored evidence does not include crawlable public GitHub, portfolio, repository, or live demo URLs for this candidate.",
      citations: citations.slice(0, 3),
      confidence: "low",
      crawlRequest: null,
      followUps: [
        "Ask which resume projects support this role.",
        "Add public project links to the resume, then run the crawl agent.",
      ],
      gaps: [
        "No crawlable public profile or project URLs were found in stored evidence.",
      ],
      needsCrawl: false,
    });
  }

  const groqAnswer = await generateGroqEvidenceAnswer({
    citations,
    jobId,
    question,
    scope,
  });
  const response =
    groqAnswer ?? createExtractiveAskResponse({ citations, question });
  const hasReturnedCrawlEvidence = citations.some(
    (citation) => citation.sourceType === "crawl",
  );
  const needsCrawl =
    Boolean(candidateId) &&
    !hasReturnedCrawlEvidence &&
    publicUrls.length > 0 &&
    shouldRecommendEvidenceCrawl(question, response.gaps);

  return candidateAskResponseSchema.parse({
    ...response,
    citations: filterCandidateCitations(citations, response.citations),
    crawlRequest:
      needsCrawl && candidateId
        ? {
            candidateId,
            reason: "Question may need public profile or project evidence.",
            urls: publicUrls.slice(0, MAX_CRAWL_PAGES),
          }
        : null,
    needsCrawl,
  });
}

async function generateGroqEvidenceAnswer({
  citations,
  jobId,
  question,
  scope,
}: {
  citations: CandidateAskCitation[];
  jobId: string;
  question: string;
  scope: "candidate" | "job";
}) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return null;

  try {
    const [{ Output, ToolLoopAgent }, { createGroq }] = await Promise.all([
      import("ai"),
      import("@ai-sdk/groq"),
    ]);
    const modelId = process.env.GROQ_ASK_MODEL ?? "llama-3.3-70b-versatile";
    const groq = createGroq({ apiKey });
    const groqOptions = {
      strictJsonSchema: false,
      structuredOutputs: false,
    };
    const instructions = [
      "Answer HR candidate questions using only supplied citation snippets.",
      UNTRUSTED_MODEL_DATA_INSTRUCTIONS,
      "Do not expose chain-of-thought.",
      "Prefer explicit scoring, master decision, skill support/drag, and project scorecard snippets over generic sub-agent summaries when snippets conflict.",
      "Do not say a skill or project dragged the score down unless a snippet explicitly identifies it as weak, missing, unverified, or score drag.",
      "If evidence conflicts or is missing, put the uncertainty in gaps instead of inventing a conclusion.",
      "When a question asks why a score was given, include score components, weights, supporting projects/skills, drag factors, and why-not-higher/lower if those snippets are available.",
      "Return JSON only.",
    ].join(" ");
    const maxOutputTokens = 1_500;
    const agent = new ToolLoopAgent({
      id: "candidate-evidence-ask",
      instructions,
      maxRetries: 0,
      maxOutputTokens,
      model: groq(modelId),
      output: Output.json({
        description: "Evidence-grounded candidate answer",
        name: "candidate_evidence_answer",
      }),
      providerOptions: {
        groq: groqOptions,
      },
      temperature: 0,
    });
    const prompt = [
      "Answer the question using only the untrusted evidence data below.",
      formatUntrustedModelData("candidate_evidence_query", {
        scope,
        jobId,
        question,
        citations: citations.map((citation) => ({
          chunkId: citation.chunkId,
          score: Number(citation.score.toFixed(1)),
          snippet: citation.snippet,
          sourceType: citation.sourceType,
          title: citation.title,
        })),
      }),
      "Return one JSON object only.",
      "Required fields: answer, citationChunkIds, confidence, gaps, followUps, needsCrawl.",
      "citationChunkIds must contain exact chunkId values from the supplied citations.",
      "needsCrawl must be false when snippets say no crawlable public URLs are available.",
    ].join("\n\n");
    const result = await runWithProviderQuota({
      execute: () => agent.generate({ prompt, timeout: 45_000 }),
      request: {
        estimatedTokens: estimateModelTokens(
          `${instructions}\n${prompt}`,
          maxOutputTokens,
        ),
        metadata: { jobId, maxOutputTokens, scope },
        model: modelId,
        provider: "groq",
        requestKind: "ask",
      },
    });
    return createGroundedAskModelResponse({
      citations,
      output: result.output,
      question,
    });
  } catch {
    return null;
  }
}

function toCitation({
  chunk,
  score,
}: {
  chunk: EvidenceChunkRecord;
  score: number;
}): CandidateAskCitation {
  return {
    candidateId: chunk.resumeId,
    chunkId: chunk.id,
    label: chunk.title,
    score,
    snippet: shorten(redactNonEvidenceUrls(chunk.content), 700),
    sourceType: chunk.sourceType,
    title: chunk.title,
  };
}

async function getCandidateCrawlRunById(runId: string) {
  const db = await getDatabase();
  const [run] = await db
    .select()
    .from(candidateCrawlRuns)
    .where(eq(candidateCrawlRuns.id, runId))
    .limit(1);

  return run ?? null;
}

async function updateCandidateCrawlRun(
  runId: string,
  update: {
    chunksIndexed?: number;
    error?: string | null;
    status: CandidateCrawlRunStatus;
    workflowRunId?: string;
  },
) {
  const db = await getDatabase();
  const now = new Date();
  const terminal =
    update.status === "completed" ||
    update.status === "failed" ||
    update.status === "skipped";
  const setValues: Partial<typeof candidateCrawlRuns.$inferInsert> = {
    status: update.status,
    updatedAt: now,
  };

  if (update.chunksIndexed !== undefined) {
    setValues.chunksIndexed = update.chunksIndexed;
  }
  if (update.error !== undefined) {
    setValues.error = update.error;
  }
  if (terminal) {
    setValues.completedAt = now;
  }
  if (update.status === "running") {
    setValues.startedAt = now;
  }
  if (update.workflowRunId !== undefined) {
    setValues.workflowRunId = update.workflowRunId;
  }

  const [run] = await db
    .update(candidateCrawlRuns)
    .set(setValues)
    .where(eq(candidateCrawlRuns.id, runId))
    .returning();

  return run ? toCandidateCrawlRunResponse(run) : null;
}

function toCandidateCrawlRunResponse(
  run: typeof candidateCrawlRuns.$inferSelect,
) {
  return {
    candidateId: run.resumeId,
    chunksIndexed: run.chunksIndexed,
    completedAt: toIsoString(run.completedAt),
    error: run.error,
    id: run.id,
    jobId: run.jobPostingId,
    reason: run.reason ?? undefined,
    startedAt: toIsoString(run.startedAt),
    status: run.status,
    updatedAt: toIsoString(run.updatedAt),
    urls: run.urls,
    workflowRunId: run.workflowRunId ?? undefined,
  };
}

function toIsoString(value: Date | null) {
  return value ? value.toISOString() : null;
}

async function getCandidatePublicUrls(candidateId: string) {
  const db = await getDatabase();
  const rows = await db
    .select({
      content: candidateEvidenceChunks.content,
    })
    .from(candidateEvidenceChunks)
    .where(eq(candidateEvidenceChunks.resumeId, candidateId));
  const urls = new Set<string>();

  for (const row of rows) {
    for (const url of extractPublicUrls(row.content)) {
      urls.add(url);
    }
  }

  return Array.from(urls).slice(0, MAX_CRAWL_PAGES);
}

async function crawlPublicUrl(url: string) {
  if (!isCrawlablePublicUrl(url)) {
    return {
      content: `Skipped ${url}: URL is not an allowed public HTTP(S) target.`,
      status: "skipped",
      title: `Skipped crawl: ${url}`,
    };
  }

  const githubUrl = parseGithubPublicUrl(url);
  const platformCrawl = await crawlPlatformUrl(url);
  if (platformCrawl) return platformCrawl;

  if (githubUrl) {
    const crawled = await crawlGithubPublicUrl(githubUrl);
    if (crawled) return crawled;
  }

  try {
    const response = await fetchPublicHttpUrl(url, {
      headers: {
        "user-agent": "ResumeReview candidate evidence crawler",
      },
      maxBytes: 500_000,
      timeoutMs: CRAWL_TIMEOUT_MS,
    });
    const contentType = response.headers.get("content-type") ?? "";
    const body = await response.text();

    if (!response.ok) {
      return {
        content: `Crawl failed for ${url}: HTTP ${response.status}.`,
        status: "failed",
        title: `Crawl failed: ${url}`,
      };
    }

    if (!/text|html|json|xml/i.test(contentType)) {
      return {
        content: `Skipped ${url}: unsupported content type ${contentType}.`,
        status: "skipped",
        title: `Skipped crawl: ${url}`,
      };
    }

    return {
      content: shorten(extractReadableText(body), 5000),
      status: "completed",
      title: `Crawled public page: ${url}`,
    };
  } catch (error) {
    return {
      content: `Crawl failed for ${url}: ${
        error instanceof Error ? error.message : "unknown error"
      }.`,
      status: "failed",
      title: `Crawl failed: ${url}`,
    };
  }
}

async function crawlGithubPublicUrl(
  target: NonNullable<ReturnType<typeof parseGithubPublicUrl>>,
) {
  const apiBase = "https://api.github.com";
  const headers = {
    accept: "application/vnd.github+json",
    "user-agent": "ResumeReview candidate evidence crawler",
    "x-github-api-version": "2022-11-28",
  };

  try {
    if (target.kind === "repo" && target.repo) {
      const repo = await fetchJson<GithubRepoResponse>(
        `${apiBase}/repos/${encodeURIComponent(target.owner)}/${encodeURIComponent(
          target.repo,
        )}`,
        headers,
      );
      const readme = await fetchJson<GithubReadmeResponse>(
        `${apiBase}/repos/${encodeURIComponent(target.owner)}/${encodeURIComponent(
          target.repo,
        )}/readme`,
        headers,
      ).catch(() => null);

      return {
        content: shorten(formatGithubRepoEvidence(repo, readme), 5000),
        status: "completed",
        title: `GitHub repository evidence: ${target.owner}/${target.repo}`,
      };
    }

    const [profile, repos] = await Promise.all([
      fetchJson<GithubProfileResponse>(
        `${apiBase}/users/${encodeURIComponent(target.owner)}`,
        headers,
      ),
      fetchJson<GithubRepoResponse[]>(
        `${apiBase}/users/${encodeURIComponent(
          target.owner,
        )}/repos?per_page=8&sort=updated&type=owner`,
        headers,
      ).catch(() => []),
    ]);

    return {
      content: shorten(formatGithubProfileEvidence(profile, repos), 5000),
      status: "completed",
      title: `GitHub profile evidence: ${target.owner}`,
    };
  } catch (error) {
    return {
      content: `GitHub API crawl failed for ${target.owner}${
        target.repo ? `/${target.repo}` : ""
      }: ${error instanceof Error ? error.message : "unknown error"}.`,
      status: "failed",
      title: `GitHub crawl failed: ${target.owner}${
        target.repo ? `/${target.repo}` : ""
      }`,
    };
  }
}

async function fetchJson<T>(
  url: string,
  headers: Record<string, string>,
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CRAWL_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers,
      signal: controller.signal,
    });
    const text = await response.text();

    if (!response.ok) {
      const rateLimitRemaining = response.headers.get("x-ratelimit-remaining");
      const rateLimitReset = response.headers.get("x-ratelimit-reset");
      const rateLimitSuffix =
        response.status === 403 && rateLimitRemaining === "0"
          ? ` GitHub rate limit resets at ${formatUnixTime(rateLimitReset)}.`
          : "";

      throw new Error(
        `HTTP ${response.status}${rateLimitSuffix} ${shorten(text, 240)}`,
      );
    }

    return JSON.parse(text) as T;
  } finally {
    clearTimeout(timeout);
  }
}

interface GithubProfileResponse {
  bio?: string | null;
  blog?: string | null;
  company?: string | null;
  html_url?: string | null;
  login: string;
  name?: string | null;
  public_repos?: number;
}

interface GithubRepoResponse {
  archived?: boolean;
  created_at?: string | null;
  description?: string | null;
  fork?: boolean;
  forks_count?: number;
  full_name: string;
  html_url?: string | null;
  language?: string | null;
  pushed_at?: string | null;
  stargazers_count?: number;
  topics?: string[];
  updated_at?: string | null;
}

interface GithubReadmeResponse {
  content?: string;
  encoding?: string;
  html_url?: string | null;
  name?: string;
}

function formatGithubProfileEvidence(
  profile: GithubProfileResponse,
  repos: GithubRepoResponse[],
) {
  const repoLines = repos
    .filter((repo) => !repo.fork)
    .slice(0, 8)
    .map((repo) =>
      [
        `- ${repo.full_name}`,
        repo.description ? `description: ${repo.description}` : null,
        repo.language ? `language: ${repo.language}` : null,
        repo.topics?.length ? `topics: ${repo.topics.join(", ")}` : null,
        `stars: ${repo.stargazers_count ?? 0}`,
        `forks: ${repo.forks_count ?? 0}`,
        (repo.pushed_at ?? repo.updated_at)
          ? `recent activity: ${repo.pushed_at ?? repo.updated_at}`
          : null,
        repo.html_url ? `url: ${repo.html_url}` : null,
      ]
        .filter(Boolean)
        .join("; "),
    );

  return [
    `GitHub profile: ${profile.login}`,
    profile.name ? `Name: ${profile.name}` : null,
    profile.bio ? `Bio: ${profile.bio}` : null,
    profile.company ? `Company: ${profile.company}` : null,
    profile.blog ? `Blog: ${profile.blog}` : null,
    profile.html_url ? `Profile URL: ${profile.html_url}` : null,
    `Public repositories: ${profile.public_repos ?? "unknown"}`,
    repoLines.length ? "Recent owner repositories:" : null,
    ...repoLines,
  ]
    .filter(Boolean)
    .join("\n");
}

function formatGithubRepoEvidence(
  repo: GithubRepoResponse,
  readme: GithubReadmeResponse | null,
) {
  return [
    `GitHub repository: ${repo.full_name}`,
    repo.description ? `Description: ${repo.description}` : null,
    repo.language ? `Primary language: ${repo.language}` : null,
    repo.topics?.length ? `Topics: ${repo.topics.join(", ")}` : null,
    `Stars: ${repo.stargazers_count ?? 0}`,
    `Forks: ${repo.forks_count ?? 0}`,
    repo.archived ? "Archived: yes" : "Archived: no",
    repo.html_url ? `Repository URL: ${repo.html_url}` : null,
    (repo.pushed_at ?? repo.updated_at)
      ? `Recent activity: ${repo.pushed_at ?? repo.updated_at}`
      : null,
    readme
      ? `README (${readme.name ?? "README"}): ${decodeGithubReadme(readme)}`
      : null,
  ]
    .filter(Boolean)
    .join("\n");
}

function decodeGithubReadme(readme: GithubReadmeResponse) {
  if (readme.encoding !== "base64" || !readme.content) {
    return readme.html_url ?? "README metadata available, content unavailable.";
  }

  return shorten(
    Buffer.from(readme.content.replace(/\s/g, ""), "base64").toString("utf8"),
    1800,
  );
}

function formatUnixTime(value: string | null) {
  if (!value) return "an unknown time";
  const timestamp = Number(value);
  if (!Number.isFinite(timestamp)) return "an unknown time";
  return new Date(timestamp * 1000).toISOString();
}

function parsePhaseItems(phases: unknown): ParsedPhaseItem[] {
  if (!phases || typeof phases !== "object") return [];
  const items: unknown[] = Array.isArray(phases)
    ? phases
    : Array.isArray((phases as Record<string, unknown>).items)
      ? ((phases as Record<string, unknown>).items as unknown[])
      : [];

  return items
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      return {
        action: asString(record.action),
        evidence: Array.isArray(record.evidence)
          ? record.evidence
              .map(parseEvidenceItem)
              .filter(
                (evidence): evidence is ParsedEvidenceItem => evidence !== null,
              )
          : [],
        id: asString(record.id) || "phase",
        subAgents: Array.isArray(record.subAgents)
          ? record.subAgents
              .map(parseSubAgent)
              .filter(
                (subAgent): subAgent is ParsedSubAgent => subAgent !== null,
              )
          : [],
        summary: asString(record.summary),
        title: asString(record.title) || asString(record.id) || "Phase",
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
}

function parseEvidenceItem(value: unknown): ParsedEvidenceItem | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  return {
    label: asString(record.label) || "Evidence",
    snippet: asString(record.snippet),
  };
}

function parseSubAgent(value: unknown): ParsedSubAgent | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  return {
    findings: Array.isArray(record.findings)
      ? record.findings
          .map(asString)
          .filter((finding): finding is string => finding.length > 0)
      : [],
    id: asString(record.id) || "agent",
    name: asString(record.name) || asString(record.id) || "Agent",
    summary: asString(record.summary),
  };
}

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

async function getDatabase() {
  const { db } = await import("@/lib/db/db");
  return db;
}
