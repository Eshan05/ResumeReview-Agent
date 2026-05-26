"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { WorkflowStep, type StepStatus } from "./workflow-step"
import { Badge } from "@/components/ui/badge"
import { Clock, FileText, Loader2 } from "lucide-react"

export interface WorkflowPhase {
  id: string
  title: string
  description?: string
  status: StepStatus
  category: string
  categoryColor?: string
  duration?: string
  details?: string[]
  files?: Array<{ name: string; type: "pdf" | "xlsx" | "docx" | "txt" | "other" }>
}

export interface WorkflowViewProps {
  resumeName: string
  phases: WorkflowPhase[]
  overallStatus: "idle" | "processing" | "completed" | "error"
  elapsed?: string
  className?: string
}

const statusLabels: Record<string, string> = {
  idle: "Ready",
  processing: "Processing...",
  completed: "Completed",
  error: "Failed",
}

const statusBadgeClasses: Record<string, string> = {
  idle: "bg-muted text-muted-foreground border-border",
  processing: "bg-blue-50 text-blue-700 border-blue-200",
  completed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  error: "bg-red-50 text-red-700 border-red-200",
}

export function WorkflowView({
  resumeName,
  phases,
  overallStatus,
  elapsed,
  className,
}: WorkflowViewProps) {
  return (
    <div className={cn("w-full", className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            {overallStatus === "processing" ? (
              <Loader2 className="size-4 text-blue-500 animate-spin" />
            ) : overallStatus === "completed" ? (
              <div className="size-2 rounded-full bg-emerald-500" />
            ) : overallStatus === "error" ? (
              <div className="size-2 rounded-full bg-red-500" />
            ) : (
              <div className="size-2 rounded-full bg-muted-foreground/30" />
            )}
            <h3 className="text-sm font-medium text-foreground">
              {resumeName}
            </h3>
          </div>
          <Badge
            variant="outline"
            className={cn("text-[10px] font-medium", statusBadgeClasses[overallStatus])}
          >
            {statusLabels[overallStatus]}
          </Badge>
        </div>
        {elapsed && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="size-3" />
            <span className="tabular-nums">{elapsed}</span>
          </div>
        )}
      </div>

      {/* Phases */}
      <div className="px-4">
        {phases.map((phase) => (
          <WorkflowStep
            key={phase.id}
            title={phase.title}
            description={phase.description}
            status={phase.status}
            category={phase.category}
            categoryColor={phase.categoryColor}
            duration={phase.duration}
            files={phase.files}
          >
            {phase.details && (
              <ul className="space-y-1">
                {phase.details.map((detail, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-muted-foreground/50 mt-0.5">•</span>
                    <span>{detail}</span>
                  </li>
                ))}
              </ul>
            )}
          </WorkflowStep>
        ))}
      </div>
    </div>
  )
}
