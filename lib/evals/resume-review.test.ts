import { describe, expect, it } from "vitest";
import {
  type EvaluationObservation,
  evaluateResumeReviewSuite,
  loadResumeEvaluationSuite,
  validateResumeEvaluationSuite,
} from "./resume-review";

describe("resume review evaluations", () => {
  it("passes the committed offline baseline", async () => {
    const suite = await loadResumeEvaluationSuite();
    const observations = new Map<string, EvaluationObservation[]>();
    for (const fixture of suite.fixtures) {
      if (fixture.recorded) observations.set(fixture.id, [fixture.recorded]);
    }

    const report = evaluateResumeReviewSuite({
      mode: "offline",
      observations,
      suite,
    });

    expect(report.pass).toBe(true);
    expect(report.totals.failedChecks).toBe(0);
    expect(report.versions).toHaveLength(0);
    expect(report.cases[0]?.statistics?.mean).toBe(
      suite.fixtures[0]?.recorded?.score,
    );
  });

  it("fails when a recorded score violates its expected band", async () => {
    const suite = await loadResumeEvaluationSuite();
    const fixture = suite.fixtures[0];
    expect(fixture?.recorded).toBeDefined();
    if (!fixture?.recorded) return;

    const report = evaluateResumeReviewSuite({
      mode: "offline",
      observations: new Map([
        [fixture.id, [{ ...fixture.recorded, score: 0 }]],
      ]),
      suite: {
        ...suite,
        comparisons: [],
        fixtures: [fixture],
        invarianceGroups: [],
      },
    });

    expect(report.pass).toBe(false);
    expect(report.totals.failedChecks).toBeGreaterThan(0);
  });

  it("rejects duplicate fixture identities before observations can collide", async () => {
    const suite = await loadResumeEvaluationSuite();
    const fixture = suite.fixtures[0];
    expect(fixture).toBeDefined();
    if (!fixture) return;

    expect(() =>
      validateResumeEvaluationSuite({
        ...suite,
        fixtures: [...suite.fixtures, fixture],
      }),
    ).toThrow(/duplicate.*fixture/i);
  });
});
