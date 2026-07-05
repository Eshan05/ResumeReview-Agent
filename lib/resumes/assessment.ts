import { createHash } from "node:crypto";
import type { JobCriteria, JobWeights } from "@/lib/jobs/criteria";

export const ASSESSMENT_SCHEMA_VERSION = "resume-assessment-v1";
export const RESUME_REVIEW_AGENT_VERSION = "resume-review-agent-v1";
export const RESUME_SCORING_VERSION = "weighted-score-v1";
export const RESUME_MASTER_PROMPT_VERSION = "resume-master-prompt-v2";
export const RESUME_SPECIALIST_PROMPT_VERSION = "resume-specialist-prompt-v2";

export interface AssessmentInputHashes {
  jobDescription: string;
  platformCrawl: string;
  resumeText: string;
  specialistPhases: string;
}

export interface AssessmentRubricSnapshot {
  criteria: JobCriteria;
  jobTitle: string;
  weights: JobWeights;
}

export interface AssessmentVersionManifest {
  agentVersion: string;
  assessmentSchemaVersion: string;
  fallbackReason?: string;
  model: string;
  outputMode: string;
  pipelineStrategy: string;
  prompts: {
    master: string;
    specialist: string;
  };
  provider: string;
  repairedOutput: boolean;
  scoringVersion: string;
  specialistModels: string[];
  specialistProviders: string[];
  warnings?: string[];
}

export function createAssessmentId(agentRunId: string) {
  return `resume-result-${agentRunId}`;
}

export function hashAssessmentInput(value: unknown) {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(sortJsonValue(value));
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJsonValue);
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, sortJsonValue(item)]),
  );
}
