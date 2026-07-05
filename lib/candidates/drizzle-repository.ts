import { desc, eq, inArray, sql } from "drizzle-orm";

import { agentRuns, jobPostings, resumeResults, resumes } from "@/lib/db/app";
import { normalizeJobWeights } from "@/lib/jobs/criteria";
import {
  assessmentResultBelongsToRun,
  resolveAssessmentHistoryStatus,
} from "./assessment-history";
import {
  buildCandidateDetail,
  buildJobContextFallback,
  buildPipelineTrace,
} from "./builders";
import { rankCandidates } from "./ranking";
import type { CandidateRepository } from "./repository";
import {
  assessmentHistoryResponseSchema,
  type CandidateDetail,
  type CandidateRow,
  type CandidatesListResponse,
  candidateDetailSchema,
  candidatesListResponseSchema,
  type Flag,
  type JobContext,
  type PipelinePhase,
  pipelinePhaseSchema,
  pipelineTraceSchema,
} from "./types";
import {
  getAverageScore,
  getCandidateStatusCounts,
  getFlagsForCandidate,
} from "./view-model";

type AgentRunRecord = typeof agentRuns.$inferSelect;
type JobPostingRecord = typeof jobPostings.$inferSelect;
type ResumeRecord = typeof resumes.$inferSelect;
type ResumeResultRecord = typeof resumeResults.$inferSelect;

interface CandidateRecord {
  job: JobPostingRecord;
  resume: ResumeRecord;
  result: ResumeResultRecord | null;
  run: AgentRunRecord | null;
}

export function createDrizzleCandidateRepository(): CandidateRepository {
  return {
    async listCandidates(jobId) {
      const job = await getJob(jobId);
      if (!job) return null;

      const records = await listCandidateRecords(jobId);
      const candidates = rankCandidates(
        records.map((record) => toCandidateRow(record, 0)),
      );

      return candidatesListResponseSchema.parse({
        job: toJobContext(job),
        candidates,
        stats: {
          total: candidates.length,
          averageScore: getAverageScore(candidates),
          statusCounts: getCandidateStatusCounts(candidates),
        },
      } satisfies CandidatesListResponse);
    },

    async getCandidate(candidateId) {
      const record = await getCandidateRecord(candidateId);
      if (!record) return null;

      const candidate = toCandidateRow(
        record,
        await getCandidateRank(record.resume.jobPostingId, candidateId),
      );

      return candidateDetailSchema.parse(
        buildCandidateDetail(candidate, {
          flags: getDbFlags(record.result?.redFlags, candidate),
          jobTitle: record.job.title,
          links: extractLinks(record),
          location:
            asString(asRecord(record.result?.applicantInfo)?.location) ??
            record.job.location ??
            undefined,
          phone: asString(asRecord(record.result?.applicantInfo)?.phone),
          scoreBreakdown: getDbScoreBreakdown(record),
          summary: record.result?.summary ?? undefined,
          uploadedAt: toIsoString(record.resume.createdAt),
        }),
      );
    },

    async getAssessmentHistory(candidateId) {
      return getCandidateAssessmentHistory(candidateId);
    },

    async getPipelineTrace(candidateId, runId) {
      const selectedRunId =
        runId ?? (await getLatestCandidateRunId(candidateId));
      let record = selectedRunId
        ? await getCandidateRunRecord(candidateId, selectedRunId)
        : await getCandidateRecord(candidateId);
      if (!record && !runId) {
        const current = await getCandidateRecord(candidateId);
        record = current ? { ...current, run: null } : null;
      }
      if (!record) return null;

      const candidate = toCandidateRow(
        record,
        await getCandidateRank(record.resume.jobPostingId, candidateId),
      );
      const storedPhases = parseStoredPhases(record.run?.phases);

      return pipelineTraceSchema.parse(
        buildPipelineTrace(candidate, {
          elapsedMs: getElapsedMs(record.run),
          phases: storedPhases,
          traceId: record.run?.id,
        }),
      );
    },
  };
}

