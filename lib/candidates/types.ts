import { z } from "zod";
import { jobCriteriaSchema, jobWeightsSchema } from "@/lib/jobs/criteria";

export const candidateStatusSchema = z.enum([
  "completed",
  "processing",
  "pending",
  "failed",
]);

export const phaseStateSchema = z.enum([
  "pending",
  "running",
  "completed",
  "error",
]);

export const candidateFlagSchema = z.object({
  type: z.enum(["red", "green", "amber"]),
  label: z.string(),
  detail: z.string().optional(),
});

export const candidateRowSchema = z.object({
  id: z.string(),
  resumeId: z.string(),
  jobId: z.string(),
  name: z.string(),
  email: z.string(),
  fileName: z.string(),
  score: z.number(),
  rank: z.number(),
  status: candidateStatusSchema,
  topSkills: z.array(z.string()),
  experience: z.string(),
  education: z.string(),
  trust: z.number(),
  flagCount: z.number(),
  avatar: z.string(),
});

export const jobContextSchema = z.object({
  id: z.string(),
  appName: z.string(),
  title: z.string(),
  description: z.string(),
  weights: jobWeightsSchema,
  criteria: jobCriteriaSchema,
  status: z.enum(["draft", "active", "closed", "archived"]),
  location: z.string().optional(),
  employmentType: z.string().optional(),
});

export const scoreBreakdownSchema = z.object({
  label: z.string(),
  score: z.number(),
  max: z.number(),
});

export const candidateDetailSchema = candidateRowSchema.extend({
  summary: z.string(),
  phone: z.string().optional(),
  location: z.string().optional(),
  links: z
    .object({
      github: z.string().optional(),
      linkedin: z.string().optional(),
      leetcode: z.string().optional(),
      portfolio: z.string().optional(),
    })
    .optional(),
  scoreBreakdown: z.array(scoreBreakdownSchema),
  flags: z.array(candidateFlagSchema),
  uploadedAt: z.string(),
});

export const pipelineArtifactSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(["pdf", "xlsx", "docx", "txt", "json", "url", "other"]),
  url: z.string().optional(),
});

export const pipelineEvidenceSchema = z.object({
  id: z.string(),
  label: z.string(),
  snippet: z.string(),
  source: z.string().optional(),
});

export const pipelineSubAgentSchema = z.object({
  id: z.string(),
  name: z.string(),
  provider: z.string(),
  model: z.string().optional(),
  status: phaseStateSchema,
  summary: z.string(),
  findings: z.array(z.string()),
  durationMs: z.number().optional(),
  tokensIn: z.number().optional(),
  tokensOut: z.number().optional(),
});

export const pipelinePhaseSchema = z.object({
  id: z.string(),
  title: z.string(),
  category: z.string(),
  action: z.string(),
  status: phaseStateSchema,
  summary: z.string(),
  evidence: z.array(pipelineEvidenceSchema),
  artifacts: z.array(pipelineArtifactSchema),
  subAgents: z.array(pipelineSubAgentSchema),
  startedAt: z.string().optional(),
  completedAt: z.string().optional(),
  durationMs: z.number().optional(),
});

export const pipelineTraceSchema = z.object({
  id: z.string(),
  candidateId: z.string(),
  resumeId: z.string(),
  jobId: z.string(),
  status: phaseStateSchema,
  elapsedMs: z.number(),
  phases: z.array(pipelinePhaseSchema),
  finalOutput: z.object({
    score: z.number(),
    rank: z.number(),
    recommendation: z.enum(["strong_yes", "yes", "maybe", "no"]),
    summary: z.string(),
  }),
});

export const candidateStatsSchema = z.object({
  total: z.number(),
  averageScore: z.number(),
  statusCounts: z.record(candidateStatusSchema, z.number()),
});

export const candidatesListResponseSchema = z.object({
  job: jobContextSchema,
  candidates: z.array(candidateRowSchema),
  stats: candidateStatsSchema,
});

export const candidateDetailResponseSchema = z.object({
  candidate: candidateDetailSchema,
});

export const pipelineTraceResponseSchema = z.object({
  trace: pipelineTraceSchema,
});

export const assessmentHistoryStatusSchema = z.enum([
  "queued",
  "running",
  "completed",
  "failed",
  "skipped",
  "interrupted",
]);

