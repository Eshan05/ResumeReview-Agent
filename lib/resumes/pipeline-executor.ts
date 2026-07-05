import {
  type ResumeReviewInput,
  type ResumeReviewPipelinePhase,
  type ResumeReviewRunResult,
  type ResumeReviewSpecialistPhaseId,
  runResumeReviewAgent,
  runResumeReviewPlatformCrawlingPhase,
  runResumeReviewSpecialistPhase,
} from "./review-agent";

type PipelinePhaseId = ResumeReviewSpecialistPhaseId | "candidate-review";
type PipelineFailureCategory = "crawl" | "model";

export interface ResumeReviewPipelineExecutorOptions {
  executionId?: string;
  input: ResumeReviewInput;
  onFailure?: (failure: {
    category: PipelineFailureCategory;
    error: unknown;
    phaseId: PipelinePhaseId;
  }) => Promise<void> | void;
  onPhasesCompleted?: (event: {
    currentPhase: string;
    phases: ResumeReviewPipelinePhase[];
    stepId: string;
  }) => Promise<void> | void;
  onPhasesStarted?: (event: {
    currentPhase: string;
    phaseIds: PipelinePhaseId[];
    stepId: string;
  }) => Promise<void> | void;
  runMaster?: (input: {
    input: ResumeReviewInput;
    quotaKey: string;
    specialistPhases: ResumeReviewPipelinePhase[];
  }) => Promise<ResumeReviewRunResult>;
  runPlatformCrawl?: typeof runResumeReviewPlatformCrawlingPhase;
  runSpecialist?: typeof runResumeReviewSpecialistPhase;
  runStep?: <T>(stepId: string, task: () => Promise<T>) => Promise<T>;
}

export interface ResumeReviewPipelineExecution {
  reviewRun: ResumeReviewRunResult;
  specialistPhases: ResumeReviewPipelinePhase[];
}

export async function executeResumeReviewPipeline({
  executionId = crypto.randomUUID(),
  input,
  onFailure,
  onPhasesCompleted,
  onPhasesStarted,
  runMaster = ({ input: reviewInput, quotaKey, specialistPhases }) =>
    runResumeReviewAgent(reviewInput, { quotaKey, specialistPhases }),
  runPlatformCrawl = runResumeReviewPlatformCrawlingPhase,
  runSpecialist = runResumeReviewSpecialistPhase,
  runStep = (_stepId, task) => task(),
}: ResumeReviewPipelineExecutorOptions): Promise<ResumeReviewPipelineExecution> {
  await startPhases(
    "mark-primary-specialist-phases-started",
    "primary-specialists",
    [
      "applicant-info",
      "education-certifications",
      "structured-data-extraction",
      "profile-crawling",
    ],
  );

  const [applicantInfo, education, structured, profileCrawl] =
    await Promise.all([
      specialist("phase-2-applicant-info", "applicant-info", input),
      specialist(
        "phase-3-education-certifications",
        "education-certifications",
        input,
      ),
      specialist(
        "phase-4-structured-data-extraction",
        "structured-data-extraction",
        input,
      ),
      runStep("phase-5-profile-crawling", async () => {
        try {
          return await runPlatformCrawl({ input });
        } catch (error) {
          await onFailure?.({
            category: "crawl",
            error,
            phaseId: "profile-crawling",
          });
          throw error;
        }
      }),
    ]);
  const enrichedInput: ResumeReviewInput = {
    ...input,
    platformCrawl: profileCrawl.report,
  };

  await startPhases("mark-red-flag-phase-started", "red-flag-detection", [
    "red-flag-detection",
  ]);
  const redFlags = await specialist(
    "phase-6-red-flag-detection",
    "red-flag-detection",
    enrichedInput,
  );
  const primaryPhases = [
    applicantInfo,
    education,
    structured,
    profileCrawl.phase,
    redFlags,
  ];
  await completePhases(
    "store-primary-specialist-phases",
    "skills-verification",
    primaryPhases,
  );

  await startPhases("mark-verification-phases-started", "skills-verification", [
    "skills-verification",
    "project-matching",
  ]);
  const verificationPhases = await Promise.all([
    specialist(
      "phase-7-skills-verification",
      "skills-verification",
      enrichedInput,
    ),
    specialist("phase-8-project-matching", "project-matching", enrichedInput),
  ]);
  await completePhases(
    "store-verification-specialist-phases",
    "fit-scoring",
    verificationPhases,
  );

  await startPhases("mark-scoring-phase-started", "fit-scoring", [
    "fit-scoring",
  ]);
  const scoring = await specialist(
    "phase-9-fit-scoring",
    "fit-scoring",
    enrichedInput,
  );
  const specialistPhases = [...primaryPhases, ...verificationPhases, scoring];
  await completePhases("store-scoring-specialist-phase", "master-review", [
    scoring,
  ]);

  await startPhases("mark-master-review-phase-started", "master-review", [
    "candidate-review",
  ]);
  const reviewRun = await runStep("master-review-candidate", async () => {
    try {
      return await runMaster({
        input: enrichedInput,
        quotaKey: `${executionId}:master-review`,
        specialistPhases,
      });
    } catch (error) {
      await onFailure?.({
        category: "model",
        error,
        phaseId: "candidate-review",
      });
      throw error;
    }
  });

  return { reviewRun, specialistPhases };

  function specialist(
    stepId: string,
    phaseId: ResumeReviewSpecialistPhaseId,
    reviewInput: ResumeReviewInput,
  ) {
    return runStep(stepId, async () => {
      try {
        return await runSpecialist({
          input: reviewInput,
          phaseId,
          quotaKey: `${executionId}:${stepId}`,
        });
      } catch (error) {
        await onFailure?.({ category: "model", error, phaseId });
        throw error;
      }
    });
  }

  function startPhases(
    stepId: string,
    currentPhase: string,
    phaseIds: PipelinePhaseId[],
  ) {
    return runStep(stepId, async () => {
      await onPhasesStarted?.({ currentPhase, phaseIds, stepId });
    });
  }

  function completePhases(
    stepId: string,
    currentPhase: string,
    phases: ResumeReviewPipelinePhase[],
  ) {
    return runStep(stepId, async () => {
      await onPhasesCompleted?.({ currentPhase, phases, stepId });
    });
  }
}
