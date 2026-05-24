"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { mockActivities, mockResumes } from "@/lib/data";
import Link from "next/link";

function StatCard({ title, value, icon, color, subtext }: {
  title: string;
  value: string;
  icon: React.ReactNode;
  color: string;
  subtext?: string;
}) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-3xl font-bold">{value}</p>
            {subtext && <p className="text-xs text-muted-foreground">{subtext}</p>}
          </div>
          <div className="h-12 w-12 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${color}20`, color }}>
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function MiniPipeline() {
  const agents = [
    { name: "Intake", color: "#4A90E2", count: 2 },
    { name: "OCR", color: "#9B59B6", count: 1 },
    { name: "Crawler", color: "#1ABC9C", count: 1 },
    { name: "Red Flag", color: "#E74C3C", count: 1 },
    { name: "Scoring", color: "#F39C12", count: 0 },
    { name: "Master", color: "#6C63FF", count: 2 },
  ];

  return (
    <Card className="mt-6">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Pipeline Preview</CardTitle>
          <Link href="/pipeline">
            <Button variant="ghost" size="sm">View Full Pipeline →</Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-2 overflow-x-auto pb-2">
          {agents.map((agent, i) => (
            <div key={agent.name} className="flex items-center gap-2 shrink-0">
              <div
                className="rounded-lg border p-3 min-w-[120px]"
                style={{ borderColor: agent.color }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: agent.color }} />
                  <span className="text-xs font-medium">{agent.name}</span>
                </div>
                <p className="text-lg font-bold">{agent.count}</p>
                <p className="text-xs text-muted-foreground">resumes</p>
              </div>
              {i < agents.length - 1 && (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-muted-foreground shrink-0">
                  <path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function ActivityFeed() {
  const getBadgeColor = (type: string) => {
    switch (type) {
      case "processing": return "bg-blue-500/10 text-blue-500";
      case "complete": return "bg-green-500/10 text-green-500";
      case "handoff": return "bg-amber-500/10 text-amber-500";
      case "error": return "bg-red-500/10 text-red-500";
      default: return "";
    }
  };

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle>Recent Activity</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {mockActivities.map((activity) => (
            <div key={activity.id} className="flex items-start gap-3">
              <div className="mt-1">
                <Badge variant="outline" className={getBadgeColor(activity.type)}>
                  {activity.agent}
                </Badge>
              </div>
              <div className="flex-1">
                <p className="text-sm">{activity.message}</p>
                <p className="text-xs text-muted-foreground mt-1">{activity.timestamp}</p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const totalResumes = mockResumes.length;
  const processing = mockResumes.filter(r => r.status === "processing").length;
  const shortlisted = mockResumes.filter(r => r.scores && r.scores.overall > 85).length;
  const redFlags = mockResumes.filter(r => r.redFlags && r.redFlags.length > 0).length;

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Dashboard</h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          title="Total Resumes"
          value={totalResumes.toString()}
          icon={<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/></svg>}
          color="#4A90E2"
        />
        <StatCard
          title="Processing"
          value={processing.toString()}
          icon={<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-spin-slow"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>}
          color="#9B59B6"
        />
        <StatCard
          title="Shortlisted"
          value={shortlisted.toString()}
          icon={<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>}
          color="#00B87A"
        />
        <StatCard
          title="Red Flags"
          value={redFlags.toString()}
          icon={<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" x2="12" y1="9" y2="13"/><line x1="12" x2="12.01" y1="17" y2="17"/></svg>}
          color="#E03050"
        />
      </div>

      <MiniPipeline />
      <ActivityFeed />
    </div>
  );
}
