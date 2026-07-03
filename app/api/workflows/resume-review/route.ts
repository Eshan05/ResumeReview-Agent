import { serve } from "@upstash/workflow/nextjs";
import {
  getProviderQuotaRetryAt,
  isProviderQuotaDeferredError,
} from "@/lib/ai/provider-quota";
import { executeResumeReviewPipeline } from "@/lib/resumes/pipeline-executor";
import {
  getSpecialistProviderOrder,
  type ResumeReviewSpecialistPhaseId,
} from "@/lib/resumes/review-agent";
import {
  extractAndStoreResumeText,
  loadResumeReviewInput,
  markResumeExtractionCompleted,
  markResumeProcessingStarted,
  markResumeQuotaDeferred,
  markResumeReviewCompleted,
  markResumeReviewPhasesCompleted,
  markResumeReviewPhasesStarted,
  markResumeReviewStarted,
  markResumeWorkflowFailed,
  reviewAndStoreResume,
} from "@/lib/resumes/service";
import { createWorkflowQuotaRetryError } from "@/lib/workflows/provider-quota";
import { resumeReviewWorkflowPayloadSchema } from "@/lib/workflows/resume-review";

export const runtime = "nodejs";

export const { POST } = serve(async (context) => {
  const payload = await context.run("parse-payload", async () =>
    resumeReviewWorkflowPayloadSchema.parse(context.requestPayload),
  );

  await context.run("mark-processing-started", async () => {
    await markResumeProcessingStarted({ agentRunId: payload.agentRunId });
  });

  const extraction = await context.run("extract-resume-text", async () => {
    try {
      return await extractAndStoreResumeText(payload);
    } catch (error) {
      await markResumeWorkflowFailed({
        agentRunId: payload.agentRunId,
        category: "extraction",
        error:
          error instanceof Error ? error.message : "Resume extraction failed",
      });
      throw error;
    }
  });

  await context.run("mark-extraction-completed", async () => {
    await markResumeExtractionCompleted({
      agentRunId: payload.agentRunId,
      extraction,
    });
  });

  await context.run("mark-review-started", async () => {
    await markResumeReviewStarted({ agentRunId: payload.agentRunId });
  });

  const reviewInput = await context.run("load-review-input", async () => {
    return loadResumeReviewInput(payload);
  });

  const { reviewRun } = await executeResumeReviewPipeline({
    executionId: payload.agentRunId,
    input: reviewInput,
    onFailure: async ({ category, error, phaseId }) => {
      if (isProviderQuotaDeferredError(error)) {
        await markResumeQuotaDeferred({
          agentRunId: payload.agentRunId,
          retryAt: getProviderQuotaRetryAt(error),
        });
        return;
      }
      await markResumeWorkflowFailed({
        agentRunId: payload.agentRunId,
        category,
        error:
          error instanceof Error
            ? `${phaseId} failed: ${error.message}`
            : `${phaseId} failed`,
      });
    },
    onPhasesCompleted: async ({ currentPhase, phases }) => {
      await markResumeReviewPhasesCompleted({
        agentRunId: payload.agentRunId,
        currentPhase,
        phases,
      });
    },
    onPhasesStarted: async ({ currentPhase, phaseIds }) => {
      await markResumeReviewPhasesStarted({
        agentRunId: payload.agentRunId,
        currentPhase,
        phases: phaseIds.map(createRunningPhase),
      });
    },
    runMaster: ({ input, quotaKey, specialistPhases }) =>
      reviewAndStoreResume(payload, {
        platformCrawl: input.platformCrawl,
        quotaKey,
        specialistPhases,
      }),
    runStep: async (stepId, task) => {
      try {
        return await context.run(stepId, task);
      } catch (error) {
        const quotaRetry = createWorkflowQuotaRetryError(error, stepId);
        if (quotaRetry) throw quotaRetry;
        throw error;
      }
    },
  });

  await context.run("mark-review-completed", async () => {
    await markResumeReviewCompleted({
      agentRunId: payload.agentRunId,
      reviewRun,
    });
  });
});

function createRunningPhase(
  id: ResumeReviewSpecialistPhaseId | "candidate-review",
) {
  const phase = RUNNING_PHASES[id];
  const startedAt = new Date().toISOString();
  const modelProvider =
    id === "candidate-review" ? "groq" : getSpecialistProviderOrder(id)[0];

  return {
    action: phase.action,
    artifacts: [],
    category: phase.category,
    evidence: [],
    id,
    startedAt,
    status: "running" as const,
    subAgents: phase.subAgents.map((agent) => ({
      ...agent,
      findings: [],
      provider: agent.provider === "groq" ? modelProvider : agent.provider,
      status: "running" as const,
    })),
    summary: phase.summary,
    title: phase.title,
  };
}

