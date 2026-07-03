"use client";

import {
  AlertCircle,
  BarChart3,
  Bookmark,
  Briefcase,
  Calendar,
  CheckCircle2,
  ChevronDown,
  Copy,
  Database,
  Download,
  Eye,
  FileText,
  GitBranch,
  GraduationCap as GradCapIcon,
  GraduationCap,
  Info,
  Mail,
  MessageSquare,
  MoreHorizontal,
  RefreshCw,
  Search,
  Shield,
  Star,
  Trophy,
  User,
} from "lucide-react";
import * as React from "react";
import {
  CandidateAvatar,
  type CandidateRow,
} from "@/components/table/candidates";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { type Flag, FlagsPopover } from "@/components/workflow/flags-popover";
import {
  type PipelinePhase,
  PipelineTimeline,
} from "@/components/workflow/pipeline-timeline";
import { cn } from "@/lib/utils";
import { getSkillIcon } from "@/utils/mappings";

interface CompletedCandidateRowProps {
  candidate: CandidateRow;
  phases: PipelinePhase[];
  flags: Flag[];
  onOpenDetails: () => void;
  onOpenDialog: () => void;
}

const phaseIcons: Record<string, React.ElementType> = {
  "Text received": FileText,
  "Applicant info": User,
  "Education & certs": GradCapIcon,
  "Data extraction": Database,
  "Profile crawling": Search,
  "Red flag check": Shield,
  "Skills verification": GitBranch,
  "Project matching": BarChart3,
  "Final score": Trophy,
};

export function CompletedCandidateRow({
  candidate,
  phases,
  flags,
  onOpenDetails,
  onOpenDialog,
}: CompletedCandidateRowProps) {
  const [expanded, setExpanded] = React.useState(false);
  const isFailed =
    candidate.status === "failed" ||
    phases.some((phase) => phase.status === "error");
  const StatusIcon = isFailed ? AlertCircle : CheckCircle2;

  return (
    <div className="rounded-lg border border-border/40 bg-card overflow-hidden">
      {/* Header — always visible */}
      <div className="flex items-center gap-2.5 px-3 py-2.5 hover:bg-muted/30 transition-colors">
        <CandidateAvatar
          src={candidate.avatar}
          name={candidate.name}
          className="size-6"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-medium text-foreground">
              {candidate.name}
            </span>
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-[11px] font-semibold tabular-nums text-foreground">
                {candidate.score}
              </span>
              <StatusIcon
                className={
                  isFailed
                    ? "size-3.5 text-red-500"
                    : "size-3.5 text-emerald-500"
                }
              />
            </div>
          </div>
          <div className="flex items-center gap-3 mt-0.5">
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <Briefcase className="size-2.5" />
              {candidate.experience}
            </div>
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <GraduationCap className="size-2.5" />
              {candidate.education}
            </div>
          </div>
          <div className="flex items-center gap-2 mt-1">
            {/* Skills popover */}
            <Popover>
              <PopoverTrigger asChild onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Star className="size-2.5" />
                  {candidate.topSkills.length} skills
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-3" align="start" side="top">
                <p className="text-[11px] font-medium text-foreground mb-2">
                  Technical Skills
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {candidate.topSkills.map((skill) => {
                    const Icon = getSkillIcon(skill);
                    return (
                      <Badge
                        key={skill}
                        variant="outline"
                        className="text-[10px] px-1.5 py-0.5 h-5 gap-1"
                      >
                        {Icon && <Icon className="size-3" />}
                        {skill}
                      </Badge>
                    );
                  })}
                </div>
              </PopoverContent>
            </Popover>
            {/* Flags popover */}
            <FlagsPopover flags={flags} />
            <div className="flex items-center gap-0.5 text-[9px] text-muted-foreground">
              <Shield className="size-2.5" />
              {candidate.trust}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" className="size-6">
                <MoreHorizontal className="size-3.5" />
                <span className="sr-only">Open candidate actions</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem onClick={onOpenDialog}>
                <Eye className="size-3.5" />
                View full pipeline
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onOpenDetails}>
                <Info className="size-3.5" />
                Candidate details
              </DropdownMenuItem>
              <DropdownMenuItem>
                <FileText className="size-3.5" />
                Open resume PDF
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem>
                <Mail className="size-3.5" />
                Draft outreach email
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Calendar className="size-3.5" />
                Schedule interview
              </DropdownMenuItem>
              <DropdownMenuItem>
                <MessageSquare className="size-3.5" />
                Add review note
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {/* Sub-agent re-run menu */}
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <RefreshCw className="size-3.5" />
                  Re-run phase
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="w-56">
                  {phases
                    .filter((p) => p.status === "completed")
                    .map((phase) => {
                      const PhaseIcon = phaseIcons[phase.title] || FileText;
                      return (
                        <DropdownMenuItem key={phase.id}>
                          <PhaseIcon className="size-3.5" />
                          {phase.title}
                        </DropdownMenuItem>
                      );
                    })}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <Search className="size-3.5" />
                  Re-run sub-agent
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="w-60">
                  {phases
                    .filter(
                      (p) => p.status === "completed" && p.subAgents?.length,
                    )
                    .map((phase) =>
                      phase.subAgents
                        ?.filter((sa) => sa.status === "completed")
                        .map((sa) => (
                          <DropdownMenuItem key={`${phase.id}-${sa.name}`}>
                            <span className="truncate">{sa.name}</span>
                            <Badge
                              variant="outline"
                              className="text-[8px] px-1 py-0 h-3 ml-auto"
                            >
                              {sa.provider}
                            </Badge>
                          </DropdownMenuItem>
                        )),
                    )}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <Info className="size-3.5" />
                  Phase details
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="w-56">
                  {phases
                    .filter((p) => p.status === "completed")
                    .map((phase) => {
                      const PhaseIcon = phaseIcons[phase.title] || FileText;
                      return (
                        <DropdownMenuItem key={phase.id} onClick={onOpenDialog}>
                          <PhaseIcon className="size-3.5" />
                          {phase.title}
                          {phase.duration && (
                            <span className="text-[9px] text-muted-foreground ml-auto">
                              {phase.duration}
                            </span>
                          )}
                        </DropdownMenuItem>
                      );
                    })}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSeparator />
              <DropdownMenuItem>
                <Download className="size-3.5" />
                Export report
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Bookmark className="size-3.5" />
                Shortlist candidate
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Copy className="size-3.5" />
                Copy summary
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
            className="text-muted-foreground/50 hover:text-muted-foreground transition-colors p-0.5"
          >
            <ChevronDown
              className={cn(
                "size-3 transition-transform duration-200",
                expanded && "rotate-180",
              )}
            />
          </button>
        </div>
      </div>

      {/* Expanded — timeline */}
      {expanded && (
        <div className="px-3 pb-2.5 pt-0 border-t border-border/30">
          <PipelineTimeline phases={phases} maxVisible={5} />
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenDialog();
            }}
            className="mt-2 w-full text-center text-[10px] text-muted-foreground hover:text-foreground transition-colors py-1"
          >
            View full pipeline →
          </button>
        </div>
      )}
    </div>
  );
}
