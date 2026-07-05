import {
  DEFAULT_JOB_CRITERIA,
  DEFAULT_JOB_WEIGHTS,
  normalizeJobCriteria,
  normalizeJobWeights,
} from "@/lib/jobs/criteria";
import type {
  CandidateDetail,
  CandidateRow,
  Flag,
  JobContext,
  PipelinePhase,
  PipelineTrace,
} from "./types";
import { getFlagsForCandidate } from "./view-model";

interface CandidateDetailOptions {
  flags?: Flag[];
  jobTitle?: string;
  links?: CandidateDetail["links"];
  location?: string;
  phone?: string;
  scoreBreakdown?: CandidateDetail["scoreBreakdown"];
  summary?: string;
  uploadedAt?: string;
}

interface PipelineTraceOptions {
  elapsedMs?: number;
  phases?: PipelinePhase[];
  traceId?: string;
}

export function buildCandidateDetail(
  candidate: CandidateRow,
  options: CandidateDetailOptions = {},
): CandidateDetail {
  const flags = options.flags ?? getFlagsForCandidate(candidate);
  const jobTitle = options.jobTitle ?? "the selected role";

  return {
    ...candidate,
    summary:
      options.summary ??
      `${candidate.name} is ranked #${candidate.rank} for ${jobTitle} with strong signals in ${candidate.topSkills.slice(0, 3).join(", ")}.`,
    phone: options.phone,
    location: options.location,
    links: options.links,
    scoreBreakdown: options.scoreBreakdown ?? [
      {
        label: "Skills",
        score: Math.min(35, Math.round(candidate.score * 0.4)),
        max: 35,
      },
      {
        label: "Experience",
        score: Math.min(25, Math.round(candidate.score * 0.27)),
        max: 25,
      },
      {
        label: "Education",
        score: Math.min(15, Math.round(candidate.score * 0.15)),
        max: 15,
      },
      {
        label: "Projects",
        score: Math.min(15, Math.round(candidate.score * 0.13)),
        max: 15,
      },
      {
        label: "Trust",
        score: Math.min(10, Math.round(candidate.trust * 0.1)),
        max: 10,
      },
    ],
    flags,
    uploadedAt: options.uploadedAt ?? new Date().toISOString(),
  };
}

export function buildPipelineTrace(
  candidate: CandidateRow,
  options: PipelineTraceOptions = {},
): PipelineTrace {
  return {
    id: options.traceId ?? `trace-${candidate.id}`,
    candidateId: candidate.id,
    resumeId: candidate.resumeId,
    jobId: candidate.jobId,
    status:
      candidate.status === "failed"
        ? "error"
        : candidate.status === "processing"
          ? "running"
          : candidate.status === "pending"
            ? "pending"
            : "completed",
    elapsedMs: options.elapsedMs ?? 6700,
    phases: options.phases ?? [],
    finalOutput: {
      score: candidate.score,
      rank: candidate.rank,
      recommendation: resolveRecommendation(candidate.score),
      summary: `${candidate.name} scored ${candidate.score}/100 with ${candidate.trust}/100 trust.`,
    },
  };
}

export function buildJobContextFallback(job: Partial<JobContext>): JobContext {
  return {
    id: job.id ?? "unknown-job",
    appName: job.appName ?? "ResumeReview",
    title: job.title ?? "Untitled role",
    description: job.description ?? "",
    weights: job.weights
      ? normalizeJobWeights(job.weights)
      : DEFAULT_JOB_WEIGHTS,
    criteria: job.criteria
      ? normalizeJobCriteria(job.criteria)
      : DEFAULT_JOB_CRITERIA,
    status: job.status ?? "active",
    location: job.location,
    employmentType: job.employmentType,
  };
}

export function resolveRecommendation(
  score: number,
): PipelineTrace["finalOutput"]["recommendation"] {
  if (score >= 85) return "strong_yes";
  if (score >= 70) return "yes";
  if (score >= 50) return "maybe";
  return "no";
}
