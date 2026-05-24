"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { useWindowSize } from "@/hooks/useWindowSize";
import { useToast, ToastContainer } from "@/hooks/useToast";
import { initialAgents, mockResumes } from "@/lib/data";
import type { Resume, Agent } from "@/types";
import { cn } from "@/lib/utils";

const AGENT_CONFIG: Record<string, { icon: string; color: string; label: string }> = {
  intake: { icon: "Inbox", color: "#4A90E2", label: "Intake Agent" },
  ocr: { icon: "ScanText", color: "#9B59B6", label: "OCR Agent" },
  crawler: { icon: "Globe", color: "#1ABC9C", label: "Crawler Agent" },
  redflag: { icon: "AlertTriangle", color: "#E74C3C", label: "Red Flag Agent" },
  scoring: { icon: "BarChart3", color: "#F39C12", label: "Scoring Agent" },
  master: { icon: "Crown", color: "#6C63FF", label: "Master Agent" },
};

function AgentIcon({ name, className }: { name: string; className?: string }) {
  const icons: Record<string, JSX.Element> = {
    Inbox: <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>,
    ScanText: <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><line x1="8" x2="16" y1="10" y2="10"/><line x1="8" x2="16" y1="14" y2="14"/></svg>,
    Globe: <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><circle cx="12" cy="12" r="10"/><line x1="2" x2="22" y1="12" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>,
    AlertTriangle: <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" x2="12" y1="9" y2="13"/><line x1="12" x2="12.01" y1="17" y2="17"/></svg>,
    BarChart3: <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/></svg>,
    Crown: <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="m2 4 3 12h14l3-12-6 7-4-7-4 7-6-7zm3 16h14"/></svg>,
  };
  return icons[name] || null;
}

