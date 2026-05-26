"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { CheckCircle2, Circle, Loader2, AlertCircle, ChevronDown, ChevronUp } from "lucide-react"

export type StepStatus = "completed" | "running" | "pending" | "error"

export interface WorkflowStepProps {
  title: string
  description?: string
  status: StepStatus
  category?: string
  categoryColor?: string
  duration?: string
  files?: Array<{ name: string; type: "pdf" | "xlsx" | "docx" | "txt" | "other" }>
  children?: React.ReactNode
  className?: string
}

const statusConfig: Record<StepStatus, { icon: React.ElementType; color: string; badgeClass: string }> = {
  completed: {
    icon: CheckCircle2,
    color: "text-emerald-500",
    badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  running: {
    icon: Loader2,
    color: "text-blue-500",
    badgeClass: "bg-blue-50 text-blue-700 border-blue-200",
  },
  pending: {
    icon: Circle,
    color: "text-muted-foreground/40",
    badgeClass: "bg-muted text-muted-foreground border-border",
  },
  error: {
    icon: AlertCircle,
    color: "text-red-500",
    badgeClass: "bg-red-50 text-red-700 border-red-200",
  },
}

const fileTypeIcons: Record<string, string> = {
  pdf: "📄",
  xlsx: "📊",
  docx: "📝",
  txt: "📃",
  other: "📎",
}

export function WorkflowStep({
  title,
  description,
  status,
  category,
  categoryColor = "bg-blue-100 text-blue-700",
  duration,
  files,
  children,
  className,
}: WorkflowStepProps) {
  const [isExpanded, setIsExpanded] = React.useState(false)
  const { icon: StatusIcon, color } = statusConfig[status]

  return (
    <div
      className={cn(
        "relative border-b border-border/50 last:border-b-0",
        className
      )}
    >
      {/* Connector line */}
      <div className="absolute left-[15px] top-[40px] bottom-0 w-px bg-border/50" />

      <div className="flex items-start gap-3 py-4">
        {/* Status icon */}
        <div className={cn("relative z-10 mt-0.5 flex-shrink-0", color)}>
          <StatusIcon
            className={cn("size-[18px]", status === "running" && "animate-spin")}
          />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-medium text-foreground">{title}</h4>
              {category && (
                <Badge
                  variant="outline"
                  className={cn("text-[10px] font-medium px-1.5 py-0 h-4", categoryColor)}
                >
                  {category}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              {duration && (
                <span className="text-xs text-muted-foreground tabular-nums">{duration}</span>
              )}
              {children && (
                <button
                  onClick={() => setIsExpanded(!isExpanded)}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  {isExpanded ? (
                    <ChevronUp className="size-4" />
                  ) : (
                    <ChevronDown className="size-4" />
                  )}
                </button>
              )}
            </div>
          </div>

          {description && (
            <p className="text-sm text-muted-foreground mt-1">{description}</p>
          )}

          {/* Files */}
          {files && files.length > 0 && (
            <div className="mt-2 space-y-1">
              <p className="text-xs text-muted-foreground">Files</p>
              <div className="flex flex-wrap gap-2">
                {files.map((file, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-1.5 text-xs bg-muted/50 rounded-md px-2 py-1"
                  >
                    <span>{fileTypeIcons[file.type]}</span>
                    <span className="text-foreground">{file.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Expanded content */}
          {children && isExpanded && (
            <div className="mt-3 pl-1 text-sm text-muted-foreground">
              {children}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
