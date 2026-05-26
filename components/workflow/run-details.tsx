"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  CheckCircle2,
  Circle,
  Loader2,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  X,
  Bot,
  Zap,
} from "lucide-react"

export interface AgentStep {
  id: string
  action: string
  provider: string
  model?: string
  status: "completed" | "running" | "pending" | "error"
  duration?: string
  tokensIn?: number
  tokensOut?: number
  details?: string[]
  timestamp?: string
}

export interface RunDetailsProps {
  runId: string
  status: "running" | "completed" | "error"
  steps: AgentStep[]
  totalDuration?: string
  totalTokensIn?: number
  totalTokensOut?: number
  onClose?: () => void
  className?: string
}

const stepStatusConfig = {
  completed: { icon: CheckCircle2, color: "text-emerald-500" },
  running: { icon: Loader2, color: "text-blue-500" },
  pending: { icon: Circle, color: "text-muted-foreground/40" },
  error: { icon: AlertCircle, color: "text-red-500" },
}

function AgentStepItem({ step }: { step: AgentStep }) {
  const [isExpanded, setIsExpanded] = React.useState(false)
  const { icon: StatusIcon, color } = stepStatusConfig[step.status]

  return (
    <div className="relative">
      {/* Connector line */}
      <div className="absolute left-[11px] top-[28px] bottom-0 w-px bg-border/50" />

      <div className="flex items-start gap-3 py-3">
        {/* Status icon */}
        <div className={cn("relative z-10 mt-0.5 flex-shrink-0", color)}>
          <StatusIcon
            className={cn("size-[16px]", step.status === "running" && "animate-spin")}
          />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-foreground">
                {step.action}
              </span>
              <Badge
                variant="outline"
                className="text-[10px] font-medium px-1.5 py-0 h-4 bg-muted text-muted-foreground"
              >
                {step.provider}
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              {step.duration && (
                <span className="text-xs text-muted-foreground tabular-nums">
                  {step.duration}
                </span>
              )}
              {step.details && step.details.length > 0 && (
                <button
                  onClick={() => setIsExpanded(!isExpanded)}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  {isExpanded ? (
                    <ChevronUp className="size-3.5" />
                  ) : (
                    <ChevronDown className="size-3.5" />
                  )}
                </button>
              )}
            </div>
          </div>

          {/* Model and tokens */}
          <div className="flex items-center gap-3 mt-1">
            {step.model && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Bot className="size-3" />
                <span>{step.model}</span>
              </div>
            )}
            {step.tokensIn !== undefined && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Zap className="size-3" />
                <span className="tabular-nums">{step.tokensIn.toLocaleString()}</span>
                <span>in</span>
              </div>
            )}
            {step.tokensOut !== undefined && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <span className="tabular-nums">{step.tokensOut.toLocaleString()}</span>
                <span>out</span>
              </div>
            )}
          </div>

          {/* Expanded details */}
          {step.details && isExpanded && (
            <div className="mt-2 pl-1 text-xs text-muted-foreground space-y-1">
              {step.details.map((detail, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="text-muted-foreground/50">•</span>
                  <span>{detail}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export function RunDetails({
  runId,
  status,
  steps,
  totalDuration,
  totalTokensIn,
  totalTokensOut,
  onClose,
  className,
}: RunDetailsProps) {
  return (
    <div className={cn("flex flex-col h-full", className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium text-foreground">Run Details</h3>
          <Badge
            variant="outline"
            className={cn(
              "text-[10px] font-medium",
              status === "completed"
                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                : status === "error"
                  ? "bg-red-50 text-red-700 border-red-200"
                  : "bg-blue-50 text-blue-700 border-blue-200"
            )}
          >
            {status === "completed" ? "Success" : status === "error" ? "Failed" : "Running"}
          </Badge>
        </div>
        {onClose && (
          <Button variant="ghost" size="icon-sm" onClick={onClose}>
            <X className="size-4" />
          </Button>
        )}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="workflow" className="flex-1 flex flex-col">
        <div className="px-4 border-b border-border/50">
          <TabsList className="h-9 bg-transparent p-0 gap-0">
            <TabsTrigger
              value="general"
              className="text-xs rounded-none border-b-2 border-transparent data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none px-3 h-9"
            >
              General
            </TabsTrigger>
            <TabsTrigger
              value="workflow"
              className="text-xs rounded-none border-b-2 border-transparent data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none px-3 h-9"
            >
              Workflow
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="general" className="flex-1 overflow-auto p-4 mt-0">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Run ID</p>
                <p className="text-xs font-mono text-foreground">{runId}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Total Duration</p>
                <p className="text-xs text-foreground tabular-nums">{totalDuration || "—"}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Tokens In</p>
                <p className="text-xs text-foreground tabular-nums">{totalTokensIn?.toLocaleString() || "—"}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Tokens Out</p>
                <p className="text-xs text-foreground tabular-nums">{totalTokensOut?.toLocaleString() || "—"}</p>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="workflow" className="flex-1 overflow-auto mt-0">
          <div className="px-4">
            {steps.map((step) => (
              <AgentStepItem key={step.id} step={step} />
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
