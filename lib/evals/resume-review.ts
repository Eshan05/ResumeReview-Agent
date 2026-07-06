import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  ASSESSMENT_SCHEMA_VERSION,
  RESUME_MASTER_PROMPT_VERSION,
  RESUME_REVIEW_AGENT_VERSION,
  RESUME_SCORING_VERSION,
  RESUME_SPECIALIST_PROMPT_VERSION,
} from "@/lib/resumes/assessment";
import type { ResumeReviewRunResult } from "@/lib/resumes/review-agent";

const evaluationVersionSchema = z.object({
  agent: z.string(),
  assessmentSchema: z.string(),
  masterModel: z.string(),
  masterPrompt: z.string(),
  provider: z.string(),
  scoring: z.string(),
  specialistModels: z.array(z.string()),
  specialistProviders: z.array(z.string()),
  specialistPrompt: z.string(),
});

export const evaluationObservationSchema = z.object({
  decision: z.enum(["strong_yes", "yes", "maybe", "no"]),
  durationMs: z.number().nonnegative().optional(),
  evidence: z.array(z.string()),
  flags: z.array(z.string()),
  modelCalls: z.number().int().nonnegative().optional(),
  score: z.number().min(0).max(100),
  skills: z.array(z.string()),
  tokensIn: z.number().int().nonnegative().optional(),
  tokensOut: z.number().int().nonnegative().optional(),
  version: evaluationVersionSchema.optional(),
});

const evaluationFixtureSchema = z.object({
  candidate: z.object({
    email: z.string().optional(),
    name: z.string(),
    resumeText: z.string().min(1),
  }),
  expectations: z.object({
    decisions: z.array(z.enum(["strong_yes", "yes", "maybe", "no"])),
    evidencePhrases: z.array(z.string()).default([]),
    forbiddenFlags: z.array(z.string()).default([]),
    forbiddenSkills: z.array(z.string()).default([]),
    requiredSkills: z.array(z.string()).default([]),
    score: z.tuple([z.number(), z.number()]),
  }),
  id: z.string().min(1),
  job: z.object({
    criteria: z.unknown().optional(),
    description: z.string().min(1),
    title: z.string().min(1),
    weights: z.unknown().optional(),
  }),
  recorded: evaluationObservationSchema.optional(),
  smoke: z.boolean().default(false),
});

export const resumeEvaluationSuiteSchema = z.object({
  comparisons: z
    .array(
      z.object({
        higher: z.string(),
        lower: z.string(),
        minGap: z.number().nonnegative().default(0),
      }),
    )
    .default([]),
  fixtures: z.array(evaluationFixtureSchema),
  invarianceGroups: z
    .array(
      z.object({
        ids: z.array(z.string()).min(2),
        maxScoreDelta: z.number().nonnegative(),
        sameDecision: z.boolean().default(true),
      }),
    )
    .default([]),
  name: z.string(),
  version: z.string(),
});

export type EvaluationFixture = z.infer<typeof evaluationFixtureSchema>;
export type EvaluationObservation = z.infer<typeof evaluationObservationSchema>;
export type EvaluationVersion = z.infer<typeof evaluationVersionSchema>;
export type ResumeEvaluationSuite = z.infer<typeof resumeEvaluationSuiteSchema>;

interface EvaluationCheck {
  detail: string;
  name: string;
  pass: boolean;
}

export interface ResumeEvaluationReport {
  cases: Array<{
    checks: EvaluationCheck[];
    decisions: EvaluationObservation["decision"][];
    id: string;
    pass: boolean;
    runs: number;
    scores: number[];
    statistics: {
      maximum: number;
      mean: number;
      minimum: number;
      standardDeviation: number;
    } | null;
  }>;
  constraints: EvaluationCheck[];
  generatedAt: string;
  mode: "offline" | "live";
  pass: boolean;
  suite: { name: string; version: string };
  totals: {
    durationMs: number;
    failedChecks: number;
    modelCalls: number;
    tokensIn: number;
    tokensOut: number;
  };
  versions: EvaluationVersion[];
}

export async function loadResumeEvaluationSuite(root = process.cwd()) {
  const committed = await readSuite(
    path.join(root, "evals", "fixtures", "resume-review.json"),
  );
  const privateDirectory = path.join(root, "evals", "private");
  const privateSuites = await readdir(privateDirectory, { withFileTypes: true })
    .then((entries) =>
      Promise.all(
        entries
          .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
          .map((entry) => readSuite(path.join(privateDirectory, entry.name))),
      ),
    )
    .catch(() => [] as ResumeEvaluationSuite[]);

  const suite = {
    ...committed,
    comparisons: [...committed.comparisons],
    fixtures: [...committed.fixtures],
    invarianceGroups: [...committed.invarianceGroups],
  };
  for (const extra of privateSuites) {
    suite.comparisons.push(...extra.comparisons);
    suite.fixtures.push(...extra.fixtures);
    suite.invarianceGroups.push(...extra.invarianceGroups);
  }
  return validateResumeEvaluationSuite(suite);
}

