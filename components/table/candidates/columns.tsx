"use client";

import type { ColumnDef } from "@tanstack/react-table";
import {
  Briefcase,
  ChevronRight,
  FileText,
  GraduationCap,
  Shield,
} from "lucide-react";
import { DataTableColumnHeader } from "@/components/table/data-table-column-header";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { type Flag, FlagsPopover } from "@/components/workflow/flags-popover";
import { cn } from "@/lib/utils";
import { getSkillIcon } from "@/utils/mappings";
import { CandidateAvatar } from "./candidate-avatar";
import { DataTableRowActions } from "./data-table-row-actions";
import type { CandidateRow } from "./schema";

interface ColumnOptions {
  onAskCandidate: (id: string) => void;
  onViewPipeline: (id: string) => void;
  onViewDetails: (id: string) => void;
  getFlags: (candidate: CandidateRow) => Flag[];
}

const statusConfig: Record<
  string,
  { color: string; dotColor: string; label: string }
> = {
  completed: {
    color: "text-emerald-500",
    dotColor: "bg-emerald-500",
    label: "Completed",
  },
  processing: {
    color: "text-blue-500",
    dotColor: "bg-blue-500",
    label: "Processing",
  },
  pending: {
    color: "text-muted-foreground/40",
    dotColor: "bg-muted-foreground/30",
    label: "Pending",
  },
  failed: { color: "text-red-500", dotColor: "bg-red-500", label: "Failed" },
};

// ── Donut gauge for score ────────────────────────────────────────────────────

