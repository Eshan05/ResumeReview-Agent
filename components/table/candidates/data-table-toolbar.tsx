"use client";

import type { Table } from "@tanstack/react-table";
import { Search, X } from "lucide-react";
import { DataTableFacetedFilter } from "@/components/table/data-table-faceted-filter";
import { DataTableViewOptions } from "@/components/table/data-table-view-options";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface DataTableToolbarProps<TData> {
  table: Table<TData>;
}

const statusOptions = [
  { label: "Completed", value: "completed" },
  { label: "Processing", value: "processing" },
  { label: "Pending", value: "pending" },
  { label: "Failed", value: "failed" },
];

const skillOptions = [
  { label: "TypeScript", value: "TypeScript" },
  { label: "React", value: "React" },
  { label: "Next.js", value: "Next.js" },
  { label: "Python", value: "Python" },
  { label: "Java", value: "Java" },
  { label: "Go", value: "Go" },
  { label: "Node.js", value: "Node.js" },
  { label: "AWS", value: "AWS" },
  { label: "Docker", value: "Docker" },
  { label: "PostgreSQL", value: "PostgreSQL" },
];

const idToName: Record<string, string> = {
  rank: "#",
  name: "Candidate",
  score: "Score",
  topSkills: "Skills",
  status: "Status",
  experience: "Exp",
  trust: "Trust",
  flagCount: "Flags",
};

export function DataTableToolbar<TData>({
  table,
}: DataTableToolbarProps<TData>) {
  const isFiltered = table.getState().columnFilters.length > 0;

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex flex-1 items-center gap-2">
        <div className="relative">
          <Input
            id="candidate-search"
            name="candidate-search"
            placeholder="Search candidates..."
            value={(table.getColumn("name")?.getFilterValue() as string) ?? ""}
            onChange={(event) =>
              table.getColumn("name")?.setFilterValue(event.target.value)
            }
            className="h-8 w-[200px] ps-8 text-xs"
          />
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
        </div>

        {table.getColumn("status") && (
          <DataTableFacetedFilter
            column={table.getColumn("status")}
            title="Status"
            options={statusOptions}
          />
        )}

        {table.getColumn("topSkills") && (
          <DataTableFacetedFilter
            column={table.getColumn("topSkills")}
            title="Skills"
            options={skillOptions}
            popoverWidth="w-56"
          />
        )}

        {isFiltered && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => table.resetColumnFilters()}
            className="h-8 px-2 text-xs"
          >
            Reset
            <X className="size-3.5 ml-1" />
          </Button>
        )}
      </div>

      <DataTableViewOptions table={table} idToName={idToName} />
    </div>
  );
}
