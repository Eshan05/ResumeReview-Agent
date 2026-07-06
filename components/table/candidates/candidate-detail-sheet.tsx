"use client";

import {
  Briefcase,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  Clock3,
  FileText,
  GraduationCap,
  History,
  MessageSquare,
  Shield,
  Sparkles,
  Star,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { Flag } from "@/components/workflow/flags-popover";
import { FlagsPopover } from "@/components/workflow/flags-popover";
import type { AssessmentHistoryItem } from "@/lib/candidates/types";
import { getSkillIcon } from "@/utils/mappings";
import { CandidateAvatar } from "./candidate-avatar";
import type { CandidateRow } from "./schema";

interface CandidateDetailSheetProps {
  assessmentHistory: AssessmentHistoryItem[];
  candidate: CandidateRow | undefined;
  flags: Flag[];
  isLoadingAssessmentHistory: boolean;
  open: boolean;
  onAskCandidate: (id: string) => void;
  onOpenChange: (open: boolean) => void;
  onViewPipeline: (id: string, runId?: string) => void;
}

export function CandidateDetailSheet({
  assessmentHistory,
  candidate,
  flags,
  isLoadingAssessmentHistory,
  open,
  onAskCandidate,
  onOpenChange,
  onViewPipeline,
}: CandidateDetailSheetProps) {
  return (
    <Sheet open={open && !!candidate} onOpenChange={onOpenChange}>
      <SheetContent className="w-[92vw] sm:max-w-md gap-0 overflow-hidden p-0">
        {candidate && (
          <>
            <SheetHeader className="border-b border-border/50 p-5">
              <div className="flex items-start gap-3">
                <CandidateAvatar
                  src={candidate.avatar}
                  name={candidate.name}
                  className="size-11"
                />
                <div className="min-w-0 flex-1">
                  <SheetTitle className="truncate">{candidate.name}</SheetTitle>
                  <SheetDescription className="truncate">
                    {candidate.email}
                  </SheetDescription>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <Badge variant="secondary" className="gap-1 text-[10px]">
                      <Sparkles className="size-3" />
                      Score {candidate.score}
                    </Badge>
                    <Badge variant="outline" className="gap-1 text-[10px]">
                      <Shield className="size-3" />
                      Trust {candidate.trust}
                    </Badge>
                    <FlagsPopover flags={flags} />
                  </div>
                </div>
              </div>
            </SheetHeader>

            <div className="flex-1 space-y-5 overflow-y-auto p-5">
              <section className="space-y-2">
                <h3 className="text-xs font-semibold text-foreground">
                  Review Summary
                </h3>
                <div className="grid grid-cols-2 gap-2">
                  <Metric
                    icon={Star}
                    label="Rank"
                    value={`#${candidate.rank}`}
                  />
                  <Metric
                    icon={Briefcase}
                    label="Experience"
                    value={candidate.experience}
                  />
                  <Metric
                    icon={GraduationCap}
                    label="Education"
                    value={candidate.education}
                  />
                  <Metric
                    icon={FileText}
                    label="Resume"
                    value={candidate.fileName}
                  />
                </div>
              </section>

              <section className="space-y-2">
                <h3 className="text-xs font-semibold text-foreground">
                  Top Skills
                </h3>
                <div className="flex flex-wrap gap-1.5">
                  {candidate.topSkills.map((skill) => {
                    const Icon = getSkillIcon(skill);
                    return (
                      <Badge
                        key={skill}
                        variant="outline"
                        className="h-6 gap-1 text-[11px]"
                      >
                        {Icon && <Icon className="size-3" />}
                        {skill}
                      </Badge>
                    );
                  })}
                </div>
              </section>

              <section className="space-y-2">
                <h3 className="text-xs font-semibold text-foreground">Flags</h3>
                <div className="space-y-1.5">
                  {flags.map((flag) => (
                    <div
                      key={`${flag.type}-${flag.label}`}
                      className="rounded-md border border-border/60 px-3 py-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium text-foreground">
                          {flag.label}
                        </span>
                        <Badge variant="secondary" className="text-[9px]">
                          {flag.type}
                        </Badge>
                      </div>
                      {flag.detail && (
                        <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                          {flag.detail}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </section>

              <section className="space-y-2">
                <h3 className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                  <History className="size-3.5" />
                  Assessment History
                </h3>
                {isLoadingAssessmentHistory ? (
                  <output
                    aria-label="Loading assessment history"
                    className="block space-y-2"
                  >
                    {[0, 1].map((item) => (
                      <div
                        className="h-16 animate-pulse rounded-md bg-muted"
                        key={item}
                      />
                    ))}
                  </output>
                ) : assessmentHistory.length > 0 ? (
                  <div className="divide-y divide-border/60 rounded-md border border-border/60">
                    {assessmentHistory.map((assessment) => (
                      <AssessmentHistoryRow
                        assessment={assessment}
                        key={assessment.runId}
                        onOpen={
                          assessment.pipelineAvailable
                            ? () =>
                                onViewPipeline(candidate.id, assessment.runId)
                            : undefined
                        }
                      />
                    ))}
                  </div>
                ) : (
                  <p className="rounded-md border border-dashed border-border/60 px-3 py-4 text-center text-xs text-muted-foreground">
                    No review attempts yet.
                  </p>
                )}
              </section>
            </div>

            <div className="flex items-center gap-2 border-t border-border/50 p-4">
              <Button
                className="flex-1"
                size="sm"
                onClick={() => onViewPipeline(candidate.id)}
              >
                <Sparkles className="size-3.5" />
                Pipeline
              </Button>
              <Button
                className="flex-1"
                size="sm"
                variant="outline"
                onClick={() => onAskCandidate(candidate.id)}
              >
                <MessageSquare className="size-3.5" />
                Ask
              </Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function AssessmentHistoryRow({
  assessment,
  onOpen,
}: {
  assessment: AssessmentHistoryItem;
  onOpen?: () => void;
}) {
  const StatusIcon =
    assessment.status === "completed"
      ? CircleCheck
      : assessment.status === "failed" || assessment.status === "interrupted"
        ? CircleAlert
        : Clock3;

  return (
    <button
      aria-label={
        onOpen
          ? `View attempt ${assessment.attempt} pipeline`
          : "Legacy assessment pipeline unavailable"
      }
      className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors enabled:hover:bg-muted/50 enabled:focus-visible:outline-none enabled:focus-visible:ring-2 enabled:focus-visible:ring-ring disabled:cursor-default"
      disabled={!onOpen}
      onClick={onOpen}
      type="button"
    >
      <StatusIcon className="size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-medium text-foreground">
            {assessment.origin === "legacy_result"
              ? "Legacy assessment"
              : `Attempt ${assessment.attempt}`}
          </span>
          {assessment.isCurrent && (
            <Badge className="h-4 px-1.5 text-[9px]" variant="secondary">
              Current
            </Badge>
          )}
          <Badge className="h-4 px-1.5 text-[9px]" variant="outline">
            {formatAssessmentStatus(assessment.status)}
          </Badge>
        </span>
        <span className="mt-1 block truncate text-[10px] text-muted-foreground">
          {formatAssessmentMeta(assessment)}
        </span>
      </span>
      {assessment.score !== null && (
        <span className="text-xs font-semibold tabular-nums text-foreground">
          {assessment.score}
        </span>
      )}
      {onOpen && (
        <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
      )}
    </button>
  );
}

function formatAssessmentStatus(status: AssessmentHistoryItem["status"]) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function formatAssessmentMeta(assessment: AssessmentHistoryItem) {
  const timestamp = assessment.completedAt ?? assessment.startedAt;
  const date = timestamp
    ? new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(timestamp))
    : "Date unavailable";
  const detail =
    assessment.status === "failed"
      ? (assessment.failureCategory ?? "workflow failure")
      : (assessment.version?.model ?? assessment.status);

  return `${date} - ${detail}`;
}

interface MetricProps {
  icon: React.ElementType;
  label: string;
  value: string;
}

function Metric({ icon: Icon, label, value }: MetricProps) {
  return (
    <div className="min-w-0 rounded-md border border-border/60 px-3 py-2">
      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <Icon className="size-3" />
        {label}
      </div>
      <p className="mt-1 truncate text-xs font-medium text-foreground">
        {value}
      </p>
    </div>
  );
}
