"use client";

import { FileText, MessageSquare, Settings2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { ModeToggle } from "@/components/shared/mode-toggle";
import { Button } from "@/components/ui/button";
import {
  type CandidateProgress,
  LiveProcessingRail,
  PipelineDialog,
  useLiveCandidates,
  type WorkflowPhase,
  type WorkflowViewProps,
} from "@/components/workflow";
import type {
  AssessmentHistoryItem,
  AssessmentHistoryResponse,
  CandidateRow,
  CandidatesListResponse,
  PipelineTrace,
} from "@/lib/candidates/types";
import { CandidateAskSheet } from "./candidate-ask-sheet";
import { CandidateDetailSheet } from "./candidate-detail-sheet";
import { CandidateUploadDialog } from "./candidate-upload-dialog";
import { createCandidateColumns } from "./columns";
import { DataTable } from "./data-table";
import { JobCriteriaSheet } from "./job-criteria-sheet";
import type { PipelineOverlayState } from "./schema";
import { getCandidateById, getFlagsForCandidate } from "./view-model";

interface CandidateDashboardProps {
  initialData: CandidatesListResponse;
}

export function CandidateDashboard({ initialData }: CandidateDashboardProps) {
  const router = useRouter();
  const [data, setData] = React.useState(initialData);
  const [overlay, setOverlay] = React.useState<PipelineOverlayState>({
    type: "closed",
  });
  const [pipelineTrace, setPipelineTrace] =
    React.useState<PipelineTrace | null>(null);
  const [isLoadingPipeline, setIsLoadingPipeline] = React.useState(false);
  const [assessmentHistory, setAssessmentHistory] = React.useState<
    AssessmentHistoryItem[]
  >([]);
  const [isLoadingAssessmentHistory, setIsLoadingAssessmentHistory] =
    React.useState(false);
  const processingCandidates = React.useMemo(
    () =>
      data.candidates.filter(
        (candidate) =>
          candidate.status === "processing" || candidate.status === "pending",
      ),
    [data.candidates],
  );
  const railCandidates = React.useMemo(
    () => [
      ...data.candidates
        .filter(
          (candidate) =>
            candidate.status === "processing" ||
            candidate.status === "pending" ||
            candidate.status === "failed",
        )
        .slice(0, 100),
      ...data.candidates
        .filter((candidate) => candidate.status === "completed")
        .slice(0, 25),
    ],
    [data.candidates],
  );
  const live = useLiveCandidates(railCandidates);
  const reloadedTerminalKeyRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    setData(initialData);
  }, [initialData]);

  React.useEffect(() => {
    if (processingCandidates.length === 0) return;
    live.startProcessing();
  }, [live.startProcessing, processingCandidates.length]);

  const reloadCandidates = React.useCallback(async () => {
    const response = await fetch(
      `/api/jobs/${encodeURIComponent(data.job.id)}/candidates`,
      { cache: "no-store" },
    );

    if (!response.ok) return;

    setData((await response.json()) as CandidatesListResponse);
  }, [data.job.id]);

  React.useEffect(() => {
    if (processingCandidates.length === 0) {
      reloadedTerminalKeyRef.current = null;
      return;
    }

    const terminalKey = processingCandidates
      .map((candidate) => {
        const progress = live.progress[candidate.id];
        return progress && !progress.isRunning ? candidate.id : null;
      })
      .filter(Boolean)
      .join(",");

    if (!terminalKey || terminalKey === reloadedTerminalKeyRef.current) return;
    if (
      !processingCandidates.every((candidate) => {
        const progress = live.progress[candidate.id];
        return progress && !progress.isRunning;
      })
    ) {
      return;
    }

    reloadedTerminalKeyRef.current = terminalKey;
    router.refresh();
    void reloadCandidates();
  }, [live.progress, processingCandidates, reloadCandidates, router]);

  const openPipeline = React.useCallback(
    (candidateId: string, runId?: string) => {
      setOverlay({ type: "pipeline", candidateId, runId });
      setPipelineTrace(null);
      setIsLoadingPipeline(true);

      const query = runId ? `?runId=${encodeURIComponent(runId)}` : "";
      fetch(
        `/api/candidates/${encodeURIComponent(candidateId)}/pipeline${query}`,
        {
          cache: "no-store",
        },
      )
        .then(async (response) => {
          if (!response.ok) return null;
          return ((await response.json()) as { trace: PipelineTrace }).trace;
        })
        .then((trace) => {
          setPipelineTrace(trace);
        })
        .catch(() => {
          setPipelineTrace(null);
        })
        .finally(() => {
          setIsLoadingPipeline(false);
        });
    },
    [],
  );

  const openDetails = React.useCallback((candidateId: string) => {
    setOverlay({ type: "details", candidateId });
  }, []);

  React.useEffect(() => {
    if (overlay.type !== "details") return;

    const controller = new AbortController();
    setAssessmentHistory([]);
    setIsLoadingAssessmentHistory(true);
    fetch(
      `/api/candidates/${encodeURIComponent(overlay.candidateId)}/assessments`,
      { cache: "no-store", signal: controller.signal },
    )
      .then(async (response) => {
        if (!response.ok) return null;
        return (await response.json()) as AssessmentHistoryResponse;
      })
      .then((response) => {
        if (response) setAssessmentHistory(response.assessments);
      })
      .catch(() => {
        if (!controller.signal.aborted) setAssessmentHistory([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoadingAssessmentHistory(false);
      });

    return () => controller.abort();
  }, [overlay]);

  const openCandidateAsk = React.useCallback((candidateId: string) => {
    setOverlay({ type: "ask-candidate", candidateId });
  }, []);

  const openJobAsk = React.useCallback(() => {
    setOverlay({ type: "ask-job" });
  }, []);

  const openCriteria = React.useCallback(() => {
    setOverlay({ type: "criteria" });
  }, []);

  const closeOverlay = React.useCallback(() => {
    setOverlay({ type: "closed" });
  }, []);

  const openUpload = React.useCallback(() => {
    setOverlay({ type: "upload" });
  }, []);

  const columns = React.useMemo(
    () =>
      createCandidateColumns({
        getFlags: getFlagsForCandidate,
        onAskCandidate: openCandidateAsk,
        onViewDetails: openDetails,
        onViewPipeline: openPipeline,
      }),
    [openCandidateAsk, openDetails, openPipeline],
  );

  const pipelineCandidate =
    overlay.type === "pipeline"
      ? getCandidateById(data.candidates, overlay.candidateId)
      : undefined;
  const detailCandidate =
    overlay.type === "details"
      ? getCandidateById(data.candidates, overlay.candidateId)
      : undefined;
  const askCandidate =
    overlay.type === "ask-candidate"
      ? getCandidateById(data.candidates, overlay.candidateId)
      : undefined;
  const overlayCandidate = pipelineCandidate ?? detailCandidate ?? askCandidate;
  const pipelinePhases =
    pipelineTrace && pipelineCandidate
      ? toWorkflowPhases(pipelineTrace)
      : pipelineCandidate && live.progress[pipelineCandidate.id]
        ? toWorkflowPhasesFromProgress(live.progress[pipelineCandidate.id])
        : pipelineCandidate
          ? buildPipelineShell(pipelineCandidate, isLoadingPipeline)
          : [];

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b border-border/40 bg-card">
        <div className="flex h-12 items-center justify-between px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex items-center gap-2">
              <FileText className="size-4 text-muted-foreground" />
              <span className="text-sm font-medium text-foreground">
                {data.job.appName}
              </span>
            </div>
            <span className="text-muted-foreground/30">/</span>
            <span className="truncate text-sm text-muted-foreground">
              {data.job.title}
            </span>
            {overlayCandidate && (
              <>
                <span className="text-muted-foreground/30">/</span>
                <span className="truncate text-sm text-foreground">
                  {overlayCandidate.name}
                </span>
              </>
            )}
          </div>
          <ModeToggle />
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] p-4">
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_400px]">
          <section>
            <div className="mb-4 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
              <div>
                <h1 className="text-lg font-semibold text-foreground">
                  Candidates
                </h1>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {data.stats.total} resumes - Avg score:{" "}
                  {data.stats.averageScore}
                </p>
              </div>
              <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:flex-nowrap">
                {processingCandidates.length > 0 && (
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {live.globalElapsed.toFixed(1)}s elapsed
                  </span>
                )}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8"
                  onClick={openCriteria}
                >
                  <Settings2 className="size-3.5" />
                  Criteria
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8"
                  onClick={openJobAsk}
                >
                  <MessageSquare className="size-3.5" />
                  Ask
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="h-8"
                  onClick={openUpload}
                >
                  <Upload className="size-3.5" />
                  Upload resumes
                </Button>
              </div>
            </div>
            <DataTable
              columns={columns}
              data={data.candidates}
              onRowClick={openPipeline}
              onViewPipeline={openPipeline}
            />
          </section>

          <LiveProcessingRail
            candidates={railCandidates}
            progress={live.progress}
            getFlags={getFlagsForCandidate}
            onOpenDetails={openDetails}
            onOpenPipeline={openPipeline}
          />
        </div>
      </main>

      <CandidateDetailSheet
        assessmentHistory={assessmentHistory}
        candidate={detailCandidate}
        flags={detailCandidate ? getFlagsForCandidate(detailCandidate) : []}
        isLoadingAssessmentHistory={isLoadingAssessmentHistory}
        open={overlay.type === "details"}
        onAskCandidate={openCandidateAsk}
        onOpenChange={(open) => {
          if (!open) closeOverlay();
        }}
        onViewPipeline={openPipeline}
      />

      <CandidateAskSheet
        candidate={askCandidate}
        job={data.job}
        mode={overlay.type === "ask-job" ? "job" : "candidate"}
        open={overlay.type === "ask-job" || !!askCandidate}
        onOpenChange={(open) => {
          if (!open) closeOverlay();
        }}
      />

      <JobCriteriaSheet
        job={data.job}
        open={overlay.type === "criteria"}
        onOpenChange={(open) => {
          if (!open) closeOverlay();
        }}
        onSaved={(job) => {
          setData((current) => ({ ...current, job }));
          router.refresh();
        }}
      />

      {pipelineCandidate && (
        <PipelineDialog
          open={overlay.type === "pipeline"}
          onOpenChange={(open) => {
            if (!open) closeOverlay();
          }}
          candidateName={pipelineCandidate.name}
          fileName={pipelineCandidate.fileName}
          phases={pipelinePhases}
          elapsed={
            pipelineTrace ? formatDuration(pipelineTrace.elapsedMs) : undefined
          }
          overallStatus={
            pipelineTrace
              ? toWorkflowStatus(pipelineTrace.status)
              : "processing"
          }
        />
      )}

      <CandidateUploadDialog
        jobId={data.job.id}
        open={overlay.type === "upload"}
        onOpenChange={(open) => {
          if (!open) closeOverlay();
        }}
        onUploaded={() => {
          router.refresh();
          window.setTimeout(() => void reloadCandidates(), 500);
        }}
      />
    </div>
  );
}

