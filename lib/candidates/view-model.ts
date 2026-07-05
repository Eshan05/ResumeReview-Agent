import type { CandidateRow, CandidateStatus, Flag } from "./types";

export function getAverageScore(candidates: CandidateRow[]) {
  if (candidates.length === 0) return 0;
  return Math.round(
    candidates.reduce((sum, candidate) => sum + candidate.score, 0) /
      candidates.length,
  );
}

export function getCandidateById(
  candidates: CandidateRow[],
  id: string | null,
) {
  if (!id) return undefined;
  return candidates.find((candidate) => candidate.id === id);
}

export function getCandidateStatusCounts(candidates: CandidateRow[]) {
  return candidates.reduce(
    (counts, candidate) => {
      counts[candidate.status] += 1;
      return counts;
    },
    {
      completed: 0,
      failed: 0,
      pending: 0,
      processing: 0,
    } satisfies Record<CandidateStatus, number>,
  );
}

export function getFlagsForCandidate(candidate: CandidateRow): Flag[] {
  return Array.from({ length: candidate.flagCount }, (_, index) => ({
    type: "amber",
    label:
      candidate.flagCount === 1
        ? "Review concern"
        : `Review concern ${index + 1}`,
    detail: "Open the pipeline trace for extracted evidence and risk details.",
  }));
}
