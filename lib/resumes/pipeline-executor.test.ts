import { describe, expect, it } from "vitest";
import { DEFAULT_JOB_CRITERIA, DEFAULT_JOB_WEIGHTS } from "@/lib/jobs/criteria";
import {
  executeResumeReviewPipeline,
  type ResumeReviewPipelineExecutorOptions,
} from "./pipeline-executor";
import type { PlatformCrawlReport } from "./platform-crawlers";
import type {
  ResumeReviewPipelinePhase,
  ResumeReviewRunResult,
  ResumeReviewSpecialistPhaseId,
} from "./review-agent";

describe("resume review pipeline executor", () => {
  it("preserves every specialist phase and passes enriched evidence to master", async () => {
    const stepIds: string[] = [];
    const completedGroups: string[][] = [];
    const masterResult = { model: "test-master" } as ResumeReviewRunResult;
    const options: ResumeReviewPipelineExecutorOptions = {
      input: {
        criteria: DEFAULT_JOB_CRITERIA,
        jobDescription: "TypeScript role",
        jobTitle: "Engineer",
        rawText: "Built a TypeScript application.",
        weights: DEFAULT_JOB_WEIGHTS,
      },
      onPhasesCompleted: ({ phases }) => {
        completedGroups.push(phases.map((phase) => phase.id));
      },
      runMaster: async ({ input, specialistPhases }) => {
        expect(input.platformCrawl?.evidenceSummary).toBe("fixture crawl");
        expect(specialistPhases.map((phase) => phase.id)).toEqual([
          "applicant-info",
          "education-certifications",
          "structured-data-extraction",
          "profile-crawling",
          "red-flag-detection",
          "skills-verification",
          "project-matching",
          "fit-scoring",
        ]);
        return masterResult;
      },
      runPlatformCrawl: async () => ({
        phase: createPhase("profile-crawling"),
        report: createCrawlReport(),
      }),
      runSpecialist: async ({ phaseId }) => createPhase(phaseId),
      runStep: async (stepId, task) => {
        stepIds.push(stepId);
        return task();
      },
    };

    const result = await executeResumeReviewPipeline(options);

    expect(result.reviewRun).toBe(masterResult);
    expect(stepIds).toContain("master-review-candidate");
    expect(completedGroups).toEqual([
      [
        "applicant-info",
        "education-certifications",
        "structured-data-extraction",
        "profile-crawling",
        "red-flag-detection",
      ],
      ["skills-verification", "project-matching"],
      ["fit-scoring"],
    ]);
  });

  it("reports a specialist failure with its phase identity", async () => {
    const failures: Array<{ category: string; phaseId: string }> = [];

    await expect(
      executeResumeReviewPipeline({
        input: {
          criteria: DEFAULT_JOB_CRITERIA,
          jobDescription: "TypeScript role",
          jobTitle: "Engineer",
          rawText: "Resume",
          weights: DEFAULT_JOB_WEIGHTS,
        },
        onFailure: ({ category, phaseId }) => {
          failures.push({ category, phaseId });
        },
        runPlatformCrawl: async () => ({
          phase: createPhase("profile-crawling"),
          report: createCrawlReport(),
        }),
        runSpecialist: async ({ phaseId }) => {
          if (phaseId === "structured-data-extraction") {
            throw new Error("fixture failure");
          }
          return createPhase(phaseId);
        },
      }),
    ).rejects.toThrow("fixture failure");

    expect(failures).toContainEqual({
      category: "model",
      phaseId: "structured-data-extraction",
    });
  });
});

function createPhase(
  id: ResumeReviewSpecialistPhaseId,
): ResumeReviewPipelinePhase {
  return {
    action: `Run ${id}`,
    artifacts: [],
    category: "Evaluation",
    evidence: [],
    id,
    status: "completed",
    subAgents: [],
    summary: `${id} completed`,
    title: id,
  };
}

function createCrawlReport(): PlatformCrawlReport {
  return {
    agents: [],
    evidenceSummary: "fixture crawl",
    githubData: null,
    links: {
      github: null,
      hackerrank: null,
      huggingface: null,
      leetcode: null,
      linkedin: null,
      portfolio: null,
    },
    platformData: {},
  };
}
