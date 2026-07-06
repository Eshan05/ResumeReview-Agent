"use client";

import { Loader2, Save, Settings2 } from "lucide-react";
import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import type { JobContext } from "@/lib/candidates/types";
import type { JobCriteria, JobWeights } from "@/lib/jobs/criteria";
import {
  getJobCriteriaTemplate,
  getJobWeightsTemplate,
  sumJobWeights,
} from "@/lib/jobs/criteria";

interface JobCriteriaSheetProps {
  job: JobContext;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (job: JobContext) => void;
}

const weightRows: Array<{ key: keyof JobWeights; label: string }> = [
  { key: "skills", label: "Skills" },
  { key: "experience", label: "Experience" },
  { key: "projects", label: "Projects" },
  { key: "education", label: "Education" },
  { key: "trust", label: "Trust" },
];

export function JobCriteriaSheet({
  job,
  open,
  onOpenChange,
  onSaved,
}: JobCriteriaSheetProps) {
  const [weights, setWeights] = React.useState<JobWeights>(job.weights);
  const [criteria, setCriteria] = React.useState<JobCriteria>(job.criteria);
  const [error, setError] = React.useState<string | null>(null);
  const [isSaving, setIsSaving] = React.useState(false);
  const totalWeight = sumJobWeights(weights);
  const canSave = Math.abs(totalWeight - 100) <= 0.01 && !isSaving;

  React.useEffect(() => {
    if (!open) return;
    setWeights(job.weights);
    setCriteria(job.criteria);
    setError(null);
  }, [job.criteria, job.weights, open]);

  const saveCriteria = async () => {
    if (!canSave) return;

    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/jobs/${encodeURIComponent(job.id)}/criteria`,
        {
          body: JSON.stringify({ criteria, weights }),
          headers: { "content-type": "application/json" },
          method: "PATCH",
        },
      );

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        throw new Error(payload?.error?.message ?? "Unable to save criteria");
      }

      const payload = (await response.json()) as { job: JobContext };
      onSaved(payload.job);
      onOpenChange(false);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to save criteria",
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[94vw] gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <SheetHeader className="border-b border-border/50 p-5">
          <SheetTitle className="flex items-center gap-2">
            <Settings2 aria-hidden="true" className="size-4" />
            Job criteria
          </SheetTitle>
          <SheetDescription>
            Criteria and weights used by scoring, pipeline evidence, and Ask.
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1">
          <div className="space-y-6 p-5">
            <section className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">
                    Rubric
                  </h3>
                  <p className="text-xs text-muted-foreground">{job.title}</p>
                </div>
                <Select
                  value={criteria.rubricTemplate}
                  onValueChange={(value: JobCriteria["rubricTemplate"]) => {
                    const template = getJobCriteriaTemplate(value);
                    const templateWeights = getJobWeightsTemplate(value);
                    setCriteria(
                      (current) =>
                        template ?? { ...current, rubricTemplate: value },
                    );
                    if (templateWeights) setWeights(templateWeights);
                  }}
                >
                  <SelectTrigger className="w-44">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="custom">Custom</SelectItem>
                    <SelectItem value="full_stack">Full stack</SelectItem>
                    <SelectItem value="technical_intern">
                      Technical intern
                    </SelectItem>
                    <SelectItem value="hackerrank_style">
                      HackerRank-style
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </section>

            <section className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-foreground">
                  Weights
                </h3>
                <Badge
                  variant={
                    Math.abs(totalWeight - 100) <= 0.01
                      ? "secondary"
                      : "outline"
                  }
                >
                  {totalWeight.toFixed(totalWeight % 1 === 0 ? 0 : 1)} / 100
                </Badge>
              </div>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                {weightRows.map((row) => (
                  <div key={row.key} className="space-y-1">
                    <Label
                      htmlFor={`job-weight-${row.key}`}
                      className="text-xs text-muted-foreground"
                    >
                      {row.label}
                    </Label>
                    <Input
                      id={`job-weight-${row.key}`}
                      min={0}
                      max={100}
                      step={1}
                      type="number"
                      value={weights[row.key]}
                      onChange={(event) =>
                        setWeights((current) => ({
                          ...current,
                          [row.key]: Number(event.target.value),
                        }))
                      }
                    />
                  </div>
                ))}
              </div>
            </section>

            <CriteriaTextarea
              label="Required skills"
              value={criteria.requiredSkills}
              onChange={(requiredSkills) =>
                setCriteria((current) => ({ ...current, requiredSkills }))
              }
            />
            <CriteriaTextarea
              label="Bonus skills"
              value={criteria.bonusSkills}
              onChange={(bonusSkills) =>
                setCriteria((current) => ({ ...current, bonusSkills }))
              }
            />
            <CriteriaTextarea
              label="Project expectations"
              value={criteria.projects.expectations}
              onChange={(expectations) =>
                setCriteria((current) => ({
                  ...current,
                  projects: { ...current.projects, expectations },
                }))
              }
            />
            <CriteriaTextarea
              label="Preferred project evidence"
              value={criteria.projects.preferredEvidence}
              onChange={(preferredEvidence) =>
                setCriteria((current) => ({
                  ...current,
                  projects: { ...current.projects, preferredEvidence },
                }))
              }
            />
            <CriteriaTextarea
              label="Experience signals"
              value={criteria.experience.signals}
              onChange={(signals) =>
                setCriteria((current) => ({
                  ...current,
                  experience: { ...current.experience, signals },
                }))
              }
            />
            <CriteriaTextarea
              label="Education preferences"
              value={criteria.education.preferred}
              onChange={(preferred) =>
                setCriteria((current) => ({
                  ...current,
                  education: { ...current.education, preferred },
                }))
              }
            />
            <CriteriaTextarea
              label="Red flags"
              value={criteria.redFlags}
              onChange={(redFlags) =>
                setCriteria((current) => ({ ...current, redFlags }))
              }
            />
          </div>
        </ScrollArea>

        <SheetFooter className="border-t border-border/50">
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="button" disabled={!canSave} onClick={saveCriteria}>
            {isSaving ? (
              <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
            ) : (
              <Save aria-hidden="true" className="size-3.5" />
            )}
            Save criteria
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function CriteriaTextarea({
  label,
  onChange,
  value,
}: {
  label: string;
  onChange: (value: string[]) => void;
  value: string[];
}) {
  return (
    <section className="space-y-2">
      <Label className="text-sm font-semibold text-foreground">{label}</Label>
      <Textarea
        className="min-h-24 resize-y"
        value={value.join("\n")}
        onChange={(event) => onChange(linesToList(event.target.value))}
      />
    </section>
  );
}

function linesToList(value: string) {
  return Array.from(
    new Set(
      value
        .split(/\r?\n|,/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}