async function getCandidateAssessmentHistory(candidateId: string) {
  const db = await getDatabase();
  const [resume] = await db
    .select({ id: resumes.id })
    .from(resumes)
    .where(eq(resumes.id, candidateId))
    .limit(1);
  if (!resume) return null;

  const results = await db
    .select()
    .from(resumeResults)
    .where(eq(resumeResults.resumeId, candidateId))
    .orderBy(desc(resumeResults.createdAt), desc(resumeResults.id));
  const currentResult = results[0];
  const runs = await db
    .select()
    .from(agentRuns)
    .where(eq(agentRuns.resumeId, candidateId))
    .orderBy(
      desc(agentRuns.startedAt),
      desc(agentRuns.queuedAt),
      desc(agentRuns.attempt),
      desc(agentRuns.id),
    );
  const resultByRunId = new Map<string, ResumeResultRecord>();
  const attachedResultIds = new Set<string>();
  const collidedRunIds = new Set<string>();
  for (const result of results) {
    if (!result.agentRunId) continue;
    const run = runs.find((item) => item.id === result.agentRunId);
    if (!run) continue;
    if (!assessmentResultBelongsToRun(result, run)) {
      collidedRunIds.add(run.id);
      continue;
    }
    resultByRunId.set(run.id, result);
    attachedResultIds.add(result.id);
  }
  const runItems = runs.map((run) => {
    const result = resultByRunId.get(run.id);
    return {
      assessmentId: result?.id ?? null,
      attempt: run.attempt,
      completedAt: toNullableIsoString(run.completedAt),
      decision: toAssessmentDecision(result?.finalScore),
      error: run.error,
      failureCategory: run.failureCategory,
      isCurrent: result?.id === currentResult?.id,
      origin: "run" as const,
      pipelineAvailable: !collidedRunIds.has(run.id),
      runId: run.id,
      score: result?.finalScore ?? null,
      sortAt: toDate(run.startedAt ?? run.queuedAt)?.getTime() ?? 0,
      startedAt: toNullableIsoString(run.startedAt ?? run.queuedAt),
      status: resolveAssessmentHistoryStatus(run),
      version: toAssessmentVersionSummary(result?.modelVersions),
    };
  });
  const legacyItems = results
    .filter((result) => !attachedResultIds.has(result.id))
    .map((result) => ({
      assessmentId: result.id,
      attempt: 1,
      completedAt: toNullableIsoString(result.createdAt),
      decision: toAssessmentDecision(result.finalScore),
      error: null,
      failureCategory: null,
      isCurrent: result.id === currentResult?.id,
      origin: "legacy_result" as const,
      pipelineAvailable: false,
      runId: `legacy-result:${result.id}`,
      score: result.finalScore ?? null,
      sortAt: toDate(result.createdAt)?.getTime() ?? 0,
      startedAt: null,
      status: "completed" as const,
      version: toAssessmentVersionSummary(result.modelVersions),
    }));
  const attempts = [...runItems, ...legacyItems]
    .sort((left, right) => right.sortAt - left.sortAt)
    .map(({ sortAt: _sortAt, ...item }) => item);

  return assessmentHistoryResponseSchema.parse({
    assessments: attempts,
    candidateId,
  });
}

async function getDatabase() {
  const { db } = await import("@/lib/db/db");
  return db;
}

async function getJob(jobId: string) {
  const db = await getDatabase();
  const [job] = await db
    .select()
    .from(jobPostings)
    .where(eq(jobPostings.id, jobId))
    .limit(1);

  return job ?? null;
}

async function listCandidateRecords(jobId: string): Promise<CandidateRecord[]> {
  const db = await getDatabase();
  const rows = await db
    .select({
      job: jobPostings,
      result: resumeResults,
      resume: resumes,
    })
    .from(resumes)
    .innerJoin(jobPostings, eq(jobPostings.id, resumes.jobPostingId))
    .leftJoin(resumeResults, eq(resumeResults.resumeId, resumes.id))
    .where(eq(resumes.jobPostingId, jobId))
    .orderBy(
      desc(resumeResults.createdAt),
      desc(resumeResults.id),
      desc(resumeResults.finalScore),
      desc(resumes.createdAt),
    );

  const runsByResumeId = await getLatestRunsByResumeId(
    rows.map((row) => row.resume.id),
  );

  return dedupeByResume(rows).map((row) => ({
    ...row,
    run: runsByResumeId.get(row.resume.id) ?? null,
  }));
}

