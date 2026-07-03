"use client";

import { Loader2 } from "lucide-react";
import {
  CandidateAvatar,
  type CandidateRow,
} from "@/components/table/candidates";
import { CompletedCandidateRow } from "@/components/workflow/completed-candidate-row";
import type { Flag } from "@/components/workflow/flags-popover";
import { PipelineTimeline } from "@/components/workflow/pipeline-timeline";
import type { CandidateProgress } from "./pipeline-types";

interface LiveProcessingRailProps {
  candidates: CandidateRow[];
  progress: Record<string, CandidateProgress>;
  getFlags: (candidate: CandidateRow) => Flag[];
  onOpenDetails: (id: string) => void;
  onOpenPipeline: (id: string) => void;
}

export function LiveProcessingRail({
  candidates,
  progress,
  getFlags,
  onOpenDetails,
  onOpenPipeline,
}: LiveProcessingRailProps) {
  const running = candidates.filter(
    (candidate) => progress[candidate.id]?.isRunning,
  );
  const failed = candidates.filter(
    (candidate) =>
      candidate.status === "failed" &&
      progress[candidate.id] &&
      !progress[candidate.id].isRunning,
  );
  const completed = candidates.filter(
    (candidate) =>
      candidate.status !== "failed" &&
      progress[candidate.id] &&
      !progress[candidate.id].isRunning,
  );
  const hasAnyProgress = Object.keys(progress).length > 0;

  return (
    <aside className="space-y-2 pl-1">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-xs font-semibold text-foreground">
            Live Processing
          </h2>
          {running.length > 0 && (
            <span className="text-[10px] tabular-nums text-muted-foreground">
              {running.length} active
            </span>
          )}
        </div>
        {running.length > 0 && (
          <div className="flex items-center gap-1.5">
            <div className="size-1.5 animate-pulse rounded-full bg-blue-500" />
            <span className="text-[10px] font-medium text-blue-600 dark:text-blue-400">
              Running
            </span>
          </div>
        )}
      </div>

      <div className="max-h-[50vh] space-y-3 overflow-y-auto pr-1">
        {!hasAnyProgress && candidates.length > 0 && (
          <div className="rounded-md border border-border/40 bg-muted/20 px-3 py-2">
            <p className="text-[11px] text-muted-foreground">
              Loading workflow status...
            </p>
          </div>
        )}

        {failed.length > 0 && (
          <div className="space-y-1.5">
            <p className="px-0.5 text-[10px] font-medium text-red-600 dark:text-red-400">
              Failed
            </p>
            {failed.map((candidate) => {
              const candidateProgress = progress[candidate.id];
              if (!candidateProgress) return null;
              return (
                <CompletedCandidateRow
                  key={candidate.id}
                  candidate={candidate}
                  phases={candidateProgress.phases}
                  flags={getFlags(candidate)}
                  onOpenDetails={() => onOpenDetails(candidate.id)}
                  onOpenDialog={() => onOpenPipeline(candidate.id)}
                />
              );
            })}
          </div>
        )}

        {completed.length > 0 && (
          <div className="space-y-1.5">
            <p className="px-0.5 text-[10px] font-medium text-muted-foreground">
              Completed
            </p>
            {completed.map((candidate) => {
              const candidateProgress = progress[candidate.id];
              if (!candidateProgress) return null;
              return (
                <CompletedCandidateRow
                  key={candidate.id}
                  candidate={candidate}
                  phases={candidateProgress.phases}
                  flags={getFlags(candidate)}
                  onOpenDetails={() => onOpenDetails(candidate.id)}
                  onOpenDialog={() => onOpenPipeline(candidate.id)}
                />
              );
            })}
          </div>
        )}

        {running.length > 0 && (
          <div className="space-y-3">
            <p className="px-0.5 text-[10px] font-medium text-muted-foreground">
              In Progress
            </p>
            {running.map((candidate) => {
              const candidateProgress = progress[candidate.id];
              if (!candidateProgress) return null;
              return (
                <div key={candidate.id}>
                  <div className="mb-1 flex items-center gap-2 px-0.5">
                    <CandidateAvatar
                      src={candidate.avatar}
                      name={candidate.name}
                      className="size-4"
                    />
                    <span className="text-[11px] font-medium text-foreground">
                      {candidate.name}
                    </span>
                    <Loader2 className="size-2.5 shrink-0 animate-spin text-blue-500" />
                  </div>
                  <PipelineTimeline
                    phases={candidateProgress.phases}
                    maxVisible={4}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
}