function DonutScore({ score }: { score: number }) {
  const color =
    score >= 80
      ? "stroke-emerald-500"
      : score >= 65
        ? "stroke-amber-500"
        : "stroke-red-500";
  const textColor =
    score >= 80
      ? "text-emerald-600 dark:text-emerald-400"
      : score >= 65
        ? "text-amber-600 dark:text-amber-400"
        : "text-red-600 dark:text-red-400";
  const radius = 14;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="flex items-center gap-2">
      <div className="relative size-9 shrink-0">
        <svg
          aria-hidden="true"
          className="size-9 -rotate-90"
          focusable="false"
          viewBox="0 0 36 36"
        >
          <circle
            cx="18"
            cy="18"
            r={radius}
            fill="none"
            strokeWidth="3"
            className="stroke-muted"
          />
          <circle
            cx="18"
            cy="18"
            r={radius}
            fill="none"
            strokeWidth="3"
            strokeLinecap="round"
            className={cn("transition-all duration-500", color)}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={cn("text-[11px] font-bold tabular-nums", textColor)}>
            {score}
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Trust donut gauge ────────────────────────────────────────────────────────

function TrustGauge({ trust }: { trust: number }) {
  const color =
    trust >= 85
      ? "stroke-emerald-500"
      : trust >= 70
        ? "stroke-amber-500"
        : "stroke-red-500";
  const iconColor =
    trust >= 85
      ? "text-emerald-500"
      : trust >= 70
        ? "text-amber-500"
        : "text-red-500";
  const textColor =
    trust >= 85
      ? "text-emerald-600 dark:text-emerald-400"
      : trust >= 70
        ? "text-amber-600 dark:text-amber-400"
        : "text-red-600 dark:text-red-400";
  const radius = 10;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (trust / 100) * circumference;

  return (
    <div className="flex items-center gap-1.5">
      <svg
        aria-hidden="true"
        className="size-7 -rotate-90"
        focusable="false"
        viewBox="0 0 28 28"
      >
        <circle
          cx="14"
          cy="14"
          r={radius}
          fill="none"
          strokeWidth="2.5"
          className="stroke-muted"
        />
        <circle
          cx="14"
          cy="14"
          r={radius}
          fill="none"
          strokeWidth="2.5"
          strokeLinecap="round"
          className={cn("transition-all duration-500", color)}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
        <foreignObject x="0" y="0" width="28" height="28">
          <div className="flex size-full items-center justify-center">
            <Shield className={cn("size-2.5 rotate-90", iconColor)} />
          </div>
        </foreignObject>
      </svg>
      <span className={cn("text-[11px] font-semibold tabular-nums", textColor)}>
        {trust}
      </span>
    </div>
  );
}

// ── Columns ──────────────────────────────────────────────────────────────────

export function createCandidateColumns({
  onAskCandidate,
  onViewPipeline,
  onViewDetails,
  getFlags,
}: ColumnOptions): ColumnDef<CandidateRow>[] {
  return [
    {
      id: "select",
      header: ({ table }) => (
        <Checkbox
          id="select-all-candidates"
          name="select-all-candidates"
          checked={
            table.getIsAllPageRowsSelected() ||
            (table.getIsSomePageRowsSelected() && "indeterminate")
          }
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Select all"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          id={`select-candidate-${row.original.id}`}
          name="selected-candidates"
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          onClick={(event) => event.stopPropagation()}
          aria-label="Select row"
        />
      ),
      enableSorting: false,
      enableHiding: false,
      size: 32,
    },
    {
      accessorKey: "rank",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="#" />
      ),
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground tabular-nums font-medium">
          #{row.original.rank}
        </span>
      ),
      size: 40,
    },
    {
      accessorKey: "name",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Candidate" />
      ),
      cell: ({ row }) => (
        <div className="flex items-center gap-2.5">
          <CandidateAvatar
            src={row.original.avatar}
            name={row.original.name}
            className="size-8"
          />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <FileText className="size-3 text-muted-foreground/50 shrink-0" />
              <span className="text-[13px] font-medium text-foreground truncate">
                {row.original.name}
              </span>
            </div>
            <div className="text-[11px] text-muted-foreground truncate">
              {row.original.fileName}
            </div>
          </div>
        </div>
      ),
    },
    {
      accessorKey: "score",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Score" />
      ),
      cell: ({ row }) => <DonutScore score={row.original.score} />,
      size: 60,
    },
    {
      accessorKey: "topSkills",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Skills" />
      ),
      cell: ({ row }) => (
        <div className="flex gap-1 flex-wrap max-w-[180px]">
          {row.original.topSkills.slice(0, 3).map((s) => {
            const Icon = getSkillIcon(s);
            return (
              <Badge
                key={s}
                variant="secondary"
                className="text-[10px] px-1.5 py-0 h-4 font-medium gap-1"
              >
                {Icon && <Icon className="size-2.5" />}
                {s}
              </Badge>
            );
          })}
          {row.original.topSkills.length > 3 && (
            <span className="text-[10px] text-muted-foreground">
              +{row.original.topSkills.length - 3}
            </span>
          )}
        </div>
      ),
      filterFn: (row, id, value) => {
        const skills = row.getValue(id) as string[];
        const filterValue = value as string[];
        if (!filterValue || filterValue.length === 0) return true;
        return skills.some((s) => filterValue.includes(s));
      },
    },
    {
      accessorKey: "status",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Status" />
      ),
      cell: ({ row }) => {
        const status = row.original.status;
        const config = statusConfig[status];
        if (!config) return null;
        return (
          <div className="flex items-center gap-1.5">
            <div
              className={cn(
                "size-1.5 rounded-full",
                config.dotColor,
                status === "processing" && "animate-pulse",
              )}
            />
            <span className="text-xs text-muted-foreground">
              {config.label}
            </span>
          </div>
        );
      },
      filterFn: (row, id, value) => {
        const rowValue = row.getValue(id) as string;
        const filterValue = value as string[];
        if (!filterValue || filterValue.length === 0) return true;
        return filterValue.includes(rowValue);
      },
      size: 100,
    },
    {
      accessorKey: "experience",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Exp" />
      ),
      cell: ({ row }) => (
        <div className="flex items-center gap-1.5">
          <Briefcase className="size-3 text-muted-foreground/50" />
          <span className="text-xs text-muted-foreground">
            {row.original.experience}
          </span>
        </div>
      ),
      size: 70,
    },
    {
      accessorKey: "education",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Education" />
      ),
      cell: ({ row }) => (
        <div className="flex items-center gap-1.5">
          <GraduationCap className="size-3 text-muted-foreground/50" />
          <span className="text-xs text-muted-foreground truncate max-w-[120px]">
            {row.original.education}
          </span>
        </div>
      ),
    },
    {
      accessorKey: "trust",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Trust" />
      ),
      cell: ({ row }) => <TrustGauge trust={row.original.trust} />,
      size: 100,
    },
    {
      accessorKey: "flagCount",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Flags" />
      ),
      cell: ({ row }) => {
        const flags = getFlags(row.original);
        if (flags.length === 0)
          return <span className="text-xs text-muted-foreground">—</span>;
        return <FlagsPopover flags={flags} />;
      },
      size: 70,
    },
    {
      id: "actions",
      cell: ({ row }) => (
        <div className="flex items-center justify-end gap-0.5">
          <button
            type="button"
            className="inline-flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-1.5 py-1 rounded"
            onClick={(event) => {
              event.stopPropagation();
              onViewPipeline(row.original.id);
            }}
          >
            View
            <ChevronRight className="size-3" />
          </button>
          <DataTableRowActions
            row={row}
            onAskCandidate={onAskCandidate}
            onViewDetails={onViewDetails}
            onViewPipeline={onViewPipeline}
          />
        </div>
      ),
      size: 70,
    },
  ];
}