function ResumeCard({ resume, agentColor, onClick }: { resume: Resume; agentColor: string; onClick: () => void }) {
  const isProcessing = resume.status === "processing";

  return (
    <Card
      className="card-lift cursor-pointer border-border/50 hover:border-opacity-100"
      style={{ borderColor: isProcessing ? agentColor : undefined }}
      onClick={onClick}
    >
      <CardContent className="p-3">
        <div className="flex items-center gap-3">
          <Avatar className="h-8 w-8">
            <AvatarFallback style={{ backgroundColor: `${agentColor}30`, color: agentColor, fontSize: "11px" }}>
              {resume.initials}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{resume.name}</p>
            <p className="text-xs text-muted-foreground truncate">{resume.role}</p>
          </div>
          {isProcessing && (
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-spin-slow text-muted-foreground"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
          )}
        </div>
        {isProcessing && (
          <div className="mt-2">
            <Progress value={resume.progress} max={100} color={agentColor} className="h-1" />
            <p className="text-xs text-muted-foreground mt-1">{resume.progress}%</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ArrowConnector({ fromColor, toColor, isActive }: { fromColor: string; toColor: string; isActive: boolean }) {
  return (
    <div className="flex flex-col items-center shrink-0 px-1">
      <svg width="40" height="24" viewBox="0 0 40 24" className="overflow-visible">
        <defs>
          <linearGradient id={`grad-${fromColor}-${toColor}`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={fromColor} />
            <stop offset="100%" stopColor={toColor} />
          </linearGradient>
        </defs>
        <path
          d="M0 12 L32 12"
          stroke={`url(#grad-${fromColor}-${toColor})`}
          strokeWidth="2"
          fill="none"
          strokeLinecap="round"
          className={isActive ? "opacity-100" : "opacity-30"}
        />
        <path
          d="M28 6 L36 12 L28 18"
          stroke={toColor}
          strokeWidth="2"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={isActive ? "opacity-100" : "opacity-30"}
        />
        {isActive && (
          <circle r="3" fill={fromColor} className="animate-pulse-dot">
            <animateMotion dur="2s" repeatCount="indefinite" path="M0 12 L32 12" />
          </circle>
        )}
      </svg>
      <span className="text-[10px] text-muted-foreground mt-1">handoff</span>
    </div>
  );
}

function AgentBox({ agent, onResumeClick }: { agent: Agent; onResumeClick: (r: Resume) => void }) {
  const config = AGENT_CONFIG[agent.id];
  const isActive = agent.status === "active";

  return (
    <Card
      className="min-w-[280px] max-w-[320px] min-h-[400px] flex flex-col"
      style={{
        borderColor: `${config.color}60`,
        boxShadow: `0 0 16px 2px ${config.color}20`,
      }}
    >
      <CardHeader className="p-4 pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AgentIcon name={config.icon} className="shrink-0" style={{ color: config.color } as any} />
            <span className="text-sm font-semibold">{config.label}</span>
          </div>
          <Badge
            variant="outline"
            className={cn(
              "text-xs",
              isActive ? "border-green-500/50 text-green-500" : "border-muted text-muted-foreground"
            )}
          >
            <span className={cn("w-1.5 h-1.5 rounded-full mr-1", isActive ? "bg-green-500 animate-pulse-dot" : "bg-muted-foreground")} />
            {isActive ? "Active" : "Idle"}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground mt-1">{agent.resumes.length} resumes</p>
      </CardHeader>

      <CardContent className="p-4 pt-0 flex-1 overflow-y-auto space-y-2 max-h-[300px]">
        {agent.resumes.map((resume) => (
          <ResumeCard
            key={resume.id}
            resume={resume}
            agentColor={config.color}
            onClick={() => onResumeClick(resume)}
          />
        ))}
        {agent.resumes.length === 0 && (
          <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
            No resumes
          </div>
        )}
      </CardContent>

      <div className="p-4 pt-0">
        <Progress value={agent.progress} max={100} color={config.color} />
        <p className="text-xs text-muted-foreground mt-1 text-center">{agent.progress}% processed</p>
      </div>
    </Card>
  );
}

function CandidateSheet({ resume, open, onOpenChange }: { resume: Resume | null; open: boolean; onOpenChange: (v: boolean) => void }) {
  if (!resume) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[480px] overflow-y-auto">
        <SheetHeader>
          <div className="flex items-center gap-3">
            <Avatar className="h-12 w-12">
              <AvatarFallback className="bg-primary/10 text-primary text-lg">{resume.initials}</AvatarFallback>
            </Avatar>
            <div>
              <SheetTitle>{resume.name}</SheetTitle>
              <SheetDescription>{resume.role}</SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <Tabs defaultValue="profile" className="mt-6">
          <TabsList className="w-full">
            <TabsTrigger value="profile">Profile</TabsTrigger>
            <TabsTrigger value="analysis">Analysis</TabsTrigger>
            <TabsTrigger value="scores">Scores</TabsTrigger>
            <TabsTrigger value="actions">Actions</TabsTrigger>
          </TabsList>

          <TabsContent value="profile" className="space-y-4 mt-4">
            <div className="space-y-2">
              <h4 className="font-semibold">Contact</h4>
              <p className="text-sm text-muted-foreground">{resume.name.toLowerCase().replace(" ", ".")}@email.com</p>
            </div>
            <Separator />
            <div className="space-y-2">
              <h4 className="font-semibold">Skills</h4>
              <div className="flex flex-wrap gap-2">
                {resume.skills?.map((skill) => (
                  <Badge key={skill} variant="secondary">{skill}</Badge>
                )) || <p className="text-sm text-muted-foreground">No skills extracted yet</p>}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="analysis" className="space-y-4 mt-4">
            <div className="space-y-2">
              <h4 className="font-semibold">OCR Quality</h4>
              <Progress value={resume.ocrQuality || 0} max={100} />
              <p className="text-sm text-muted-foreground">{resume.ocrQuality || 0}% accuracy</p>
            </div>
            <Separator />
            <div className="space-y-2">
              <h4 className="font-semibold">Crawled Links</h4>
              {resume.crawledLinks?.map((link) => (
                <Badge key={link.url} variant="outline" className="mr-2">
                  {link.type}: {link.url}
                </Badge>
              )) || <p className="text-sm text-muted-foreground">No links found</p>}
            </div>
            <Separator />
            <div className="space-y-2">
              <h4 className="font-semibold">Red Flags</h4>
              {resume.redFlags && resume.redFlags.length > 0 ? (
                resume.redFlags.map((flag, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Badge variant="destructive">{flag.severity}</Badge>
                    <span className="text-sm">{flag.text}</span>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">No red flags detected</p>
              )}
            </div>
          </TabsContent>

          <TabsContent value="scores" className="space-y-4 mt-4">
            {resume.scores ? (
              <>
                {[
                  { label: "Technical", value: resume.scores.technical },
                  { label: "Experience", value: resume.scores.experience },
                  { label: "Projects", value: resume.scores.projects },
                  { label: "Culture Fit", value: resume.scores.culture },
                  { label: "Overall", value: resume.scores.overall },
                ].map((score) => (
                  <div key={score.label} className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>{score.label}</span>
                      <span className="font-medium">{score.value}%</span>
                    </div>
                    <Progress value={score.value} max={100} />
                  </div>
                ))}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Scores not yet calculated</p>
            )}
          </TabsContent>

          <TabsContent value="actions" className="space-y-4 mt-4">
            <Button className="w-full">Draft Interview Email</Button>
            <Button variant="outline" className="w-full">Schedule Interview</Button>
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}

export default function PipelinePage() {
  const [agents, setAgents] = useState<Agent[]>(initialAgents);
  const [selectedResume, setSelectedResume] = useState<Resume | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [speed, setSpeed] = useState("1x");
  const { width } = useWindowSize();
  const { toasts, toast, dismiss } = useToast();

  const isMobile = width < 768;

  // Simulate pipeline movement
  useEffect(() => {
    if (isPaused) return;

    const interval = setInterval(() => {
      setAgents((prev) => {
        const next = [...prev];
        // Simple simulation: move resumes through pipeline
        for (let i = 0; i < next.length - 1; i++) {
          const current = next[i];
          const nextAgent = next[i + 1];

          // Move completed resumes to next agent
          const completed = current.resumes.filter(r => r.progress >= 100);
          if (completed.length > 0 && nextAgent) {
            const moving = completed[0];
            current.resumes = current.resumes.filter(r => r.id !== moving.id);
            nextAgent.resumes = [...nextAgent.resumes, { ...moving, currentAgent: nextAgent.id, progress: 0 }];
            toast({
              title: "Agent Handoff",
              description: `${current.name} → ${nextAgent.name}: ${moving.name}`,
            });
          }

          // Increment progress for processing resumes
          current.resumes = current.resumes.map(r => {
            if (r.status === "processing" && r.progress < 100) {
              return { ...r, progress: Math.min(100, r.progress + (speed === "1x" ? 5 : speed === "2x" ? 10 : 20)) };
            }
            return r;
          });
        }

        // Update agent progress
        next.forEach(agent => {
          if (agent.resumes.length > 0) {
            const avgProgress = agent.resumes.reduce((sum, r) => sum + r.progress, 0) / agent.resumes.length;
            agent.progress = Math.round(avgProgress);
            agent.status = avgProgress < 100 ? "active" : "idle";
          } else {
            agent.progress = 0;
            agent.status = "idle";
          }
        });

        return next;
      });
    }, speed === "1x" ? 2000 : speed === "2x" ? 1000 : 500);

    return () => clearInterval(interval);
  }, [isPaused, speed, toast]);

  const overallProgress = Math.round(
    agents.reduce((sum, a) => sum + a.progress, 0) / agents.length
  );

  const handleResumeClick = (resume: Resume) => {
    setSelectedResume(resume);
    setSheetOpen(true);
  };

  const handleReset = () => {
    setAgents(initialAgents);
    toast({ title: "Pipeline reset", variant: "destructive" });
  };

  return (
    <div className="space-y-4">
      <ToastContainer toasts={toasts} dismiss={dismiss} />

      {/* Toolbar */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <Badge variant="outline" className="text-sm px-3 py-1">
          Processing: Senior Frontend Engineer @ Acme Corp
        </Badge>

        <div className="flex items-center gap-4 w-full md:w-auto">
          <div className="flex-1 md:w-48">
            <Progress value={overallProgress} max={100} />
            <p className="text-xs text-muted-foreground text-center mt-1">{overallProgress}% overall</p>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => setIsPaused(!isPaused)}>
              {isPaused ? (
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
              )}
            </Button>

            <Select value={speed} onValueChange={setSpeed}>
              <SelectTrigger className="w-20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1x">1x</SelectItem>
                <SelectItem value="2x">2x</SelectItem>
                <SelectItem value="4x">4x</SelectItem>
              </SelectContent>
            </Select>

            <Button variant="ghost" size="icon" onClick={handleReset}>
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
            </Button>
          </div>
        </div>
      </div>

      {/* Pipeline */}
      <div className={cn(
        "flex gap-2",
        isMobile ? "flex-col" : "flex-row overflow-x-auto pipeline-scroll pb-4"
      )}>
        {agents.map((agent, i) => (
          <div key={agent.id} className={cn("flex", isMobile ? "flex-col" : "flex-row items-start")}>
            <AgentBox agent={agent} onResumeClick={handleResumeClick} />
            {i < agents.length - 1 && !isMobile && (
              <div className="flex items-center pt-8">
                <ArrowConnector
                  fromColor={AGENT_CONFIG[agent.id].color}
                  toColor={AGENT_CONFIG[agents[i + 1].id].color}
                  isActive={agent.status === "active"}
                />
              </div>
            )}
            {i < agents.length - 1 && isMobile && (
              <div className="flex justify-center py-2">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-muted-foreground rotate-90">
                  <path d="M12 5v14M19 12l-7 7-7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
            )}
          </div>
        ))}
      </div>

      <CandidateSheet
        resume={selectedResume}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
      />
    </div>
  );
}
