"use client"

import * as React from "react"
import { WorkflowView, type WorkflowPhase } from "@/components/workflow"
import { RunDetails, type AgentStep } from "@/components/workflow"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Upload, FileText, Loader2 } from "lucide-react"

const demoPhases: WorkflowPhase[] = [
  {
    id: "text-received",
    title: "Text received",
    description: "Format: PDF (text-native) • Characters: 4,521",
    status: "completed",
    category: "Ingestion",
    categoryColor: "bg-slate-100 text-slate-700",
    duration: "0.1s",
  },
  {
    id: "data-extraction",
    title: "Data extraction",
    description: "Skills: 14 detected • Experience: 3 positions • Projects: 5 found",
    status: "completed",
    category: "Data Extraction",
    categoryColor: "bg-blue-100 text-blue-700",
    duration: "2.8s",
    details: [
      "Skills Agent (Groq: Llama 4 Scout) completed",
      "Experience Agent (Groq: Llama 4 Scout) completed",
      "Projects Agent (Groq: Llama 4 Scout) completed",
    ],
  },
  {
    id: "profile-crawling",
    title: "Profile crawling",
    description: "GitHub: Valid (23 repos, 456 stars) • LinkedIn: Valid URL",
    status: "completed",
    category: "Data Extraction",
    categoryColor: "bg-blue-100 text-blue-700",
    duration: "1.5s",
    details: [
      "GitHub REST API: 23 repos, 456 total stars",
      "Languages: TypeScript (15), Python (8)",
      "LinkedIn URL validated",
    ],
  },
  {
    id: "red-flag-check",
    title: "Red flag check",
    description: "Employment gaps: None • Skill consistency: Verified • Trust: 92/100",
    status: "completed",
    category: "Reasoning",
    categoryColor: "bg-violet-100 text-violet-700",
    duration: "0.9s",
  },
  {
    id: "project-matching",
    title: "Project matching",
    description: "2 projects matched with job description",
    status: "completed",
    category: "Reasoning",
    categoryColor: "bg-violet-100 text-violet-700",
    duration: "1.1s",
    details: [
      "\"E-commerce Platform\" → 87% match",
      "\"ML Pipeline\" → 72% match",
    ],
  },
  {
    id: "final-score",
    title: "Final score",
    description: "Score: 85/100 — Rank #2 of 12",
    status: "completed",
    category: "Scoring",
    categoryColor: "bg-amber-100 text-amber-700",
    duration: "0.3s",
  },
]

const demoSteps: AgentStep[] = [
  {
    id: "build-prompt",
    action: "Build prompt",
    provider: "Groq",
    status: "completed",
    duration: "2.9s",
    details: [
      "Injected system instruction: You are a resume analysis agent...",
      "Inserted resume text: 4,521 characters",
      "Added job description context",
    ],
  },
  {
    id: "skills-extraction",
    action: "Skills extraction",
    provider: "Groq",
    model: "Llama 4 Scout",
    status: "completed",
    duration: "1.2s",
    tokensIn: 1874,
    tokensOut: 532,
    details: [
      "Extracted 14 skills with proficiency levels",
      "Identified 3 advanced, 5 intermediate, 6 beginner skills",
    ],
  },
  {
    id: "experience-analysis",
    action: "Experience analysis",
    provider: "Groq",
    model: "Llama 4 Scout",
    status: "completed",
    duration: "1.4s",
    tokensIn: 2100,
    tokensOut: 680,
  },
  {
    id: "github-crawl",
    action: "GitHub profile crawl",
    provider: "REST API",
    status: "completed",
    duration: "0.8s",
    details: [
      "Fetched 23 repositories",
      "Calculated 456 total stars",
      "Detected recent activity: 5 commits in last 30 days",
    ],
  },
  {
    id: "red-flag-detect",
    action: "Red flag detection",
    provider: "Gemini",
    model: "2.5 Flash",
    status: "completed",
    duration: "0.9s",
    tokensIn: 3200,
    tokensOut: 420,
  },
  {
    id: "scoring",
    action: "Final scoring",
    provider: "Groq",
    model: "Llama 3.3 70B",
    status: "completed",
    duration: "0.3s",
    tokensIn: 2800,
    tokensOut: 180,
  },
]

