export function rankCandidates<
  TCandidate extends { id: string; score: number },
>(candidates: TCandidate[]) {
  return [...candidates]
    .sort(
      (left, right) =>
        right.score - left.score || compareIds(left.id, right.id),
    )
    .map((candidate, index) => ({
      ...candidate,
      rank: index + 1,
    }));
}

function compareIds(left: string, right: string) {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}
