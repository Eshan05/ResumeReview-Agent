import type {
  PipelinePhase,
  SubAgentResult,
} from "@/components/workflow/pipeline-timeline";

export type PhaseState = "pending" | "running" | "completed" | "error";

export type PipelineSubAgent = SubAgentResult;

export interface CandidateProgress {
  candidateId: string;
  phases: PipelinePhase[];
  isRunning: boolean;
}

export interface PipelineAgentTemplate {
  name: string;
  provider: string;
  model?: string;
  summary: string;
  jsxContent?: string;
  findings: string[];
}

export interface PipelinePhaseAction {
  action: string;
  subAgents: PipelineAgentTemplate[];
}
