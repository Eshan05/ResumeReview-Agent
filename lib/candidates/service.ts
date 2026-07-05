import { createDrizzleCandidateRepository } from "./drizzle-repository";
import type { CandidateRepository } from "./repository";

const repository = createCandidateRepository();

export class CandidateService {
  constructor(private readonly candidates: CandidateRepository) {}

  listCandidates(jobId: string) {
    return this.candidates.listCandidates(jobId);
  }

  getCandidate(candidateId: string) {
    return this.candidates.getCandidate(candidateId);
  }

  getAssessmentHistory(candidateId: string) {
    return this.candidates.getAssessmentHistory(candidateId);
  }

  getPipelineTrace(candidateId: string, runId?: string) {
    return this.candidates.getPipelineTrace(candidateId, runId);
  }
}

export const candidateService = new CandidateService(repository);

function createCandidateRepository() {
  return createDrizzleCandidateRepository();
}