function toWorkflowPhases(trace: PipelineTrace): WorkflowPhase[] {
  return trace.phases.map((phase) => ({
    category: phase.category,
    categoryColor: "bg-muted text-muted-foreground",
    description: phase.summary,
    duration: formatDuration(phase.durationMs),
    files: phase.artifacts.map((artifact) => ({
      name: artifact.name,
      type: toWorkflowFileType(artifact.type),
    })),
    id: phase.id,
    status: phase.status,
    subSteps: phase.subAgents.map((agent) => ({
      duration: formatDuration(agent.durationMs),
      findings: agent.findings,
      id: agent.id,
      model: agent.model,
      name: agent.name,
      provider: normalizeProvider(agent.provider),
      status: agent.status,
      summary: agent.summary,
      tokensIn: agent.tokensIn,
      tokensOut: agent.tokensOut,
    })),
    title: phase.title,
    details:
      phase.evidence.length > 0 ? (
        <div className="space-y-2">
          {phase.evidence.map((item) => (
            <div
              key={item.id}
              className="rounded-md border border-border/50 bg-muted/30 px-3 py-2"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-medium text-foreground">
                  {item.label}
                </span>
                {item.source && (
                  <span className="text-[10px] text-muted-foreground">
                    {item.source}
                  </span>
                )}
              </div>
              <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
                {item.snippet}
              </p>
            </div>
          ))}
        </div>
      ) : undefined,
  }));
}

