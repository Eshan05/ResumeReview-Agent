"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import {
  CheckCircle2,
  Circle,
  Loader2,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Bot,
  Globe,
  Sparkles,
  FileText,
  User,
  GraduationCap,
  Database,
  Search,
  Shield,
  GitBranch,
  BarChart3,
  Trophy,
} from "lucide-react"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { JSXPreview, JSXPreviewContent, JSXPreviewError } from "@/components/ai-elements/jsx-preview"
import { Badge } from "@/components/ui/badge"
import {
  Timeline,
  TimelineContent,
  TimelineHeader,
  TimelineIndicator,
  TimelineItem,
  TimelineSeparator,
  TimelineTitle,
} from "@/components/ui/timeline"

type StepStatus = "pending" | "running" | "completed" | "error"

export interface SubAgentResult {
  name: string
  provider: string
  model?: string
  status: StepStatus
  duration?: string
  summary?: string
  jsxContent?: string
  findings?: string[]
  tokensIn?: number
  tokensOut?: number
}

export interface PipelinePhase {
  id: string
  title: string
  action: string
  status: StepStatus
  timestamp?: string
  duration?: string
  subAgents?: SubAgentResult[]
  streamingJsx?: string
}

// ── Streaming text ───────────────────────────────────────────────────────────

function StreamingText({ text, isActive }: { text: string; isActive: boolean }) {
  const [displayed, setDisplayed] = React.useState("")
  const indexRef = React.useRef(0)

  React.useEffect(() => {
    if (!isActive || !text) { setDisplayed(text); return }
    setDisplayed("")
    indexRef.current = 0
    const interval = setInterval(() => {
      if (indexRef.current < text.length) {
        setDisplayed(text.slice(0, indexRef.current + 1))
        indexRef.current++
      } else { clearInterval(interval) }
    }, 15)
    return () => clearInterval(interval)
  }, [text, isActive])

  return (
    <span>
      {displayed}
      {isActive && displayed.length < text.length && (
        <span className="inline-block w-0.5 h-3 bg-foreground/70 ml-0.5 animate-pulse" />
      )}
    </span>
  )
}

// ── Streaming JSX renderer ───────────────────────────────────────────────────

function StreamingJsx({ jsx, isStreaming }: { jsx: string; isStreaming: boolean }) {
  const [displayed, setDisplayed] = React.useState("")
  const indexRef = React.useRef(0)

  React.useEffect(() => {
    if (!isStreaming || !jsx) { setDisplayed(jsx); return }
    setDisplayed("")
    indexRef.current = 0
    const interval = setInterval(() => {
      if (indexRef.current < jsx.length) {
        setDisplayed(jsx.slice(0, indexRef.current + 1))
        indexRef.current++
      } else { clearInterval(interval) }
    }, 20)
    return () => clearInterval(interval)
  }, [jsx, isStreaming])

  if (!displayed) return null

  return (
    <JSXPreview jsx={displayed} isStreaming={isStreaming} className="text-[11px]">
      <JSXPreviewContent className="text-[11px] [&_*]:text-[11px]" />
      <JSXPreviewError />
    </JSXPreview>
  )
}

// ── Config ───────────────────────────────────────────────────────────────────

const statusConfig: Record<StepStatus, { icon: React.ElementType; color: string; label: string }> = {
  completed: { icon: CheckCircle2, color: "text-emerald-500", label: "Done" },
  running: { icon: Loader2, color: "text-blue-500", label: "Running" },
  pending: { icon: Circle, color: "text-muted-foreground/30", label: "" },
  error: { icon: AlertCircle, color: "text-red-500", label: "Failed" },
}

const providerColors: Record<string, string> = {
  Groq: "bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-400",
  Gemini: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400",
  OpenAI: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
  Anthropic: "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-400",
  "REST API": "bg-gray-100 text-gray-700 dark:bg-gray-500/15 dark:text-gray-400",
}