async function getCandidateRecord(
  candidateId: string,
): Promise<CandidateRecord | null> {
  const db = await getDatabase();
  const [row] = await db
    .select({
      job: jobPostings,
      result: resumeResults,
      resume: resumes,
    })
    .from(resumes)
    .innerJoin(jobPostings, eq(jobPostings.id, resumes.jobPostingId))
    .leftJoin(resumeResults, eq(resumeResults.resumeId, resumes.id))
    .where(eq(resumes.id, candidateId))
    .orderBy(desc(resumeResults.createdAt), desc(resumeResults.id))
    .limit(1);

  if (!row) return null;

  const runsByResumeId = await getLatestRunsByResumeId([row.resume.id]);

  return {
    ...row,
    run: runsByResumeId.get(row.resume.id) ?? null,
  };
}

async function getCandidateRunRecord(
  candidateId: string,
  runId: string,
): Promise<CandidateRecord | null> {
  const db = await getDatabase();
  const [row] = await db
    .select({
      job: jobPostings,
      result: resumeResults,
      resume: resumes,
      run: agentRuns,
    })
    .from(agentRuns)
    .innerJoin(resumes, eq(resumes.id, agentRuns.resumeId))
    .innerJoin(jobPostings, eq(jobPostings.id, resumes.jobPostingId))
    .leftJoin(resumeResults, eq(resumeResults.agentRunId, agentRuns.id))
    .where(sql`${agentRuns.id} = ${runId} and ${resumes.id} = ${candidateId}`)
    .limit(1);

  if (!row) return null;
  if (row.result && !assessmentResultBelongsToRun(row.result, row.run)) {
    return null;
  }
  return row;
}

async function getLatestCandidateRunId(candidateId: string) {
  const db = await getDatabase();
  const [run] = await db
    .select({ id: agentRuns.id })
    .from(agentRuns)
    .where(eq(agentRuns.resumeId, candidateId))
    .orderBy(
      desc(agentRuns.startedAt),
      desc(agentRuns.queuedAt),
      desc(agentRuns.attempt),
      desc(agentRuns.id),
    )
    .limit(1);
  return run?.id ?? null;
}

async function getCandidateRank(jobId: string, candidateId: string) {
  const db = await getDatabase();
  const result = await db.execute(sql`
    with ranked_candidates as (
      select
        ${resumes.id} as candidate_id,
        row_number() over (
          order by coalesce((
            select ${resumeResults.finalScore}
            from ${resumeResults}
            where ${resumeResults.resumeId} = ${resumes.id}
            order by ${resumeResults.createdAt} desc, ${resumeResults.id} desc
            limit 1
          ), 0) desc,
          ${resumes.id} asc
        )::integer as candidate_rank
      from ${resumes}
      where ${resumes.jobPostingId} = ${jobId}
    )
    select candidate_rank
    from ranked_candidates
    where candidate_id = ${candidateId}
    limit 1
  `);
  const rows = (result as { rows?: unknown[] }).rows;
  const rank = Number(
    (rows?.[0] as { candidate_rank?: unknown } | undefined)?.candidate_rank,
  );

  return Number.isInteger(rank) && rank > 0 ? rank : 1;
}

function dedupeByResume<
  TRow extends {
    resume: ResumeRecord;
  },
>(rows: TRow[]) {
  const seen = new Set<string>();
  const deduped: TRow[] = [];

  for (const row of rows) {
    if (seen.has(row.resume.id)) continue;
    seen.add(row.resume.id);
    deduped.push(row);
  }

  return deduped;
}

async function getLatestRunsByResumeId(resumeIds: string[]) {
  const db = await getDatabase();
  const uniqueResumeIds = Array.from(new Set(resumeIds));

  if (uniqueResumeIds.length === 0) return new Map<string, AgentRunRecord>();

  const runs = await db
    .select()
    .from(agentRuns)
    .where(inArray(agentRuns.resumeId, uniqueResumeIds))
    .orderBy(desc(agentRuns.startedAt));

  const latestRuns = new Map<string, AgentRunRecord>();
  for (const run of runs) {
    if (!latestRuns.has(run.resumeId)) {
      latestRuns.set(run.resumeId, run);
    }
  }

  return latestRuns;
}