export function validateResumeEvaluationSuite(suite: ResumeEvaluationSuite) {
  const parsed = resumeEvaluationSuiteSchema.parse(suite);
  const ids = new Set<string>();
  for (const fixture of parsed.fixtures) {
    if (ids.has(fixture.id)) {
      throw new Error(`Duplicate resume evaluation fixture id: ${fixture.id}`);
    }
    ids.add(fixture.id);
  }
  for (const comparison of parsed.comparisons) {
    assertFixtureExists(ids, comparison.higher, "comparison");
    assertFixtureExists(ids, comparison.lower, "comparison");
  }
  for (const group of parsed.invarianceGroups) {
    for (const id of group.ids)
      assertFixtureExists(ids, id, "invariance group");
  }
  return parsed;
}

export function evaluateResumeReviewSuite({
  mode,
  observations,
  suite,
}: {
  mode: ResumeEvaluationReport["mode"];
  observations: Map<string, EvaluationObservation[]>;
  suite: ResumeEvaluationSuite;
}): ResumeEvaluationReport {
  const cases = suite.fixtures.map((fixture) => {
    const runs = observations.get(fixture.id) ?? [];
    const checks: EvaluationCheck[] = [
      check(runs.length > 0, "has-output", `${runs.length} run(s)`),
    ];

    for (const [index, run] of runs.entries()) {
      const prefix = `run-${index + 1}`;
      checks.push(
        check(
          run.score >= fixture.expectations.score[0] &&
            run.score <= fixture.expectations.score[1],
          `${prefix}-score-band`,
          `${run.score} in ${fixture.expectations.score.join("-")}`,
        ),
        check(
          fixture.expectations.decisions.includes(run.decision),
          `${prefix}-decision`,
          run.decision,
        ),
      );

      const skills = new Set(run.skills.map(normalize));
      const flags = run.flags.map(normalize).join("\n");
      const evidence = run.evidence.map(normalize).join("\n");
      for (const skill of fixture.expectations.requiredSkills) {
        checks.push(
          check(
            skills.has(normalize(skill)),
            `${prefix}-required-skill:${skill}`,
            skill,
          ),
        );
      }
      for (const skill of fixture.expectations.forbiddenSkills) {
        checks.push(
          check(
            !skills.has(normalize(skill)),
            `${prefix}-forbidden-skill:${skill}`,
            skill,
          ),
        );
      }
      for (const flag of fixture.expectations.forbiddenFlags) {
        checks.push(
          check(
            !flags.includes(normalize(flag)),
            `${prefix}-forbidden-flag:${flag}`,
            flag,
          ),
        );
      }
      for (const phrase of fixture.expectations.evidencePhrases) {
        checks.push(
          check(
            evidence.includes(normalize(phrase)),
            `${prefix}-evidence:${phrase}`,
            phrase,
          ),
        );
      }
    }

    if (runs.length > 1) {
      const scores = runs.map((run) => run.score);
      const range = Math.max(...scores) - Math.min(...scores);
      const deviation = standardDeviation(scores);
      checks.push(
        check(range <= 8, "score-range", `${range.toFixed(2)} <= 8`),
        check(
          deviation <= 4,
          "score-standard-deviation",
          `${deviation.toFixed(2)} <= 4`,
        ),
      );
    }

    const scores = runs.map((run) => run.score);
    return {
      checks,
      decisions: runs.map((run) => run.decision),
      id: fixture.id,
      pass: checks.every((item) => item.pass),
      runs: runs.length,
      scores,
      statistics:
        scores.length > 0
          ? {
              maximum: Math.max(...scores),
              mean: mean(scores),
              minimum: Math.min(...scores),
              standardDeviation: standardDeviation(scores),
            }
          : null,
    };
  });
  const constraints = evaluateConstraints(suite, observations);
  const allChecks = [...cases.flatMap((item) => item.checks), ...constraints];
  const allRuns = Array.from(observations.values()).flat();

  return {
    cases,
    constraints,
    generatedAt: new Date().toISOString(),
    mode,
    pass: allChecks.every((item) => item.pass),
    suite: { name: suite.name, version: suite.version },
    totals: {
      durationMs: sum(allRuns, "durationMs"),
      failedChecks: allChecks.filter((item) => !item.pass).length,
      modelCalls: sum(allRuns, "modelCalls"),
      tokensIn: sum(allRuns, "tokensIn"),
      tokensOut: sum(allRuns, "tokensOut"),
    },
    versions: uniqueVersions(allRuns),
  };
}