const phaseIcons: Record<string, React.ElementType> = {
  "Text received": FileText,
  "Applicant info": User,
  "Education & certs": GraduationCap,
  "Data extraction": Database,
  "Profile crawling": Search,
  "Red flag check": Shield,
  "Skills verification": GitBranch,
  "Project matching": BarChart3,
  "Final score": Trophy,
}

// ── Sub-agent row (compact) ─────────────────────────────────────────────────

function SubAgentRow({ agent, isStreaming }: { agent: SubAgentResult; isStreaming: boolean }) {
  const pc = providerColors[agent.provider] || "bg-muted text-muted-foreground"
  const { icon: Icon, color } = statusConfig[agent.status]
  return (
    <div className="border-t border-border/30 py-2 ps-5 pe-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <Icon className={cn("size-3 shrink-0", color, agent.status === "running" && "animate-spin")} />
          <span className="text-[11px] font-medium text-foreground truncate">{agent.name}</span>
          <Badge variant="outline" className={cn("text-[8px] px-1 py-0 h-3 shrink-0", pc)}>{agent.provider}</Badge>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {agent.tokensIn !== undefined && <span className="text-[9px] text-muted-foreground/60 tabular-nums">{agent.tokensIn.toLocaleString()}</span>}
          {agent.duration && <span className="text-[10px] text-muted-foreground/60 tabular-nums">{agent.duration}</span>}
        </div>
      </div>
      {/* JSX streaming content or plain text */}
      {agent.jsxContent && isStreaming ? (
        <div className="mt-1.5 pl-4">
          <StreamingJsx jsx={agent.jsxContent} isStreaming={isStreaming} />
        </div>
      ) : agent.jsxContent && !isStreaming ? (
        <div className="mt-1.5 pl-4">
          <JSXPreview jsx={agent.jsxContent} className="text-[11px]">
            <JSXPreviewContent className="text-[11px] [&_*]:text-[11px]" />
          </JSXPreview>
        </div>
      ) : agent.summary ? (
        <div className="mt-1 text-[11px] text-muted-foreground leading-snug pl-4">
          {isStreaming ? <StreamingText text={agent.summary} isActive={isStreaming} /> : agent.summary}
        </div>
      ) : null}
      {agent.findings && agent.findings.length > 0 && (
        <div className="mt-1 pl-4 space-y-0.5">
          {agent.findings.map((f, i) => (
            <div key={i} className="text-[10px] text-muted-foreground/70 flex items-start gap-1">
              <span className="text-muted-foreground/30">•</span>{f}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main component ───────────────────────────────────────────────────────────

interface PipelineTimelineProps {
  phases: PipelinePhase[]
  maxVisible?: number
  className?: string
}

export function PipelineTimeline({ phases, maxVisible = 5, className }: PipelineTimelineProps) {
  const [expanded, setExpanded] = React.useState(false)
  const activeStep = phases.findIndex(p => p.status === "running") + 1 ||
    phases.filter(p => p.status === "completed").length
  const visiblePhases = expanded ? phases : phases.slice(0, maxVisible)
  const hiddenCount = phases.length - maxVisible

  return (
    <div className={cn("pl-1", className)}>
      <Timeline value={activeStep}>
        {visiblePhases.map((phase, index) => {
          const { color } = statusConfig[phase.status]
          const isRunning = phase.status === "running"
          const isCompleted = phase.status === "completed"
          const hasSubAgents = phase.subAgents && phase.subAgents.length > 0

          return (
            <TimelineItem
              key={phase.id}
              step={index + 1}
              className="group-data-[orientation=vertical]/timeline:ms-8 group-data-[orientation=vertical]/timeline:not-last:pb-4"
            >
              <TimelineHeader>
                <TimelineSeparator className="group-data-[orientation=vertical]/timeline:-left-6 group-data-[orientation=vertical]/timeline:h-[calc(100%-1rem-0.25rem)] group-data-[orientation=vertical]/timeline:translate-y-5" />
                <TimelineTitle className="mt-0">
                  <span className="text-[12px] font-medium text-foreground">{phase.title}</span>
                  <span className="text-[11px] text-muted-foreground ml-1">{phase.action}</span>
                </TimelineTitle>
              <TimelineIndicator className="group-data-[orientation=vertical]/timeline:-left-6 flex size-5 items-center justify-center border-none group-data-completed/timeline-item:bg-emerald-500 group-data-completed/timeline-item:text-white dark:group-data-completed/timeline-item:bg-emerald-400">
                {isRunning ? (
                  <Loader2 className="size-3 text-blue-500 animate-spin" />
                ) : isCompleted ? (
                  (() => { const PhaseIcon = phaseIcons[phase.title] || CheckCircle2; return <PhaseIcon className="size-3" /> })()
                ) : (
                  (() => { const PhaseIcon = phaseIcons[phase.title] || Circle; return <PhaseIcon className="size-2.5 text-muted-foreground/40" /> })()
                )}
              </TimelineIndicator>
              </TimelineHeader>

              <TimelineContent className="mt-1">
                <div className={cn(
                  "rounded-lg border px-3 py-2 transition-colors",
                  isRunning && "border-blue-200/60 dark:border-blue-500/20 bg-blue-50/20 dark:bg-blue-500/5",
                  isCompleted && "border-border/40 bg-card",
                  phase.status === "pending" && "border-border/20 bg-muted/10",
                  phase.status === "error" && "border-red-200/60 dark:border-red-500/20 bg-red-50/20 dark:bg-red-500/5",
                )}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      {phase.duration && <span className="text-[10px] text-muted-foreground tabular-nums">{phase.duration}</span>}
                    </div>
                  </div>

                  {/* Streaming JSX or text content */}
                  {phase.streamingJsx && isRunning && (
                    <div className="mt-1">
                      <StreamingJsx jsx={phase.streamingJsx} isStreaming={true} />
                    </div>
                  )}

                  {hasSubAgents && (
                    <Accordion type="multiple" className="mt-1 -mx-0.5">
                      {phase.subAgents!.map((agent, i) => (
                        <AccordionItem key={i} value={`${phase.id}-${i}`} className="border-0">
                          <AccordionTrigger className="py-1 px-0.5 text-[10px] font-medium text-muted-foreground hover:text-foreground hover:no-underline [&>svg]:size-2.5 min-h-0 h-auto">
                            <div className="flex items-center gap-1.5">
                              <StatusInline status={agent.status} />
                              <span className="truncate">{agent.name}</span>
                              {agent.duration && <span className="text-[9px] text-muted-foreground/50 tabular-nums">{agent.duration}</span>}
                            </div>
                          </AccordionTrigger>
                          <AccordionContent className="pb-0 pt-0">
                            <SubAgentRow agent={agent} isStreaming={isRunning && agent.status === "running"} />
                          </AccordionContent>
                        </AccordionItem>
                      ))}
                    </Accordion>
                  )}
                </div>
              </TimelineContent>
            </TimelineItem>
          )
        })}
      </Timeline>

      {/* Show more / less */}
      {!expanded && hiddenCount > 0 && (
        <button
          onClick={() => setExpanded(true)}
          className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors mt-2 ml-8"
        >
          <ChevronDown className="size-3" />
          {hiddenCount} more phases
        </button>
      )}
      {expanded && (
        <button
          onClick={() => setExpanded(false)}
          className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors mt-2 ml-8"
        >
          <ChevronRight className="size-3" />
          Show less
        </button>
      )}
    </div>
  )
}

function StatusInline({ status }: { status: StepStatus }) {
  const { icon: Icon, color } = statusConfig[status]
  return <Icon className={cn("size-2.5 shrink-0", color, status === "running" && "animate-spin")} />
}

function CheckIcon({ className, ...props }: React.SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={cn("size-3", className)} {...props}>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  )
}