export const assessmentVersionSummarySchema = z.object({
  agent: z.string(),
  assessmentSchema: z.string(),
  model: z.string(),
  provider: z.string(),
  scoring: z.string(),
});

export const assessmentHistoryItemSchema = z.object({
  assessmentId: z.string().nullable(),
  attempt: z.number().int().positive(),
  completedAt: z.string().nullable(),
  decision: z.enum(["strong_yes", "yes", "maybe", "no"]).nullable(),
  error: z.string().nullable(),
  failureCategory: z.string().nullable(),
  isCurrent: z.boolean(),
  origin: z.enum(["run", "legacy_result"]),
  pipelineAvailable: z.boolean(),
  runId: z.string(),
  score: z.number().nullable(),
  startedAt: z.string().nullable(),
  status: assessmentHistoryStatusSchema,
  version: assessmentVersionSummarySchema.nullable(),
});

export const assessmentHistoryResponseSchema = z.object({
  assessments: z.array(assessmentHistoryItemSchema),
  candidateId: z.string(),
});

export const candidateAskRequestSchema = z.object({
  question: z.string().trim().min(1).max(800),
});

export const candidateAskCitationSchema = z.object({
  chunkId: z.string(),
  candidateId: z.string().nullable(),
  label: z.string(),
  score: z.number(),
  snippet: z.string(),
  sourceType: z.enum(["crawl", "job", "pipeline", "resume", "result"]),
  title: z.string(),
});

export const candidateAskResponseSchema = z.object({
  answer: z.string(),
  citations: z.array(candidateAskCitationSchema),
  confidence: z.enum(["high", "medium", "low"]),
  crawlRequest: z
    .object({
      candidateId: z.string(),
      reason: z.string(),
      urls: z.array(z.string()),
    })
    .nullable(),
  followUps: z.array(z.string()),
  gaps: z.array(z.string()),
  needsCrawl: z.boolean(),
});

export const candidateCrawlResponseSchema = z.object({
  id: z.string().optional(),
  candidateId: z.string().optional(),
  chunksIndexed: z.number().optional(),
  completedAt: z.string().nullable().optional(),
  error: z.string().nullable().optional(),
  jobId: z.string().optional(),
  reason: z.string().optional(),
  startedAt: z.string().nullable().optional(),
  status: z.enum([
    "completed",
    "failed",
    "queued",
    "running",
    "skipped",
    "triggered",
  ]),
  updatedAt: z.string().nullable().optional(),
  urls: z.array(z.string()).optional(),
  workflowRunId: z.string().optional(),
});

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.enum(["bad_request", "not_found", "internal_error"]),
    message: z.string(),
  }),
});

export type ApiError = z.infer<typeof apiErrorSchema>;
export type AssessmentHistoryItem = z.infer<typeof assessmentHistoryItemSchema>;
export type AssessmentHistoryResponse = z.infer<
  typeof assessmentHistoryResponseSchema
>;
export type CandidateDetail = z.infer<typeof candidateDetailSchema>;
export type CandidateDetailResponse = z.infer<
  typeof candidateDetailResponseSchema
>;
export type CandidateRow = z.infer<typeof candidateRowSchema>;
export type CandidateStatus = z.infer<typeof candidateStatusSchema>;
export type CandidateAskCitation = z.infer<typeof candidateAskCitationSchema>;
export type CandidateAskRequest = z.infer<typeof candidateAskRequestSchema>;
export type CandidateAskResponse = z.infer<typeof candidateAskResponseSchema>;
export type CandidateCrawlResponse = z.infer<
  typeof candidateCrawlResponseSchema
>;
export type CandidateStats = z.infer<typeof candidateStatsSchema>;
export type CandidatesListResponse = z.infer<
  typeof candidatesListResponseSchema
>;
export type Flag = z.infer<typeof candidateFlagSchema>;
export type JobContext = z.infer<typeof jobContextSchema>;
export type PhaseState = z.infer<typeof phaseStateSchema>;
export type PipelineArtifact = z.infer<typeof pipelineArtifactSchema>;
export type PipelineEvidence = z.infer<typeof pipelineEvidenceSchema>;
export type PipelinePhase = z.infer<typeof pipelinePhaseSchema>;
export type PipelineSubAgent = z.infer<typeof pipelineSubAgentSchema>;
export type PipelineTrace = z.infer<typeof pipelineTraceSchema>;
export type PipelineTraceResponse = z.infer<typeof pipelineTraceResponseSchema>;
