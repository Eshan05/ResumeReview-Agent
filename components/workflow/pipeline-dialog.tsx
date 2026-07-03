"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  type WorkflowPhase,
  WorkflowView,
  type WorkflowViewProps,
} from "@/components/workflow";

interface PipelineDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  candidateName: string;
  fileName: string;
  phases: WorkflowPhase[];
  elapsed?: string;
  overallStatus?: WorkflowViewProps["overallStatus"];
}

export function PipelineDialog({
  open,
  onOpenChange,
  candidateName,
  fileName,
  phases,
  elapsed,
  overallStatus = "completed",
}: PipelineDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[900px] sm:max-w-[900px] w-[95vw] max-h-[85vh] overflow-hidden p-0 gap-0">
        <DialogTitle className="sr-only">
          {candidateName} — Pipeline
        </DialogTitle>
        <DialogDescription className="sr-only">
          Pipeline status and phase details for {candidateName}.
        </DialogDescription>
        <div className="overflow-y-auto max-h-[85vh]">
          <WorkflowView
            resumeName={fileName}
            phases={phases}
            overallStatus={overallStatus}
            elapsed={elapsed}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
