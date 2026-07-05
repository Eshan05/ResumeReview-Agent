import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import dotenv from "dotenv";
import {
  type EvaluationObservation,
  evaluateResumeReviewSuite,
  loadResumeEvaluationSuite,
  observationFromReviewRun,
  type ResumeEvaluationReport,
  type ResumeEvaluationSuite,
} from "@/lib/evals/resume-review";
import { normalizeJobCriteria, normalizeJobWeights } from "@/lib/jobs/criteria";
import {
  ASSESSMENT_SCHEMA_VERSION,
  RESUME_MASTER_PROMPT_VERSION,
  RESUME_REVIEW_AGENT_VERSION,
  RESUME_SCORING_VERSION,
  RESUME_SPECIALIST_PROMPT_VERSION,
} from "@/lib/resumes/assessment";
import { executeResumeReviewPipeline } from "@/lib/resumes/pipeline-executor";

dotenv.config({ path: ".env.local" });

if (process.argv.includes("--live")) {
  process.env.PROVIDER_QUOTA_WAIT_MAX_MS ??= "120000";
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const live = args.has("--live");
  const smoke = args.has("--smoke");
  const updateBaseline = args.has("--update-baseline");
  const mode = live ? "live" : "offline";
  const loaded = await loadResumeEvaluationSuite();
  const suite = selectSuite(loaded, { live, smoke });
  const observations = live
    ? await runLiveSuite(suite, smoke ? 1 : 3)
    : recordedObservations(suite);
  const report = evaluateResumeReviewSuite({ mode, observations, suite });
  const reportDirectory = path.join(process.cwd(), "evals", "reports");
  await mkdir(reportDirectory, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const name = `${mode}${smoke ? "-smoke" : ""}-${stamp}`;
  await Promise.all([
    writeFile(
      path.join(reportDirectory, `${name}.json`),
      `${JSON.stringify(report, null, 2)}\n`,
    ),
    writeFile(path.join(reportDirectory, `${name}.md`), formatMarkdown(report)),
  ]);

  if (updateBaseline) {
    const baselineDirectory = path.join(process.cwd(), "evals", "baselines");
    await mkdir(baselineDirectory, { recursive: true });
    await writeFile(
      path.join(baselineDirectory, "current.json"),
      `${JSON.stringify(report, null, 2)}\n`,
    );
  }

  console.log(formatMarkdown(report));
  if (!report.pass) process.exitCode = 1;
}

function selectSuite(
  suite: ResumeEvaluationSuite,
  options: { live: boolean; smoke: boolean },
): ResumeEvaluationSuite {
  const fixtures = suite.fixtures.filter((fixture) => {
    if (options.smoke && !fixture.smoke) return false;
    return options.live || Boolean(fixture.recorded);
  });
  const ids = new Set(fixtures.map((fixture) => fixture.id));

  return {
    ...suite,
    comparisons: suite.comparisons.filter(
      (item) => ids.has(item.higher) && ids.has(item.lower),
    ),
    fixtures,
    invarianceGroups: suite.invarianceGroups.filter((group) =>
      group.ids.every((id) => ids.has(id)),
    ),
  };
}

function recordedObservations(suite: ResumeEvaluationSuite) {
  const observations = new Map<string, EvaluationObservation[]>();
  for (const fixture of suite.fixtures) {
    if (fixture.recorded) {
      observations.set(fixture.id, [
        {
          ...fixture.recorded,
          version: fixture.recorded.version ?? {
            agent: RESUME_REVIEW_AGENT_VERSION,
            assessmentSchema: ASSESSMENT_SCHEMA_VERSION,
            masterModel: "recorded-baseline",
            masterPrompt: RESUME_MASTER_PROMPT_VERSION,
            provider: "fixture",
            scoring: RESUME_SCORING_VERSION,
            specialistModels: [],
            specialistProviders: [],
            specialistPrompt: RESUME_SPECIALIST_PROMPT_VERSION,
          },
        },
      ]);
    }
  }
  return observations;
}

async function runLiveSuite(suite: ResumeEvaluationSuite, passes: number) {
  if (!process.env.GROQ_API_KEY) {
    throw new Error("GROQ_API_KEY is required for live resume evaluations");
  }

  const observations = new Map<string, EvaluationObservation[]>();
  for (let pass = 0; pass < passes; pass += 1) {
    for (const fixture of suite.fixtures) {
      const startedAt = Date.now();
      const { reviewRun } = await executeResumeReviewPipeline({
        input: {
          applicantEmail: fixture.candidate.email,
          applicantName: fixture.candidate.name,
          criteria: normalizeJobCriteria(fixture.job.criteria),
          jobDescription: fixture.job.description,
          jobTitle: fixture.job.title,
          rawText: fixture.candidate.resumeText,
          weights: normalizeJobWeights(fixture.job.weights),
        },
      });
      const observation = observationFromReviewRun(reviewRun);
      observation.durationMs = Date.now() - startedAt;
      observations.set(fixture.id, [
        ...(observations.get(fixture.id) ?? []),
        observation,
      ]);
    }
  }
  return observations;
}

function formatMarkdown(report: ResumeEvaluationReport) {
  const lines = [
    `# Resume Evaluation: ${report.pass ? "PASS" : "FAIL"}`,
    "",
    `- Suite: ${report.suite.name} ${report.suite.version}`,
    `- Mode: ${report.mode}`,
    `- Failed checks: ${report.totals.failedChecks}`,
    `- Model calls: ${report.totals.modelCalls}`,
    `- Tokens: ${report.totals.tokensIn} in / ${report.totals.tokensOut} out`,
    `- Duration: ${report.totals.durationMs}ms`,
    "",
    "## Cases",
    "",
    ...report.cases.map(
      (item) =>
        `- ${item.pass ? "PASS" : "FAIL"} ${item.id} (${item.runs} run${item.runs === 1 ? "" : "s"}; scores ${item.scores.join(", ") || "none"}; mean ${item.statistics?.mean.toFixed(2) ?? "n/a"}; sd ${item.statistics?.standardDeviation.toFixed(2) ?? "n/a"})`,
    ),
  ];
  if (report.versions.length > 0) {
    lines.push(
      "",
      "## Versions",
      "",
      ...report.versions.map(
        (version) =>
          `- ${version.provider}/${version.masterModel}; agent ${version.agent}; scoring ${version.scoring}; prompts ${version.masterPrompt}, ${version.specialistPrompt}; specialists ${version.specialistProviders.join(", ") || "recorded"} (${version.specialistModels.join(", ") || "recorded"})`,
      ),
    );
  }
  const failures = [
    ...report.cases.flatMap((item) =>
      item.checks
        .filter((check) => !check.pass)
        .map((check) => `${item.id}/${check.name}: ${check.detail}`),
    ),
    ...report.constraints
      .filter((check) => !check.pass)
      .map((check) => `${check.name}: ${check.detail}`),
  ];
  if (failures.length) {
    lines.push("", "## Failures", "", ...failures.map((item) => `- ${item}`));
  }
  return `${lines.join("\n")}\n`;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
