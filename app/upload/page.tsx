"use client";

import { useState, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useToast, ToastContainer } from "@/hooks/useToast";

interface UploadedFile {
  id: string;
  name: string;
  size: string;
  progress: number;
}

export default function UploadPage() {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [jdText, setJdText] = useState("");
  const [jdUrl, setJdUrl] = useState("");
  const [weights, setWeights] = useState({
    technical: 25,
    experience: 25,
    projects: 25,
    culture: 25,
  });
  const [isDragging, setIsDragging] = useState(false);
  const { toasts, toast, dismiss } = useToast();

  const totalWeight = weights.technical + weights.experience + weights.projects + weights.culture;
  const isValid = totalWeight === 100 && files.length > 0;

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFiles = Array.from(e.dataTransfer.files).filter(f => f.type === "application/pdf");
    const newFiles = droppedFiles.map((f, i) => ({
      id: Math.random().toString(36).substring(7),
      name: f.name,
      size: `${(f.size / 1024 / 1024).toFixed(1)} MB`,
      progress: 0,
    }));
    setFiles(prev => [...prev, ...newFiles]);
    toast({ title: `${newFiles.length} file(s) uploaded` });
  }, [toast]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []).filter(f => f.type === "application/pdf");
    const newFiles = selected.map((f) => ({
      id: Math.random().toString(36).substring(7),
      name: f.name,
      size: `${(f.size / 1024 / 1024).toFixed(1)} MB`,
      progress: 0,
    }));
    setFiles(prev => [...prev, ...newFiles]);
    toast({ title: `${newFiles.length} file(s) uploaded` });
  }, [toast]);

  const removeFile = (id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id));
  };

  const updateWeight = (key: keyof typeof weights, value: number[]) => {
    setWeights(prev => ({ ...prev, [key]: value[0] }));
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <ToastContainer toasts={toasts} dismiss={dismiss} />
      <h1 className="text-3xl font-bold">Upload Resumes</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column - Upload */}
        <div className="space-y-4">
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-xl p-12 text-center transition-all cursor-pointer ${
              isDragging
                ? "border-primary bg-primary/5"
                : "border-border hover:border-primary/50"
            }`}
          >
            <input
              type="file"
              multiple
              accept=".pdf"
              onChange={handleFileInput}
              className="hidden"
              id="file-upload"
            />
            <label htmlFor="file-upload" className="cursor-pointer">
              <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mx-auto mb-4 text-muted-foreground"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/></svg>
              <p className="text-lg font-medium">Drop PDFs here or click to browse</p>
              <p className="text-sm text-muted-foreground mt-1">Only PDF files supported</p>
            </label>
          </div>

          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={() => document.getElementById("file-upload")?.click()}>
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/></svg>
              Upload from Desktop
            </Button>
            <Button variant="outline" className="flex-1">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
              Import from Google Drive
            </Button>
          </div>

          {files.length > 0 && (
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {files.map((file) => (
                <Card key={file.id} className="card-lift">
                  <CardContent className="p-3 flex items-center gap-3">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-red-500 shrink-0"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/></svg>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{file.name}</p>
                      <p className="text-xs text-muted-foreground">{file.size}</p>
                    </div>
                    <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => removeFile(file.id)}>
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Right Column - Job Description */}
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Job Description</Label>
            <Textarea
              placeholder="Paste the job description here..."
              value={jdText}
              onChange={(e) => setJdText(e.target.value)}
              className="min-h-[120px]"
            />
          </div>

          <div className="space-y-2">
            <Label>Or paste a job listing URL</Label>
            <div className="flex gap-2">
              <Input
                placeholder="https://..."
                value={jdUrl}
                onChange={(e) => setJdUrl(e.target.value)}
                className="flex-1"
              />
              <Button variant="outline">Extract</Button>
            </div>
          </div>

          <div className="space-y-4 pt-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Scoring Weights</h3>
              <Badge variant={totalWeight === 100 ? "default" : "destructive"}>
                Total: {totalWeight}%
              </Badge>
            </div>

            {[
              { key: "technical" as const, label: "Technical Skills" },
              { key: "experience" as const, label: "Experience" },
              { key: "projects" as const, label: "Project Relevance" },
              { key: "culture" as const, label: "Cultural Fit" },
            ].map(({ key, label }) => (
              <div key={key} className="space-y-2">
                <div className="flex justify-between text-sm">
                  <Label>{label}</Label>
                  <span className="font-medium">{weights[key]}%</span>
                </div>
                <Slider
                  value={[weights[key]]}
                  max={100}
                  step={5}
                  onValueChange={(v) => updateWeight(key, v)}
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      <Button
        size="lg"
        className="w-full"
        disabled={!isValid}
        onClick={() => toast({ title: "Processing started!", description: `${files.length} resumes sent to pipeline` })}
      >
        Start Processing →
      </Button>
    </div>
  );
}
