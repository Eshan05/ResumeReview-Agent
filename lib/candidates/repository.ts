import type {
  AssessmentHistoryResponse,
  CandidateDetail,
  CandidatesListResponse,
  PipelineTrace,
} from "./types";

export interface CandidateRepository {
  listCandidates(jobId: string): Promise<CandidatesListResponse | null>;
  getCandidate(candidateId: string): Promise<CandidateDetail | null>;
  getAssessmentHistory(
    candidateId: string,
  ): Promise<AssessmentHistoryResponse | null>;
  getPipelineTrace(
    candidateId: string,
    runId?: string,
  ): Promise<PipelineTrace | null>;
}
