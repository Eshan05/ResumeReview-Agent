"use client";

import {
  Bookmark,
  Calendar,
  Copy,
  Download,
  Eye,
  FileJson,
  FileSpreadsheet,
  Mail,
  MessageSquare,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { CandidateRow } from "./schema";

interface BulkActionsProps {
  selectedItems: CandidateRow[];
  onClearSelection: () => void;
  onViewPipeline: (id: string) => void;
}

export function CandidateBulkActions({
  selectedItems,
  onClearSelection,
  onViewPipeline,
}: BulkActionsProps) {
  const selectedCount = selectedItems.length;

  if (selectedCount === 0) return null;

  const ids = selectedItems.map((item) => item.id);

  const exportToCSV = () => {
    const rows = selectedItems.map((item) => ({
      name: item.name,
      email: item.email,
      score: item.score,
      rank: item.rank,
      skills: item.topSkills.join("|"),
      experience: item.experience,
      education: item.education,
      trust: item.trust,
      flags: item.flagCount,
      status: item.status,
      fileName: item.fileName,
    }));
    const csv = [
      Object.keys(rows[0] || {}).join(","),
      ...rows.map((row) =>
        Object.values(row)
          .map((value) => `"${String(value).replace(/"/g, '""')}"`)
          .join(","),
      ),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `candidates-selected-${new Date().toISOString().split("T")[0]}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const exportToJSON = () => {
    const blob = new Blob([JSON.stringify(selectedItems, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `candidates-selected-${new Date().toISOString().split("T")[0]}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const copyEmails = () => {
    const emails = selectedItems
      .map((item) => item.email)
      .filter(Boolean)
      .join(", ");
    void navigator.clipboard.writeText(emails);
  };

  const copyNames = () => {
    const names = selectedItems.map((item) => item.name).join(", ");
    void navigator.clipboard.writeText(names);
  };

  return (
    <div className="fixed bottom-4 left-1/2 z-50 w-[calc(100%-1rem)] max-w-5xl -translate-x-1/2">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-background/95 px-2.5 py-2 shadow-lg backdrop-blur-sm md:px-3">
        <Badge variant="secondary" className="gap-1">
          {selectedCount} <span className="hidden md:inline">selected</span>
        </Badge>

        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2"
          onClick={onClearSelection}
        >
          <X className="size-3.5" />
          <span className="hidden md:inline">Clear</span>
        </Button>

        <div className="mx-1 h-5 w-px bg-border" />

        <Button
          size="sm"
          variant="outline"
          className="h-7 gap-1"
          onClick={() => {
            if (selectedCount === 1) onViewPipeline(ids[0]);
            onClearSelection();
          }}
        >
          <Eye className="size-3.5" />
          <span className="hidden md:inline">View Pipeline</span>
        </Button>

        <Button size="sm" variant="outline" className="h-7 gap-1">
          <Mail className="size-3.5" />
          <span className="hidden md:inline">Email</span>
        </Button>

        <Button size="sm" variant="outline" className="h-7 gap-1">
          <Calendar className="size-3.5" />
          <span className="hidden md:inline">Interview</span>
        </Button>

        <Button size="sm" variant="outline" className="h-7 gap-1">
          <Bookmark className="size-3.5" />
          <span className="hidden md:inline">Shortlist</span>
        </Button>

        <div className="mx-1 h-5 w-px bg-border" />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline" className="h-7 gap-1">
              <Sparkles className="size-3.5" />
              <span className="hidden md:inline">More</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuGroup>
              <DropdownMenuLabel>Actions</DropdownMenuLabel>
              <DropdownMenuItem>
                <RotateCcw className="size-3.5" />
                Re-run analysis
              </DropdownMenuItem>
              <DropdownMenuItem>
                <RefreshCw className="size-3.5" />
                Re-run selected phases
              </DropdownMenuItem>
              <DropdownMenuItem>
                <MessageSquare className="size-3.5" />
                Add review note
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel>Copy</DropdownMenuLabel>
              <DropdownMenuItem onClick={copyNames}>
                <Copy className="size-3.5" />
                Copy names
              </DropdownMenuItem>
              <DropdownMenuItem onClick={copyEmails}>
                <Copy className="size-3.5" />
                Copy emails
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-red-600 dark:text-red-400">
              <Trash2 className="size-3.5" />
              Remove candidates
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline" className="h-7 gap-1">
              <Download className="size-3.5" />
              <span className="hidden md:inline">Export</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={exportToCSV}>
              <FileSpreadsheet className="size-3.5" />
              Export CSV
            </DropdownMenuItem>
            <DropdownMenuItem onClick={exportToJSON}>
              <FileJson className="size-3.5" />
              Export JSON
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