function toWorkflowPhasesFromProgress(
  progress: CandidateProgress,
): WorkflowPhase[] {
  return progress.phases.map((phase) => ({
    category: "Progress",
    categoryColor: "bg-muted text-muted-foreground",
    description: phase.action,
    duration: phase.duration,
    id: phase.id,
    status: phase.status,
    subSteps:
      phase.subAgents?.map((agent, index) => ({
        duration: agent.duration,
        findings: agent.findings ?? [],
        id: `${phase.id}-agent-${index}`,
        model: agent.model,
        name: agent.name,
        provider: normalizeProvider(agent.provider),
        status: agent.status,
        summary: agent.summary,
        tokensIn: agent.tokensIn,
        tokensOut: agent.tokensOut,
      })) ?? [],
    title: phase.title,
  }));
}

function buildPipelineShell(
  candidate: CandidateRow,
  isLoading: boolean,
): WorkflowPhase[] {
  const reviewStatus =
    candidate.status === "completed" ? "completed" : "pending";

  return [
    {
      category: "Ingestion",
      categoryColor: "bg-muted text-muted-foreground",
      description: `Waiting for stored extraction trace for ${candidate.fileName}.`,
      id: "text-extraction",
      status: isLoading ? "running" : reviewStatus,
      title: "Text extraction",
    },
    {
      category: "Review",
      categoryColor: "bg-muted text-muted-foreground",
      description:
        "Candidate review trace will appear after the workflow writes backend phases.",
      id: "candidate-review",
      status: isLoading ? "pending" : reviewStatus,
      title: "Candidate review",
    },
  ];
}

function toWorkflowStatus(
  status: PipelineTrace["status"],
): WorkflowViewProps["overallStatus"] {
  if (status === "running") return "processing";
  if (status === "completed") return "completed";
  if (status === "error") return "error";
  return "idle";
}

function toWorkflowFileType(
  type: string,
): NonNullable<WorkflowPhase["files"]>[number]["type"] {
  if (type === "pdf" || type === "xlsx" || type === "docx" || type === "txt") {
    return type;
  }

  return "other";
}

function normalizeProvider(provider: string) {
  if (provider.toLowerCase() === "groq") return "Groq";
  if (provider.toLowerCase() === "cerebras") return "Cerebras";
  return provider;
}

function formatDuration(durationMs: number | undefined) {
  if (durationMs === undefined) return undefined;
  if (durationMs < 1000) return `${durationMs}ms`;
  return `${(durationMs / 1000).toFixed(1)}s`;
}
