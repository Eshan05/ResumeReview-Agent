"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { WorkflowStep, type StepStatus, type AgentSubStep } from "./workflow-step"
import { Clock, Loader2 } from "lucide-react"

export interface WorkflowPhase {
  id: string
  title: string
  description?: string
  status: StepStatus
  category: string
  categoryColor?: string
  duration?: string
  details?: React.ReactNode
  subSteps?: AgentSubStep[]
  files?: Array<{ name: string; type: "pdf" | "xlsx" | "docx" | "txt" | "other" }>
  parallelGroup?: number
}

export interface WorkflowViewProps {
  resumeName: string
  phases: WorkflowPhase[]
  overallStatus: "idle" | "processing" | "completed" | "error"
  elapsed?: string
  className?: string
}

const statusConfig: Record<string, { label: string; dotClass: string }> = {
  idle: { label: "Ready", dotClass: "bg-muted-foreground/30" },
  processing: { label: "Processing", dotClass: "bg-blue-500" },
  completed: { label: "Completed", dotClass: "bg-emerald-500" },
  error: { label: "Failed", dotClass: "bg-red-500" },
}

export function WorkflowView({
  resumeName,
  phases,
  overallStatus,
  elapsed,
  className,
}: WorkflowViewProps) {
  const config = statusConfig[overallStatus]

  // Group phases by parallelGroup to show parallel execution
  const groupedPhases = React.useMemo(() => {
    const groups: Array<{ phases: WorkflowPhase[]; isParallel: boolean }> = []
    let currentGroup: WorkflowPhase[] = []
    let currentParallelGroup: number | undefined = undefined

    phases.forEach((phase) => {
      if (phase.parallelGroup !== undefined && phase.parallelGroup === currentParallelGroup) {
        currentGroup.push(phase)
      } else {
        if (currentGroup.length > 0) {
          groups.push({ phases: currentGroup, isParallel: currentGroup.length > 1 })
        }
        currentGroup = [phase]
        currentParallelGroup = phase.parallelGroup
      }
    })
    if (currentGroup.length > 0) {
      groups.push({ phases: currentGroup, isParallel: currentGroup.length > 1 })
    }
    return groups
  }, [phases])

  return (
    <div className={cn("bg-card rounded-xl border border-border/60 overflow-hidden", className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border/40">
        <div className="flex items-center gap-3">
          {overallStatus === "processing" ? (
            <Loader2 className="size-4 text-blue-500 animate-spin" />
          ) : (
            <div className={cn("size-2 rounded-full", config.dotClass)} />
          )}
          <h3 className="text-[13px] font-medium text-foreground">
            {overallStatus === "processing" ? (
              <>Executing Workflow — <span className="text-muted-foreground">{resumeName}</span></>
            ) : (
              <>{resumeName}</>
            )}
          </h3>
        </div>
        <div className="flex items-center gap-4">
          <span className={cn("text-xs font-medium",
            overallStatus === "processing" ? "text-blue-600 dark:text-blue-400" :
            overallStatus === "completed" ? "text-emerald-600 dark:text-emerald-400" :
            "text-muted-foreground"
          )}>
            {config.label}
          </span>
          {elapsed && (
            <span className="text-xs text-muted-foreground tabular-nums flex items-center gap-1">
              <Clock className="size-3" />
              {elapsed}
            </span>
          )}
        </div>
      </div>

      {/* Phases */}
      <div className="divide-y divide-border/40">
        {groupedPhases.map((group, gi) => {
          if (group.isParallel) {
            return (
              <div key={gi} className="px-5 py-3">
                <div className="flex items-center gap-2 mb-2">
                  <div className="h-px flex-1 bg-border/30" />
                  <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Parallel</span>
                  <div className="h-px flex-1 bg-border/30" />
                </div>
                <div className="space-y-0 divide-y divide-border/30">
                  {group.phases.map((phase) => (
                    <WorkflowStep
                      key={phase.id}
                      title={phase.title}
                      description={phase.description}
                      status={phase.status}
                      category={phase.category}
                      categoryColor={phase.categoryColor}
                      duration={phase.duration}
                      subSteps={phase.subSteps}
                      files={phase.files}
                    >
                      {phase.details}
                    </WorkflowStep>
                  ))}
                </div>
              </div>
            )
          }

          return group.phases.map((phase) => (
            <WorkflowStep
              key={phase.id}
              title={phase.title}
              description={phase.description}
              status={phase.status}
              category={phase.category}
              categoryColor={phase.categoryColor}
              duration={phase.duration}
              subSteps={phase.subSteps}
              files={phase.files}
            >
              {phase.details}
            </WorkflowStep>
          ))
        })}
      </div>
    </div>
  )
}
