"use client";

import {
  type ColumnDef,
  type ColumnFiltersState,
  flexRender,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type RowSelectionState,
  type SortingState,
  useReactTable,
  type VisibilityState,
} from "@tanstack/react-table";
import * as React from "react";
import { DataTablePagination } from "@/components/table/data-table-pagination";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { CandidateBulkActions } from "./data-table-bulk-actions";
import { DataTableToolbar } from "./data-table-toolbar";
import type { CandidateRow } from "./schema";

const INTERACTIVE_ROW_TARGET_SELECTOR = [
  "a[href]",
  "button",
  "input",
  "select",
  "textarea",
  '[role="button"]',
  '[role="checkbox"]',
  '[role="menuitem"]',
  '[data-slot="dropdown-menu-trigger"]',
  '[data-slot="popover-trigger"]',
].join(",");

function isInteractiveRowTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    target.closest(INTERACTIVE_ROW_TARGET_SELECTOR) !== null
  );
}

interface DataTableProps<TValue> {
  columns: ColumnDef<CandidateRow, TValue>[];
  data: CandidateRow[];
  onRowClick?: (id: string) => void;
  onViewPipeline?: (id: string) => void;
}

export function DataTable<TValue>({
  columns,
  data,
  onRowClick,
  onViewPipeline,
}: DataTableProps<TValue>) {
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});
  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>({});
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(
    [],
  );
  const [sorting, setSorting] = React.useState<SortingState>([
    { id: "rank", desc: false },
  ]);

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      columnVisibility,
      columnFilters,
      rowSelection,
    },
    enableRowSelection: true,
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
  });

  const selectedCandidates = table
    .getSelectedRowModel()
    .rows.map((row) => row.original);

  return (
    <div className="space-y-3">
      <DataTableToolbar table={table} />
      <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
        <ScrollArea className="w-full">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow
                  key={headerGroup.id}
                  className="hover:bg-transparent border-b border-border/60"
                >
                  {headerGroup.headers.map((header) => (
                    <TableHead key={header.id} colSpan={header.colSpan}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows?.length ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow
                    key={row.id}
                    data-state={row.getIsSelected() && "selected"}
                    className={cn(
                      "cursor-pointer",
                      onRowClick && "hover:bg-muted/50",
                    )}
                    onClick={(event) => {
                      if (isInteractiveRowTarget(event.target)) return;
                      onRowClick?.(row.original.id);
                    }}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={columns.length} className="h-32">
                    <div className="flex flex-col items-center justify-center gap-2 text-center">
                      <div className="size-10 rounded-full bg-muted flex items-center justify-center">
                        <span className="text-lg">📋</span>
                      </div>
                      <p className="text-sm font-medium text-foreground">
                        No candidates found
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Try adjusting your filters or search query
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </div>
      <DataTablePagination table={table} />

      {onViewPipeline && (
        <CandidateBulkActions
          selectedItems={selectedCandidates}
          onClearSelection={() => setRowSelection({})}
          onViewPipeline={onViewPipeline}
        />
      )}
    </div>
  );
}