function toJobContext(job: JobPostingRecord): JobContext {
  return buildJobContextFallback({
    criteria: job.criteria,
    description: job.description,
    id: job.id,
    appName: "ResumeReview",
    employmentType: job.employmentType ?? undefined,
    location: job.location ?? undefined,
    status: toJobStatus(job.status),
    title: job.title,
    weights: job.weights,
  });
}

function toCandidateRow(record: CandidateRecord, fallbackRank: number) {
  const applicantInfo = asRecord(record.result?.applicantInfo);
  const candidate: CandidateRow = {
    id: record.resume.id,
    resumeId: record.resume.id,
    jobId: record.resume.jobPostingId,
    name:
      record.resume.applicantName ??
      asString(applicantInfo?.name) ??
      fileNameToTitle(record.resume.fileName),
    email: record.resume.applicantEmail ?? asString(applicantInfo?.email) ?? "",
    fileName: record.resume.fileName,
    score: record.result?.finalScore ?? 0,
    rank: fallbackRank,
    status: toCandidateStatus(record),
    topSkills: extractTopSkills(record.result?.skills),
    experience: extractExperience(record.result?.experience),
    education: extractEducation(record.result?.education),
    trust: extractTrust(record.result),
    flagCount: getDbFlagCount(record.result?.redFlags),
    avatar: `https://i.pravatar.cc/150?u=${encodeURIComponent(record.resume.id)}`,
  };

  return candidate;
}

function toCandidateStatus(record: CandidateRecord): CandidateRow["status"] {
  const runStatus = record.run
    ? resolveAssessmentHistoryStatus(record.run)
    : undefined;
  const resumeStatus = record.resume.status.toLowerCase();

  if (runStatus === "failed" || runStatus === "interrupted") return "failed";
  if (runStatus === "running" || runStatus === "queued") {
    return "processing";
  }
  if (
    record.result?.finalScore !== null &&
    record.result?.finalScore !== undefined
  ) {
    return "completed";
  }
  if (resumeStatus === "failed" || resumeStatus === "error") return "failed";
  if (resumeStatus === "uploaded" || resumeStatus === "pending")
    return "pending";

  return "processing";
}

function toJobStatus(status: string): JobContext["status"] {
  if (
    status === "draft" ||
    status === "active" ||
    status === "closed" ||
    status === "archived"
  ) {
    return status;
  }

  return "active";
}

function parseStoredPhases(phases: unknown): PipelinePhase[] | undefined {
  const arrayResult = pipelinePhaseSchema.array().safeParse(phases);
  if (arrayResult.success) return arrayResult.data;

  if (!phases || typeof phases !== "object" || Array.isArray(phases)) {
    return undefined;
  }

  const record = phases as Record<string, unknown>;
  const itemsResult = pipelinePhaseSchema.array().safeParse(record.items);
  if (itemsResult.success) return itemsResult.data;

  const objectResult = pipelinePhaseSchema
    .array()
    .safeParse(Object.values(record));

  return objectResult.success ? objectResult.data : undefined;
}

function getElapsedMs(run: AgentRunRecord | null) {
  if (!run?.startedAt) return undefined;

  const start = toDate(run.startedAt);
  const end = toDate(run.completedAt) ?? new Date();
  if (!start) return undefined;

  return Math.max(0, end.getTime() - start.getTime());
}

function extractTopSkills(skills: unknown) {
  const record = asRecord(skills);
  const matched = flattenSkillValues(record?.matched);
  const inventory = flattenSkillValues(record?.all);
  const fallback = flattenSkillValues(skills);
  const preferred =
    matched.length > 0
      ? [...matched, ...inventory]
      : inventory.length > 0
        ? inventory
        : fallback;

  return uniqueStrings(preferred.flatMap(splitSkillLabel)).slice(0, 12);
}

function flattenSkillValues(value: unknown): string[] {
  if (!value) return [];
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(flattenSkillValues);

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const named = asString(record.name) ?? asString(record.skill);
    if (named) return [named];
    return Object.values(record).flatMap(flattenSkillValues);
  }

  return [];
}

