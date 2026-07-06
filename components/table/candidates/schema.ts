export type { CandidateRow, CandidateStatus } from "@/lib/candidates/types";
export {
  candidateRowSchema,
  candidateStatusSchema,
} from "@/lib/candidates/types";

export type PipelineOverlayState =
  | { type: "closed" }
  | { type: "ask-candidate"; candidateId: string }
  | { type: "ask-job" }
  | { type: "pipeline"; candidateId: string; runId?: string }
  | { type: "details"; candidateId: string }
  | { type: "criteria" }
  | { type: "upload" };
