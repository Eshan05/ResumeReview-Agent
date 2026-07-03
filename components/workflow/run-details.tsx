"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
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
  details?: Array<{ label: string; value: string }>
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

const stepStatusConfig: Record<string, { icon: React.ElementType; color: string }> = {
  completed: { icon: CheckCircle2, color: "text-emerald-500" },
  running: { icon: Loader2, color: "text-blue-500" },
  pending: { icon: Circle, color: "text-muted-foreground/30" },
  error: { icon: AlertCircle, color: "text-red-500" },
}

const providerColors: Record<string, string> = {
  Anthropic: "bg-orange-500",
  OpenAI: "bg-emerald-600",
  Google: "bg-blue-500",
  Groq: "bg-purple-600",
  Gemini: "bg-blue-500",
  "REST API": "bg-muted-foreground/40",
}

function AgentStepItem({ step, index, total }: { step: AgentStep; index: number; total: number }) {
  const [isExpanded, setIsExpanded] = React.useState(false)
  const { icon: StatusIcon, color } = stepStatusConfig[step.status]
  const hasDetails = step.details && step.details.length > 0
  const isLast = index === total - 1

  return (
    <div className="relative">
      {!isLast && (
        <div className="absolute left-[9px] top-[28px] bottom-0 w-px bg-border/40" />
      )}

      <div className="flex items-start gap-3 py-3.5 px-5">
        <div className={cn("mt-0.5 shrink-0", color)}>
          <StatusIcon className={cn("size-[16px]", step.status === "running" && "animate-spin")} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[13px] font-medium text-foreground">{step.action}</span>
            <div className="flex items-center gap-2.5 shrink-0">
              {step.duration && (
                <span className="text-xs text-muted-foreground tabular-nums">{step.duration}</span>
              )}
              {hasDetails && (
                <button
                  onClick={() => setIsExpanded(!isExpanded)}
                  className="text-muted-foreground/40 hover:text-muted-foreground transition-colors"
                >
                  {isExpanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
                </button>
              )}
            </div>
          </div>

          {/* Model + tokens */}
          {(step.model || step.tokensIn !== undefined) && (
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              {step.model && (
                <div className="flex items-center gap-1.5">
                  <div className={cn("size-4 rounded-sm", providerColors[step.provider] || "bg-muted-foreground/40")} />
                  <span className="text-xs text-muted-foreground">{step.model}</span>
                </div>
              )}
              {step.tokensIn !== undefined && (
                <span className="text-[11px] text-muted-foreground tabular-nums">
                  {step.tokensIn.toLocaleString()} in
                </span>
              )}
              {step.tokensOut !== undefined && (
                <span className="text-[11px] text-muted-foreground tabular-nums">
                  {step.tokensOut.toLocaleString()} out
                </span>
              )}
            </div>
          )}

          {/* Expanded details */}
          {hasDetails && isExpanded && (
            <div className="mt-3 space-y-1.5">
              {step.details!.map((detail, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground">{detail.label}</span>
                  <code className="font-mono text-foreground bg-muted/60 px-1.5 py-0.5 rounded text-[11px]">
                    {detail.value}
                  </code>
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
    <div className={cn("flex flex-col h-full bg-card rounded-xl border border-border/60 overflow-hidden", className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border/40">
        <div className="flex items-center gap-3">
          <h3 className="text-[13px] font-medium text-foreground">Run Details</h3>
          <span className={cn(
            "text-xs font-medium",
            status === "completed" ? "text-emerald-600 dark:text-emerald-400" :
            status === "error" ? "text-red-600 dark:text-red-400" :
            "text-blue-600 dark:text-blue-400"
          )}>
            {status === "completed" ? "Success" : status === "error" ? "Failed" : "Running"}
          </span>
        </div>
        {onClose && (
          <Button variant="ghost" size="icon-sm" onClick={onClose}>
            <X className="size-4" />
          </Button>
        )}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="workflow" className="flex-1 flex flex-col">
        <div className="px-5 border-b border-border/40">
          <TabsList className="h-9 bg-transparent p-0 gap-0">
            <TabsTrigger
              value="general"
              className="text-xs rounded-none border-b-2 border-transparent data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none px-3 h-9 font-medium text-muted-foreground data-[state=active]:text-foreground"
            >
              General
            </TabsTrigger>
            <TabsTrigger
              value="workflow"
              className="text-xs rounded-none border-b-2 border-transparent data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none px-3 h-9 font-medium text-muted-foreground data-[state=active]:text-foreground"
            >
              Workflow
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="general" className="flex-1 overflow-auto p-6 mt-0">
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-5">
              <div>
                <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">Run ID</p>
                <p className="text-xs font-mono text-foreground">{runId}</p>
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">Duration</p>
                <p className="text-xs text-foreground tabular-nums">{totalDuration || "—"}</p>
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">Tokens In</p>
                <p className="text-xs text-foreground tabular-nums">{totalTokensIn?.toLocaleString() || "—"}</p>
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1">Tokens Out</p>
                <p className="text-xs text-foreground tabular-nums">{totalTokensOut?.toLocaleString() || "—"}</p>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="workflow" className="flex-1 overflow-auto mt-0">
          <div className="divide-y divide-border/40">
            {steps.map((step, i) => (
              <AgentStepItem key={step.id} step={step} index={i} total={steps.length} />
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
