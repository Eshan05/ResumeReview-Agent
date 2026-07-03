"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { CheckCircle2, Circle, Loader2, AlertCircle, ChevronRight } from "lucide-react"

type StepStatus = "pending" | "running" | "completed" | "error"

interface MiniWorkflowProps {
  candidateName: string
  fileName: string
  phases: Array<{ id: string; title: string; status: StepStatus }>
  elapsed?: string
  onClick?: () => void
  className?: string
}

const statusConfig: Record<StepStatus, { icon: React.ElementType; color: string; bg: string }> = {
  completed: { icon: CheckCircle2, color: "text-emerald-500", bg: "bg-emerald-500" },
  running: { icon: Loader2, color: "text-blue-500", bg: "bg-blue-500" },
  pending: { icon: Circle, color: "text-muted-foreground/30", bg: "bg-muted-foreground/20" },
  error: { icon: AlertCircle, color: "text-red-500", bg: "bg-red-500" },
}

function getOverallStatus(phases: Array<{ status: StepStatus }>): { label: string; color: string; dotColor: string } {
  if (phases.some(p => p.status === "running")) return { label: "Processing", color: "text-blue-600 dark:text-blue-400", dotColor: "bg-blue-500" }
  if (phases.every(p => p.status === "completed")) return { label: "Completed", color: "text-emerald-600 dark:text-emerald-400", dotColor: "bg-emerald-500" }
  if (phases.some(p => p.status === "error")) return { label: "Failed", color: "text-red-600 dark:text-red-400", dotColor: "bg-red-500" }
  return { label: "Pending", color: "text-muted-foreground", dotColor: "bg-muted-foreground/30" }
}

export function MiniWorkflow({ candidateName, fileName, phases, elapsed, onClick, className }: MiniWorkflowProps) {
  const completedCount = phases.filter(p => p.status === "completed").length
  const progress = (completedCount / phases.length) * 100
  const runningPhase = phases.find(p => p.status === "running")
  const overall = getOverallStatus(phases)
  const initials = candidateName.split(" ").map(n => n[0]).join("")

  return (
    <div
      className={cn(
        "group/card bg-card rounded-xl border border-border/60 overflow-hidden transition-all duration-200",
        onClick && "cursor-pointer hover:border-border hover:shadow-sm",
        className
      )}
      onClick={onClick}
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-3.5 pt-3.5 pb-2.5">
        <div className="size-8 rounded-full bg-muted flex items-center justify-center text-[11px] font-semibold text-foreground shrink-0">
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[13px] font-medium text-foreground truncate">{candidateName}</p>
            {elapsed && (
              <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">{elapsed}</span>
            )}
          </div>
          <div className="flex items-center justify-between gap-2 mt-0.5">
            <p className="text-[10px] text-muted-foreground truncate">{fileName}</p>
            <div className="flex items-center gap-1 shrink-0">
              <div className={cn("size-1.5 rounded-full", overall.dotColor, runningPhase && "animate-pulse")} />
              <span className={cn("text-[10px] font-medium", overall.color)}>{overall.label}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="px-3.5 pb-2.5">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] text-muted-foreground">{completedCount}/{phases.length} phases</span>
          <span className="text-[10px] text-muted-foreground tabular-nums">{Math.round(progress)}%</span>
        </div>
        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-500 ease-out",
              progress === 100 ? "bg-emerald-500" : runningPhase ? "bg-blue-500" : "bg-muted-foreground/20"
            )}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Phase list */}
      <div className="px-3.5 pb-3">
        <div className="space-y-0">
          {phases.map((phase, i) => {
            const { icon: Icon, color, bg } = statusConfig[phase.status]
            const isRunning = phase.status === "running"
            const isLast = i === phases.length - 1
            return (
              <div key={phase.id} className="relative flex items-center gap-2 py-[3px]">
                {/* Status dot with connector */}
                <div className="relative flex flex-col items-center shrink-0">
                  <div className={cn(
                    "size-[14px] rounded-full flex items-center justify-center z-10",
                    phase.status === "completed" && "bg-emerald-100 dark:bg-emerald-500/20",
                    phase.status === "running" && "bg-blue-100 dark:bg-blue-500/20",
                    phase.status === "error" && "bg-red-100 dark:bg-red-500/20",
                    phase.status === "pending" && "bg-muted/50",
                  )}>
                    <Icon className={cn("size-[10px]", color, isRunning && "animate-spin")} />
                  </div>
                  {!isLast && (
                    <div className={cn(
                      "w-px h-2.5",
                      phase.status === "completed" ? "bg-emerald-200 dark:bg-emerald-500/30" : "bg-border/50"
                    )} />
                  )}
                </div>
                {/* Label */}
                <span className={cn(
                  "text-[11px] truncate",
                  phase.status === "completed" && "text-muted-foreground",
                  phase.status === "running" && "text-foreground font-medium",
                  phase.status === "error" && "text-red-600 dark:text-red-400",
                  phase.status === "pending" && "text-muted-foreground/50",
                )}>
                  {phase.title}
                </span>
                {/* Running shimmer */}
                {isRunning && (
                  <div className="absolute inset-0 -mx-3.5 bg-blue-500/5 rounded-sm pointer-events-none" />
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Click indicator */}
      {onClick && (
        <div className="px-3.5 pb-3">
          <div className="flex items-center justify-center gap-1 text-[10px] text-muted-foreground/50 group-hover/card:text-muted-foreground transition-colors">
            <span>View pipeline</span>
            <ChevronRight className="size-3" />
          </div>
        </div>
      )}
    </div>
  )
}