export function observationFromReviewRun(
  run: ResumeReviewRunResult,
): EvaluationObservation {
  const phaseAgents = run.pipeline.phases.flatMap((phase) => phase.subAgents);
  const usage = asRecord(run.tokenUsage);
  return evaluationObservationSchema.parse({
    decision: run.review.decision,
    durationMs: run.pipeline.totalDurationMs,
    evidence: [
      ...run.review.skills.evidence,
      ...run.review.experience.evidence,
      ...run.review.projects.evidence,
      ...run.review.education.evidence,
      ...run.pipeline.phases.flatMap((phase) =>
        phase.evidence.map((item) => item.snippet),
      ),
    ],
    flags: run.review.risks.redFlags.flatMap((flag) => [
      flag.message,
      flag.evidence,
    ]),
    modelCalls: Math.max(
      run.pipeline.phases.filter((phase) =>
        phase.subAgents.some((agent) =>
          ["cerebras", "groq"].includes(agent.provider),
        ),
      ).length,
      run.provider === "groq" ? 1 : 0,
    ),
    score: run.review.finalScore,
    skills: run.review.skills.all.map((skill) => skill.name),
    tokensIn:
      phaseAgents.reduce((total, agent) => total + (agent.tokensIn ?? 0), 0) +
      asNumber(usage?.inputTokens),
    tokensOut:
      phaseAgents.reduce((total, agent) => total + (agent.tokensOut ?? 0), 0) +
      asNumber(usage?.outputTokens),
    version: {
      agent: RESUME_REVIEW_AGENT_VERSION,
      assessmentSchema: ASSESSMENT_SCHEMA_VERSION,
      masterModel: run.model,
      masterPrompt: RESUME_MASTER_PROMPT_VERSION,
      provider: run.provider,
      scoring: RESUME_SCORING_VERSION,
      specialistModels: Array.from(
        new Set(
          phaseAgents
            .map((agent) => agent.model)
            .filter((model): model is string => Boolean(model)),
        ),
      ),
      specialistProviders: Array.from(
        new Set(
          phaseAgents
            .map((agent) => agent.provider)
            .filter((provider) => ["cerebras", "groq"].includes(provider)),
        ),
      ),
      specialistPrompt: RESUME_SPECIALIST_PROMPT_VERSION,
    },
  });
}

function evaluateConstraints(
  suite: ResumeEvaluationSuite,
  observations: Map<string, EvaluationObservation[]>,
) {
  const checks: EvaluationCheck[] = [];
  for (const comparison of suite.comparisons) {
    const higher = meanScore(observations.get(comparison.higher));
    const lower = meanScore(observations.get(comparison.lower));
    checks.push(
      check(
        higher !== null &&
          lower !== null &&
          higher - lower >= comparison.minGap,
        `ranking:${comparison.higher}>${comparison.lower}`,
        `${formatNumber(higher)} - ${formatNumber(lower)} >= ${comparison.minGap}`,
      ),
    );
  }

  for (const group of suite.invarianceGroups) {
    const runs = group.ids.flatMap((id) => observations.get(id) ?? []);
    const scores = runs.map((run) => run.score);
    const decisions = new Set(runs.map((run) => run.decision));
    const delta = scores.length
      ? Math.max(...scores) - Math.min(...scores)
      : Number.POSITIVE_INFINITY;
    checks.push(
      check(
        delta <= group.maxScoreDelta,
        `invariance-score:${group.ids.join(",")}`,
        `${formatNumber(delta)} <= ${group.maxScoreDelta}`,
      ),
    );
    if (group.sameDecision) {
      checks.push(
        check(
          runs.length > 0 && decisions.size === 1,
          `invariance-decision:${group.ids.join(",")}`,
          Array.from(decisions).join(", ") || "no output",
        ),
      );
    }
  }
  return checks;
}

async function readSuite(filePath: string) {
  return resumeEvaluationSuiteSchema.parse(
    JSON.parse(await readFile(filePath, "utf8")),
  );
}

function check(pass: boolean, name: string, detail: string): EvaluationCheck {
  return { detail, name, pass };
}

function normalize(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function standardDeviation(values: number[]) {
  if (values.length < 2) return 0;
  const average = mean(values);
  return Math.sqrt(
    values.reduce((total, value) => total + (value - average) ** 2, 0) /
      values.length,
  );
}

function mean(values: number[]) {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function meanScore(values: EvaluationObservation[] | undefined) {
  if (!values?.length) return null;
  return (
    values.reduce((total, value) => total + value.score, 0) / values.length
  );
}

function sum(
  values: EvaluationObservation[],
  key: keyof EvaluationObservation,
) {
  return values.reduce((total, value) => {
    const item = value[key];
    return total + (typeof item === "number" ? item : 0);
  }, 0);
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function asNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function formatNumber(value: number | null) {
  return value === null || !Number.isFinite(value)
    ? "missing"
    : value.toFixed(2);
}

function uniqueVersions(observations: EvaluationObservation[]) {
  const versions = new Map<string, EvaluationVersion>();
  for (const observation of observations) {
    if (!observation.version) continue;
    const key = JSON.stringify(observation.version);
    versions.set(key, observation.version);
  }
  return Array.from(versions.values());
}

function assertFixtureExists(
  fixtureIds: Set<string>,
  fixtureId: string,
  relation: string,
) {
  if (!fixtureIds.has(fixtureId)) {
    throw new Error(
      `Unknown resume evaluation fixture ${fixtureId} in ${relation}`,
    );
  }
}