function extractExperience(experience: unknown) {
  if (typeof experience === "string" && experience.trim()) return experience;

  if (Array.isArray(experience)) {
    return experience.length === 1
      ? "1 role"
      : `${experience.length || 0} roles`;
  }

  const record = asRecord(experience);
  const years =
    asNumber(record?.totalYears) ??
    asNumber(record?.years) ??
    asNumber(record?.yearsOfExperience) ??
    asNumber(record?.yearsEstimate);

  const level = asString(record?.level);
  if (years !== undefined) {
    const yearsLabel = years < 1 ? "<1 yr" : `${years} yrs`;
    return level ? `${titleCase(level)} (${yearsLabel})` : yearsLabel;
  }

  return asString(record?.summary) ?? "Unknown";
}

function extractEducation(education: unknown) {
  if (typeof education === "string" && education.trim()) return education;
  if (Array.isArray(education)) {
    const schools = education
      .map((entry) =>
        typeof entry === "string" ? entry : extractSchoolName(asRecord(entry)),
      )
      .filter(Boolean);

    return schools.slice(0, 2).join(", ") || "Unknown";
  }

  const record = asRecord(education);
  const entries = Array.isArray(record?.entries)
    ? record.entries.filter(isRecord)
    : [];
  const entrySummary = formatEducationSummary(entries[0]);
  if (entrySummary) return entrySummary;

  const evidence = firstString(record?.evidence);
  if (evidence) return evidence;

  const highlight = firstString(record?.highlights);
  if (highlight) return highlight;

  return extractSchoolName(record) ?? "Unknown";
}

function formatEducationSummary(record: Record<string, unknown> | undefined) {
  if (!record) return undefined;

  const degree = asString(record.degree);
  const field = asString(record.field);
  const institution = extractSchoolName(record);
  const gpa = asString(record.gpa);
  const degreeWithField =
    degree && field && !degree.toLowerCase().includes(field.toLowerCase())
      ? `${degree} in ${field}`
      : degree || field;
  const label = [degreeWithField, institution].filter(Boolean).join(" - ");

  return (
    [label || undefined, formatGpa(gpa)].filter(Boolean).join(" | ") ||
    undefined
  );
}

function formatGpa(value: string | undefined) {
  if (!value) return undefined;
  return /\b(?:cgpa|gpa)\b/i.test(value) ? value : `CGPA: ${value}`;
}

function extractSchoolName(record: Record<string, unknown> | undefined) {
  return (
    asString(record?.school) ??
    asString(record?.institution) ??
    asString(record?.university) ??
    asString(record?.name)
  );
}

function extractTrust(result: ResumeResultRecord | null) {
  const sources = [
    asRecord(result?.redFlags),
    asRecord(result?.skillVerification),
    asRecord(result?.projectMatches),
  ];

  for (const source of sources) {
    const trust =
      asNumber(source?.trust) ??
      asNumber(source?.trustScore) ??
      asNumber(source?.trust_score);
    if (trust !== undefined) return clampScore(trust);
  }

  return clampScore(100 - getDbFlagCount(result?.redFlags) * 8);
}

function getDbScoreBreakdown(record: CandidateRecord) {
  const weights = normalizeJobWeights(record.job.weights);
  const result = record.result;
  const rows = [
    {
      label: "Skills",
      rawScore: extractScore(result?.skills),
      weight: weights.skills,
    },
    {
      label: "Experience",
      rawScore: extractScore(result?.experience),
      weight: weights.experience,
    },
    {
      label: "Projects",
      rawScore: extractScore(result?.projects),
      weight: weights.projects,
    },
    {
      label: "Education",
      rawScore: extractScore(result?.education),
      weight: weights.education,
    },
    {
      label: "Trust",
      rawScore: extractTrust(result),
      weight: weights.trust,
    },
  ];

  return rows.map((row) => ({
    label: row.label,
    max: row.weight,
    score: Math.round((row.rawScore * row.weight) / 100),
  }));
}

function extractScore(value: unknown) {
  const record = asRecord(value);
  return asNumber(record?.score) ?? 0;
}