export default function Home() {
  const [showDemo, setShowDemo] = React.useState(false)

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/50 bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="size-5 text-foreground" />
            <span className="text-sm font-semibold text-foreground">ResumeReview</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm">Sign In</Button>
            <Button size="sm">Get Started</Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <main className="max-w-6xl mx-auto px-4 py-16">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold tracking-tight text-foreground mb-4">
            AI-Powered Resume Screening
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Upload resumes, let AI agents analyze skills, experience, and projects.
            Get ranked candidates with red-flag detection in minutes.
          </p>
        </div>

        {/* Upload area */}
        <Card className="max-w-2xl mx-auto p-8 mb-12">
          <div className="border-2 border-dashed border-border rounded-xl p-12 text-center hover:border-muted-foreground/30 transition-colors cursor-pointer">
            <Upload className="size-10 text-muted-foreground/40 mx-auto mb-4" />
            <p className="text-sm font-medium text-foreground mb-1">
              Drop resumes here or click to upload
            </p>
            <p className="text-xs text-muted-foreground">
              Supports PDF, DOCX, PNG, JPG • Up to 100 files at once
            </p>
          </div>
        </Card>

        {/* Demo toggle */}
        <div className="text-center mb-8">
          <Button
            variant="outline"
            onClick={() => setShowDemo(!showDemo)}
          >
            {showDemo ? "Hide Demo" : "See Workflow Demo"}
          </Button>
        </div>

        {/* Demo workflow view */}
        {showDemo && (
          <div className="max-w-4xl mx-auto grid grid-cols-1 lg:grid-cols-5 gap-6">
            {/* Main workflow */}
            <div className="lg:col-span-3">
              <Card className="overflow-hidden">
                <WorkflowView
                  resumeName="john_doe.pdf"
                  phases={demoPhases}
                  overallStatus="completed"
                  elapsed="6.7s"
                />
              </Card>
            </div>

            {/* Run details sidebar */}
            <div className="lg:col-span-2">
              <Card className="overflow-hidden h-[600px]">
                <RunDetails
                  runId="run_abc123"
                  status="completed"
                  steps={demoSteps}
                  totalDuration="6.7s"
                  totalTokensIn={12874}
                  totalTokensOut={1812}
                />
              </Card>
            </div>
          </div>
        )}

        {/* Features */}
        <div className="max-w-4xl mx-auto mt-16 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="text-center p-6">
            <div className="size-10 rounded-lg bg-blue-50 flex items-center justify-center mx-auto mb-3">
              <span className="text-lg">⚡</span>
            </div>
            <h3 className="text-sm font-medium text-foreground mb-1">Parallel Processing</h3>
            <p className="text-xs text-muted-foreground">
              Multiple AI agents work simultaneously to analyze each resume
            </p>
          </div>
          <div className="text-center p-6">
            <div className="size-10 rounded-lg bg-violet-50 flex items-center justify-center mx-auto mb-3">
              <span className="text-lg">🔍</span>
            </div>
            <h3 className="text-sm font-medium text-foreground mb-1">Red Flag Detection</h3>
            <p className="text-xs text-muted-foreground">
              AI checks for employment gaps, skill exaggerations, and discrepancies
            </p>
          </div>
          <div className="text-center p-6">
            <div className="size-10 rounded-lg bg-amber-50 flex items-center justify-center mx-auto mb-3">
              <span className="text-lg">📊</span>
            </div>
            <h3 className="text-sm font-medium text-foreground mb-1">Weighted Scoring</h3>
            <p className="text-xs text-muted-foreground">
              Customize weights for skills, experience, projects, and trust
            </p>
          </div>
        </div>
      </main>
    </div>
  )
}
