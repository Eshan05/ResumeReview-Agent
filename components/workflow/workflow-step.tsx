"use client";

import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Circle,
  Loader2,
} from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

export type StepStatus = "completed" | "running" | "pending" | "error";

export interface AgentSubStep {
  id: string;
  name: string;
  provider: string;
  model?: string;
  status: StepStatus;
  summary?: string;
  findings?: string[];
  duration?: string;
  tokensIn?: number;
  tokensOut?: number;
}

export interface WorkflowStepProps {
  title: string;
  description?: string;
  status: StepStatus;
  category?: string;
  categoryColor?: string;
  duration?: string;
  subSteps?: AgentSubStep[];
  files?: Array<{
    name: string;
    type: "pdf" | "xlsx" | "docx" | "txt" | "other";
  }>;
  children?: React.ReactNode;
  className?: string;
}

const statusConfig: Record<
  StepStatus,
  { icon: React.ElementType; color: string }
> = {
  completed: { icon: CheckCircle2, color: "text-emerald-500" },
  running: { icon: Loader2, color: "text-blue-500" },
  pending: { icon: Circle, color: "text-muted-foreground/30" },
  error: { icon: AlertCircle, color: "text-red-500" },
};

const statusLabels: Record<StepStatus, string> = {
  completed: "Completed",
  running: "Running",
  pending: "Pending",
  error: "Failed",
};

const fileTypeConfig: Record<string, { label: string; className: string }> = {
  pdf: { label: "pdf", className: "bg-red-500 text-white" },
  xlsx: { label: "xlsx", className: "bg-emerald-500 text-white" },
  docx: { label: "docx", className: "bg-blue-500 text-white" },
  txt: { label: "txt", className: "bg-muted-foreground/40 text-white" },
  other: { label: "file", className: "bg-muted-foreground/40 text-white" },
};

const providerColor: Record<string, string> = {
  Groq: "bg-purple-500",
  Gemini: "bg-blue-500",
  OpenAI: "bg-emerald-500",
  Anthropic: "bg-orange-500",
  "REST API": "bg-muted-foreground/40",
};

export function WorkflowStep({
  title,
  description,
  status,
  category,
  categoryColor,
  duration,
  subSteps,
  files,
  children,
  className,
}: WorkflowStepProps) {
  const [isExpanded, setIsExpanded] = React.useState(false);
  const { icon: StatusIcon, color } = statusConfig[status];
  const hasContent = (subSteps?.length ?? 0) > 0 || Boolean(children);

  return (
    <div className={cn("group/step", className)}>
      <div className="flex items-start gap-4 py-4 px-5">
        <div className={cn("mt-0.5 shrink-0", color)}>
          <StatusIcon
            className={cn(
              "size-[18px]",
              status === "running" && "animate-spin",
            )}
          />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <h4 className="text-[13px] font-medium text-foreground">
                {title}
              </h4>
              {category && (
                <span
                  className={cn(
                    "text-[10px] font-medium px-2 py-0.5 rounded-full",
                    categoryColor || "bg-muted text-muted-foreground",
                  )}
                >
                  {category}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 shrink-0">
              {duration && (
                <span className="text-xs text-muted-foreground tabular-nums">
                  {duration}
                </span>
              )}
              <span
                className={cn(
                  "text-xs font-medium",
                  status === "completed"
                    ? "text-emerald-600 dark:text-emerald-400"
                    : status === "running"
                      ? "text-blue-600 dark:text-blue-400"
                      : status === "error"
                        ? "text-red-600 dark:text-red-400"
                        : "text-muted-foreground",
                )}
              >
                {statusLabels[status]}
              </span>
              {hasContent && (
                <button
                  aria-expanded={isExpanded}
                  aria-label={`${isExpanded ? "Collapse" : "Expand"} ${title} details`}
                  type="button"
                  onClick={() => setIsExpanded(!isExpanded)}
                  className="text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                >
                  {isExpanded ? (
                    <ChevronUp aria-hidden="true" className="size-4" />
                  ) : (
                    <ChevronDown aria-hidden="true" className="size-4" />
                  )}
                </button>
              )}
            </div>
          </div>

          {description && (
            <p className="text-[13px] text-muted-foreground mt-1">
              {description}
            </p>
          )}

          {/* Files */}
          {files && files.length > 0 && (
            <div className="mt-2.5 flex flex-wrap gap-2">
              {files.map((file) => {
                const config =
                  fileTypeConfig[file.type] || fileTypeConfig.other;
                return (
                  <div
                    key={`${file.type}-${file.name}`}
                    className="flex items-center gap-1.5"
                  >
                    <div
                      className={cn(
                        "w-5 h-4 rounded-sm flex items-center justify-center text-[8px] font-bold uppercase",
                        config.className,
                      )}
                    >
                      {config.label}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {file.name}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Expanded: sub-steps + children */}
          {hasContent && isExpanded && (
            <div className="mt-4 pt-4 border-t border-border/40">
              {/* Sub-steps (agent calls) */}
              {subSteps && subSteps.length > 0 && (
                <div className="space-y-0">
                  {subSteps.map((sub, i) => {
                    const subConfig = statusConfig[sub.status];
                    const SubIcon = subConfig.icon;
                    const isLast = i === subSteps.length - 1;
                    return (
                      <div
                        key={sub.id}
                        className="relative flex items-start gap-3 py-2.5"
                      >
                        {/* Connector line */}
                        {!isLast && (
                          <div className="absolute left-[7px] top-[22px] bottom-0 w-px bg-border/30" />
                        )}
                        <div
                          className={cn(
                            "relative z-10 mt-0.5 shrink-0",
                            subConfig.color,
                          )}
                        >
                          <SubIcon
                            className={cn(
                              "size-[14px]",
                              sub.status === "running" && "animate-spin",
                            )}
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-xs font-medium text-foreground">
                                {sub.name}
                              </span>
                              <div className="flex items-center gap-1.5">
                                <div
                                  className={cn(
                                    "size-2.5 rounded-sm",
                                    providerColor[sub.provider] ||
                                      "bg-muted-foreground/40",
                                  )}
                                />
                                <span className="text-[11px] text-muted-foreground">
                                  {sub.provider}
                                </span>
                                {sub.model && (
                                  <span className="text-[11px] text-muted-foreground">
                                    • {sub.model}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2.5 shrink-0">
                              {sub.tokensIn !== undefined && (
                                <span className="text-[10px] text-muted-foreground tabular-nums">
                                  {sub.tokensIn.toLocaleString()} in
                                </span>
                              )}
                              {sub.tokensOut !== undefined && (
                                <span className="text-[10px] text-muted-foreground tabular-nums">
                                  {sub.tokensOut.toLocaleString()} out
                                </span>
                              )}
                              {sub.duration && (
                                <span className="text-[11px] text-muted-foreground tabular-nums">
                                  {sub.duration}
                                </span>
                              )}
                            </div>
                          </div>
                          {sub.summary && (
                            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                              {sub.summary}
                            </p>
                          )}
                          {sub.findings && sub.findings.length > 0 && (
                            <ul className="mt-1.5 space-y-1 text-[11px] leading-relaxed text-muted-foreground">
                              {sub.findings.slice(0, 5).map((finding) => (
                                <li key={finding} className="flex gap-1.5">
                                  <span className="mt-1 size-1 rounded-full bg-muted-foreground/50" />
                                  <span>{finding}</span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Custom children content */}
              {children && (
                <div
                  className={
                    subSteps && subSteps.length > 0
                      ? "mt-4 pt-4 border-t border-border/40"
                      : ""
                  }
                >
                  {children}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