const RUNNING_PHASES = {
  "applicant-info": {
    action: "Extract contact details and public profile links",
    category: "Phase 2",
    subAgents: [
      {
        id: "applicant-info-extractor",
        name: "Applicant Info Extractor Agent",
        provider: "groq",
        summary: "Extracting applicant identity, contact fields, and links.",
      },
    ],
    summary: "Extracting contact details and public profile links.",
    title: "Applicant info",
  },
  "education-certifications": {
    action: "Extract education records and certification signals",
    category: "Phase 3",
    subAgents: [
      {
        id: "education-certification-extractor",
        name: "Education & Certification Extractor Agent",
        provider: "groq",
        summary: "Extracting education and certification records.",
      },
    ],
    summary: "Extracting education and certification records.",
    title: "Education & certs",
  },
  "structured-data-extraction": {
    action: "Extract claimed skills, experience, and projects",
    category: "Phase 4",
    subAgents: [
      {
        id: "skills-extractor",
        name: "Skills Extractor Agent",
        provider: "groq",
        summary: "Extracting claimed skills.",
      },
      {
        id: "experience-analyzer",
        name: "Experience Analyzer Agent",
        provider: "groq",
        summary: "Analyzing experience signals.",
      },
      {
        id: "projects-extractor",
        name: "Projects Extractor Agent",
        provider: "groq",
        summary: "Extracting project signals.",
      },
    ],
    summary: "Extracting skills, experience, and project signals.",
    title: "Structured data extraction",
  },
  "profile-crawling": {
    action: "Crawl or validate public profile signals",
    category: "Phase 5",
    subAgents: [
      {
        id: "github-crawler",
        name: "GitHub Crawler Agent",
        provider: "crawler",
        summary: "Checking public GitHub profile and repositories.",
      },
      {
        id: "leetcode-crawler",
        name: "LeetCode Crawler Agent",
        provider: "crawler",
        summary: "Checking public LeetCode profile when available.",
      },
      {
        id: "hackerrank-crawler",
        name: "HackerRank Crawler Agent",
        provider: "crawler",
        summary: "Checking public HackerRank profile when available.",
      },
      {
        id: "linkedin-validator",
        name: "LinkedIn URL Validator",
        provider: "crawler",
        summary: "Validating LinkedIn URL shape without scraping.",
      },
    ],
    summary: "Crawling and validating public profile links.",
    title: "Profile crawling",
  },
  "red-flag-detection": {
    action: "Detect material risks and evidence gaps",
    category: "Phase 6",
    subAgents: [
      {
        id: "red-flag-detector",
        name: "Red Flag Detector Agent",
        provider: "groq",
        summary: "Checking risk flags and trust evidence.",
      },
    ],
    summary: "Checking red flags, missing proof, and trust signals.",
    title: "Red flag detection",
  },
  "skills-verification": {
    action: "Verify claimed skills against resume and public evidence",
    category: "Phase 7",
    subAgents: [
      {
        id: "skills-claim-parser",
        name: "Skills Claim Parser",
        provider: "sub-agent",
        summary: "Parsing canonical skill claims.",
      },
      {
        id: "github-skill-verifier",
        name: "GitHub Skill Verifier",
        provider: "sub-agent",
        summary: "Mapping GitHub evidence to skills.",
      },
      {
        id: "skill-reconciler",
        name: "Skill Reconciler",
        provider: "sub-agent",
        summary: "Reconciling supported and missing criteria.",
      },
    ],
    summary:
      "Verifying skill claims against resume, project, and platform evidence.",
    title: "Skills verification",
  },
  "project-matching": {
    action: "Score projects against JD criteria",
    category: "Phase 8",
    subAgents: [
      {
        id: "project-signal-parser",
        name: "Project Signal Parser",
        provider: "sub-agent",
        summary: "Parsing project signals.",
      },
      {
        id: "jd-project-matcher",
        name: "JD Project Matcher",
        provider: "sub-agent",
        summary: "Matching projects to criteria.",
      },
      {
        id: "project-scorecard-reconciler",
        name: "Project Scorecard Reconciler",
        provider: "sub-agent",
        summary: "Reconciling project support and drag.",
      },
    ],
    summary: "Matching project evidence against job criteria.",
    title: "Project matching",
  },
  "fit-scoring": {
    action: "Apply HR weights to score components",
    category: "Phase 9",
    subAgents: [
      {
        id: "scoring-agent",
        name: "Scoring Agent",
        provider: "groq",
        summary: "Calculating weighted score components.",
      },
    ],
    summary: "Calculating weighted fit score and score rationale.",
    title: "Fit scoring",
  },
  "candidate-review": {
    action: "Audit phase outputs and report final recommendation",
    category: "Master",
    subAgents: [
      {
        id: "master-resume-review-agent",
        name: "Master Resume Review Agent",
        provider: "groq",
        summary: "Auditing specialist outputs and final recommendation.",
      },
    ],
    summary: "Master agent is auditing phase outputs and final score.",
    title: "Master report",
  },
} satisfies Record<
  ResumeReviewSpecialistPhaseId | "candidate-review",
  {
    action: string;
    category: string;
    subAgents: Array<{
      id: string;
      name: string;
      provider: string;
      summary: string;
    }>;
    summary: string;
    title: string;
  }
>;