function getDbFlags(redFlags: unknown, candidate: CandidateRow): Flag[] {
  const flags = extractFlagRecords(redFlags);
  if (flags.length === 0) return getFlagsForCandidate(candidate);

  return flags.map((flag) => ({
    type: toFlagType(asString(flag.severity) ?? asString(flag.type)),
    label:
      asString(flag.label) ??
      asString(flag.title) ??
      asString(flag.message) ??
      "Review flag",
    detail:
      asString(flag.detail) ??
      asString(flag.description) ??
      asString(flag.evidence),
  }));
}

function getDbFlagCount(redFlags: unknown) {
  return extractFlagRecords(redFlags).length;
}

function extractFlagRecords(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) {
    return value.filter(isRecord);
  }

  const record = asRecord(value);
  const flags = record?.flags ?? record?.items ?? record?.redFlags;
  if (Array.isArray(flags)) return flags.filter(isRecord);

  return [];
}

function toFlagType(value: string | undefined): Flag["type"] {
  if (value === "green" || value === "positive") return "green";
  if (value === "amber" || value === "warning" || value === "medium") {
    return "amber";
  }
  return "red";
}

function extractLinks(record: CandidateRecord): CandidateDetail["links"] {
  const applicantInfo = asRecord(record.result?.applicantInfo);
  const githubData = asRecord(record.result?.githubData);
  const platformData = asRecord(record.result?.platformData);

  return {
    github:
      asString(applicantInfo?.github) ??
      asString(githubData?.url) ??
      asString(githubData?.profileUrl),
    leetcode:
      asString(applicantInfo?.leetcode) ??
      asString(platformData?.leetcode) ??
      asString(platformData?.leetcodeUrl),
    linkedin:
      asString(applicantInfo?.linkedin) ??
      asString(platformData?.linkedin) ??
      asString(platformData?.linkedinUrl),
    portfolio:
      asString(applicantInfo?.portfolio) ??
      asString(platformData?.portfolio) ??
      asString(platformData?.portfolioUrl),
  };
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function asNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function firstString(value: unknown) {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (!Array.isArray(value)) return undefined;

  return value.find(
    (item): item is string =>
      typeof item === "string" && item.trim().length > 0,
  );
}

function splitSkillLabel(value: string) {
  const withoutCategory = value.includes(":")
    ? value.slice(value.indexOf(":") + 1)
    : value;

  return withoutCategory
    .split(/[,;/|]/)
    .map(normalizeSkillLabel)
    .filter(Boolean);
}

function normalizeSkillLabel(value: string) {
  const cleaned = value
    .replace(/\([^)]*\)/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const aliases: Record<string, string> = {
    javascript: "JavaScript",
    "next.js": "Next.js",
    nextjs: "Next.js",
    node: "Node.js",
    "node.js": "Node.js",
    postgres: "PostgreSQL",
    postgresql: "PostgreSQL",
    react: "React",
    sql: "SQL",
    typescript: "TypeScript",
  };

  return aliases[cleaned.toLowerCase()] ?? cleaned;
}

function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function clampScore(score: number) {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function uniqueStrings(values: string[]) {
  return Array.from(
    new Set(values.map((value) => value.trim()).filter(Boolean)),
  );
}

function fileNameToTitle(fileName: string) {
  return fileName
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function toDate(value: Date | string | null | undefined) {
  if (!value) return undefined;
  if (value instanceof Date) return value;

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function toIsoString(value: Date | string | null | undefined) {
  return toDate(value)?.toISOString() ?? new Date().toISOString();
}

function toNullableIsoString(value: Date | string | null | undefined) {
  return toDate(value)?.toISOString() ?? null;
}

function toAssessmentDecision(score: number | null | undefined) {
  if (score == null) return null;
  if (score >= 85) return "strong_yes" as const;
  if (score >= 70) return "yes" as const;
  if (score >= 50) return "maybe" as const;
  return "no" as const;
}

function toAssessmentVersionSummary(value: unknown) {
  const manifest = asRecord(value);
  if (!manifest) return null;

  return {
    agent: asString(manifest.agentVersion) ?? "legacy",
    assessmentSchema: asString(manifest.assessmentSchemaVersion) ?? "legacy",
    model: asString(manifest.model) ?? "unknown",
    provider: asString(manifest.provider) ?? "unknown",
    scoring: asString(manifest.scoringVersion) ?? "legacy",
  };
}
