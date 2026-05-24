"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { mockResumes } from "@/lib/data";
import type { Resume } from "@/types";
import { cn } from "@/lib/utils";

function ScoreRing({ score, color }: { score: number; color: string }) {
  const radius = 28;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="relative h-16 w-16 shrink-0">
      <svg className="h-16 w-16 -rotate-90" viewBox="0 0 64 64">
        <circle
          cx="32"
          cy="32"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="4"
          className="text-muted/30"
        />
        <circle
          cx="32"
          cy="32"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-500"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-sm font-bold">{score}</span>
      </div>
    </div>
  );
}

function CandidateCard({ resume, onClick }: { resume: Resume; onClick: () => void }) {
  return (
    <Card className="card-lift cursor-pointer overflow-hidden" onClick={onClick}>
      <CardContent className="p-4">
        <div className="flex items-start gap-4">
          <ScoreRing score={resume.scores?.overall || 0} color="hsl(var(--primary))" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-primary/10 text-primary text-xs">{resume.initials}</AvatarFallback>
              </Avatar>
              <div>
                <p className="font-medium text-sm">{resume.name}</p>
                <p className="text-xs text-muted-foreground">{resume.role}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-1 mt-2">
              {resume.skills?.slice(0, 3).map((skill) => (
                <Badge key={skill} variant="secondary" className="text-xs">{skill}</Badge>
              ))}
              <Badge variant="outline" className="text-xs">4 yrs exp</Badge>
            </div>
            {resume.redFlags && resume.redFlags.length > 0 && (
              <Badge variant="destructive" className="mt-2 text-xs">
                {resume.redFlags.length} red flag{resume.redFlags.length > 1 ? "s" : ""}
              </Badge>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function CandidatesPage() {
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("score");
  const [selectedResume, setSelectedResume] = useState<Resume | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [emailDraft, setEmailDraft] = useState("");

  const filtered = mockResumes
    .filter((r) =>
      r.name.toLowerCase().includes(search.toLowerCase()) ||
      r.role.toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => {
      if (sortBy === "score") return (b.scores?.overall || 0) - (a.scores?.overall || 0);
      if (sortBy === "redflags") return (b.redFlags?.length || 0) - (a.redFlags?.length || 0);
      if (sortBy === "match") return (b.scores?.overall || 0) - (a.scores?.overall || 0);
      return 0;
    });

  const handleViewProfile = (resume: Resume) => {
    setSelectedResume(resume);
    setSheetOpen(true);
  };

  const handleDraftEmail = (resume: Resume) => {
    setSelectedResume(resume);
    setEmailDraft(`Dear ${resume.name},

We were impressed by your background and would like to invite you for an interview...`);
    setEmailDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Candidates</h1>

      <div className="flex flex-col sm:flex-row gap-4">
        <Input
          placeholder="Search candidates..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="sm:max-w-xs"
        />
        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger className="sm:w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="score">Sort by Score</SelectItem>
            <SelectItem value="redflags">Sort by Red Flags</SelectItem>
            <SelectItem value="match">Sort by Match %</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((resume) => (
          <CandidateCard
            key={resume.id}
            resume={resume}
            onClick={() => handleViewProfile(resume)}
          />
        ))}
      </div>

      {/* Candidate Detail Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="w-[480px] overflow-y-auto">
          {selectedResume && (
            <>
              <SheetHeader>
                <div className="flex items-center gap-3">
                  <Avatar className="h-12 w-12">
                    <AvatarFallback className="bg-primary/10 text-primary text-lg">{selectedResume.initials}</AvatarFallback>
                  </Avatar>
                  <div>
                    <SheetTitle>{selectedResume.name}</SheetTitle>
                    <SheetDescription>{selectedResume.role}</SheetDescription>
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
                    <p className="text-sm text-muted-foreground">
                      {selectedResume.name.toLowerCase().replace(" ", ".")}@email.com
                    </p>
                  </div>
                  <Separator />
                  <div className="space-y-2">
                    <h4 className="font-semibold">Skills</h4>
                    <div className="flex flex-wrap gap-2">
                      {selectedResume.skills?.map((skill) => (
                        <Badge key={skill} variant="secondary">{skill}</Badge>
                      )) || <p className="text-sm text-muted-foreground">No skills extracted yet</p>}
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="analysis" className="space-y-4 mt-4">
                  <div className="space-y-2">
                    <h4 className="font-semibold">OCR Quality</h4>
                    <Progress value={selectedResume.ocrQuality || 0} max={100} />
                    <p className="text-sm text-muted-foreground">{selectedResume.ocrQuality || 0}% accuracy</p>
                  </div>
                  <Separator />
                  <div className="space-y-2">
                    <h4 className="font-semibold">Crawled Links</h4>
                    {selectedResume.crawledLinks?.map((link) => (
                      <Badge key={link.url} variant="outline" className="mr-2">
                        {link.type}: {link.url}
                      </Badge>
                    )) || <p className="text-sm text-muted-foreground">No links found</p>}
                  </div>
                  <Separator />
                  <div className="space-y-2">
                    <h4 className="font-semibold">Red Flags</h4>
                    {selectedResume.redFlags && selectedResume.redFlags.length > 0 ? (
                      selectedResume.redFlags.map((flag, i) => (
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
                  {selectedResume.scores ? (
                    <>
                      {[
                        { label: "Technical", value: selectedResume.scores.technical },
                        { label: "Experience", value: selectedResume.scores.experience },
                        { label: "Projects", value: selectedResume.scores.projects },
                        { label: "Culture Fit", value: selectedResume.scores.culture },
                        { label: "Overall", value: selectedResume.scores.overall },
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
                  <Button className="w-full" onClick={() => handleDraftEmail(selectedResume)}>
                    Draft Interview Email
                  </Button>
                  <Button variant="outline" className="w-full">Schedule Interview</Button>
                </TabsContent>
              </Tabs>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Email Dialog */}
      <Dialog open={emailDialogOpen} onOpenChange={setEmailDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Draft Interview Email</DialogTitle>
            <DialogDescription>
              AI-generated email for {selectedResume?.name}
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={emailDraft}
            onChange={(e) => setEmailDraft(e.target.value)}
            className="min-h-[200px]"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEmailDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => { setEmailDialogOpen(false); }}>Send Email</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
