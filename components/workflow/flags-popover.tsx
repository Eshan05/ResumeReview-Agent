"use client";

import { AlertTriangle, CheckCircle2, ChevronDown, Shield } from "lucide-react";
import * as React from "react";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { Flag } from "@/lib/candidates/types";
import { cn } from "@/lib/utils";

export type { Flag } from "@/lib/candidates/types";

interface FlagsPopoverProps {
  flags: Flag[];
  trigger?: React.ReactElement<TriggerGuardProps>;
  className?: string;
}

type TriggerGuardProps = {
  onClick?: React.MouseEventHandler<HTMLElement>;
  onPointerDown?: React.PointerEventHandler<HTMLElement>;
  type?: "button" | "submit" | "reset";
};

const flagConfig: Record<
  Flag["type"],
  { icon: React.ElementType; color: string; bg: string; border: string }
> = {
  red: {
    icon: AlertTriangle,
    color: "text-red-600 dark:text-red-400",
    bg: "bg-red-50 dark:bg-red-500/10",
    border: "border-red-200 dark:border-red-500/20",
  },
  amber: {
    icon: AlertTriangle,
    color: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-50 dark:bg-amber-500/10",
    border: "border-amber-200 dark:border-amber-500/20",
  },
  green: {
    icon: CheckCircle2,
    color: "text-emerald-600 dark:text-emerald-400",
    bg: "bg-emerald-50 dark:bg-emerald-500/10",
    border: "border-emerald-200 dark:border-emerald-500/20",
  },
};

function composeEventHandlers<Event extends React.SyntheticEvent>(
  userHandler: ((event: Event) => void) | undefined,
  guardHandler: (event: Event) => void,
) {
  return (event: Event) => {
    userHandler?.(event);
    guardHandler(event);
  };
}

function stopRowPropagation(event: React.SyntheticEvent) {
  event.stopPropagation();
}

function withRowPropagationGuard(
  trigger: React.ReactElement<TriggerGuardProps>,
) {
  const buttonType =
    trigger.type === "button" ? { type: trigger.props.type ?? "button" } : {};

  return React.cloneElement(trigger, {
    ...buttonType,
    onClick: composeEventHandlers(trigger.props.onClick, stopRowPropagation),
    onPointerDown: composeEventHandlers(
      trigger.props.onPointerDown,
      stopRowPropagation,
    ),
  });
}

export function FlagsPopover({ flags, trigger, className }: FlagsPopoverProps) {
  const redCount = flags.filter((f) => f.type === "red").length;
  const amberCount = flags.filter((f) => f.type === "amber").length;
  const greenCount = flags.filter((f) => f.type === "green").length;

  const defaultTrigger = (
    <button
      className={cn(
        "flex items-center gap-1 text-[10px] text-muted-foreground transition-colors hover:text-foreground",
        className,
      )}
      type="button"
    >
      <Shield className="size-2.5" />
      {flags.length} flag{flags.length !== 1 ? "s" : ""}
      {redCount > 0 && <span className="text-red-500">{redCount}</span>}
      {amberCount > 0 && <span className="text-amber-500">{amberCount}</span>}
      {greenCount > 0 && <span className="text-emerald-500">{greenCount}</span>}
      <ChevronDown className="size-2.5" />
    </button>
  );

  return (
    <Popover>
      <PopoverTrigger asChild>
        {withRowPropagationGuard(trigger || defaultTrigger)}
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start" side="top">
        <div className="px-3 py-2 border-b border-border/40">
          <p className="text-[11px] font-medium text-foreground">
            Candidate Flags
          </p>
          <p className="text-[10px] text-muted-foreground">
            {flags.length} total
          </p>
        </div>
        <div className="max-h-48 overflow-y-auto">
          {flags.length === 0 ? (
            <div className="px-3 py-4 text-center text-[11px] text-muted-foreground">
              No flags detected
            </div>
          ) : (
            <div className="p-1.5">
              {flags.map((flag) => {
                const config = flagConfig[flag.type];
                const Icon = config.icon;
                return (
                  <div
                    key={`${flag.type}-${flag.label}-${flag.detail ?? "none"}`}
                    className={cn(
                      "flex items-start gap-2 rounded-md px-2.5 py-2",
                      config.bg,
                    )}
                  >
                    <Icon
                      className={cn("size-3.5 mt-0.5 shrink-0", config.color)}
                    />
                    <div className="min-w-0">
                      <p className="text-[11px] font-medium text-foreground">
                        {flag.label}
                      </p>
                      {flag.detail && (
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {flag.detail}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
