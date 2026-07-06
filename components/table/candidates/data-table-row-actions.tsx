"use client";

import type { Row } from "@tanstack/react-table";
import {
  Calendar,
  Eye,
  Mail,
  MessageSquare,
  MoreHorizontal,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { CandidateRow } from "./schema";

interface DataTableRowActionsProps {
  row: Row<CandidateRow>;
  onAskCandidate: (id: string) => void;
  onViewDetails: (id: string) => void;
  onViewPipeline: (id: string) => void;
}

export function DataTableRowActions({
  onAskCandidate,
  row,
  onViewDetails,
  onViewPipeline,
}: DataTableRowActionsProps) {
  const candidate = row.original;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className="size-7 data-[state=open]:bg-muted"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <MoreHorizontal className="size-3.5" />
          <span className="sr-only">Open menu</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem
          onClick={(event) => {
            event.stopPropagation();
            onViewDetails(candidate.id);
          }}
        >
          <Eye className="size-3.5" />
          View details
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={(event) => {
            event.stopPropagation();
            onViewPipeline(candidate.id);
          }}
        >
          <Eye className="size-3.5" />
          View pipeline
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={(event) => {
            event.stopPropagation();
            onAskCandidate(candidate.id);
          }}
        >
          <MessageSquare className="size-3.5" />
          Ask about candidate
        </DropdownMenuItem>
        <DropdownMenuItem>
          <Mail className="size-3.5" />
          Draft outreach email
        </DropdownMenuItem>
        <DropdownMenuItem>
          <Calendar className="size-3.5" />
          Schedule interview
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-red-600 dark:text-red-400">
          <Trash2 className="size-3.5" />
          Remove candidate
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
