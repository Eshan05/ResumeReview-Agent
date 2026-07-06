"use client";

import {
  Bot,
  ExternalLink,
  Loader2,
  Search,
  Send,
  Sparkles,
} from "lucide-react";
import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import type {
  CandidateAskResponse,
  CandidateCrawlResponse,
  CandidateRow,
  JobContext,
} from "@/lib/candidates/types";

interface CandidateAskSheetProps {
  candidate?: CandidateRow;
  job: JobContext;
  mode: "candidate" | "job";
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CandidateAskSheet({
  candidate,
  job,
  mode,
  open,
  onOpenChange,
}: CandidateAskSheetProps) {
  const [question, setQuestion] = React.useState("");
  const [answer, setAnswer] = React.useState<CandidateAskResponse | null>(null);
  const [crawlStatus, setCrawlStatus] =
    React.useState<CandidateCrawlResponse | null>(null);
  const [activeQuestion, setActiveQuestion] = React.useState<string | null>(
    null,
  );
  const [error, setError] = React.useState<string | null>(null);
  const [isAsking, setIsAsking] = React.useState(false);
  const [isCrawling, setIsCrawling] = React.useState(false);
  const title =
    mode === "candidate" && candidate
      ? `Ask about ${candidate.name}`
      : `Ask about ${job.title}`;
  const placeholder =
    mode === "candidate"
      ? "Why did this candidate get this score?"
      : "Compare the strongest candidates for this role.";
  React.useEffect(() => {
    if (!open) return;
    setQuestion("");
    setAnswer(null);
    setCrawlStatus(null);
    setActiveQuestion(null);
    setError(null);
  }, [open]);

  const requestAsk = React.useCallback(
    async (
      trimmed: string,
      options: { preserveCrawlStatus?: boolean } = {},
    ) => {
      setIsAsking(true);
      setError(null);
      if (!options.preserveCrawlStatus) {
        setCrawlStatus(null);
      }

      try {
        const endpoint =
          mode === "candidate" && candidate
            ? `/api/candidates/${encodeURIComponent(candidate.id)}/ask`
            : `/api/jobs/${encodeURIComponent(job.id)}/ask`;
        const response = await fetch(endpoint, {
          body: JSON.stringify({ question: trimmed }),
          cache: "no-store",
          headers: { "content-type": "application/json" },
          method: "POST",
        });

        if (!response.ok) {
          throw new Error("Ask request failed.");
        }

        setAnswer((await response.json()) as CandidateAskResponse);
        setActiveQuestion(trimmed);
      } catch (askError) {
        setError(
          askError instanceof Error ? askError.message : "Ask request failed.",
        );
      } finally {
        setIsAsking(false);
      }
    },
    [candidate, job.id, mode],
  );

  async function submitAsk(event?: React.FormEvent) {
    event?.preventDefault();
    const trimmed = question.trim();
    if (!trimmed) return;
    await requestAsk(trimmed);
  }

  async function runCrawl() {
    if (!candidate || !answer?.crawlRequest) return;
    setIsCrawling(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/candidates/${encodeURIComponent(candidate.id)}/crawl`,
        {
          body: JSON.stringify({ reason: answer.crawlRequest.reason }),
          cache: "no-store",
          headers: { "content-type": "application/json" },
          method: "POST",
        },
      );

      if (!response.ok) {
        throw new Error("Crawl request failed.");
      }

      setCrawlStatus((await response.json()) as CandidateCrawlResponse);
    } catch (crawlError) {
      setError(
        crawlError instanceof Error
          ? crawlError.message
          : "Crawl request failed.",
      );
    } finally {
      setIsCrawling(false);
    }
  }

  React.useEffect(() => {
    if (!(open && candidate && crawlStatus?.id && activeQuestion)) return;
    if (!isPendingCrawlStatus(crawlStatus.status)) return;

    let cancelled = false;
    const timeoutId = window.setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/candidates/${encodeURIComponent(
            candidate.id,
          )}/crawl?runId=${encodeURIComponent(crawlStatus.id ?? "")}`,
          { cache: "no-store" },
        );

        if (!response.ok) {
          throw new Error("Could not refresh crawl status.");
        }

        const nextStatus = (await response.json()) as CandidateCrawlResponse;
        if (cancelled) return;

        setCrawlStatus(nextStatus);
        if (nextStatus.status === "completed") {
          await requestAsk(activeQuestion, { preserveCrawlStatus: true });
        } else if (
          nextStatus.status === "failed" ||
          nextStatus.status === "skipped"
        ) {
          setError(nextStatus.error ?? "Crawl did not add new evidence.");
        }
      } catch (crawlError) {
        if (!cancelled) {
          setError(
            crawlError instanceof Error
              ? crawlError.message
              : "Could not refresh crawl status.",
          );
        }
      }
    }, 2500);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [
    activeQuestion,
    candidate,
    crawlStatus?.id,
    crawlStatus?.status,
    open,
    requestAsk,
  ]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[94vw] gap-0 overflow-hidden p-0 sm:max-w-xl">
        <SheetHeader className="border-b border-border/50 p-5">
          <SheetTitle className="flex items-center gap-2">
            <Bot aria-hidden="true" className="size-4 text-muted-foreground" />
            {title}
          </SheetTitle>
          <SheetDescription>
            Answers use stored resume, pipeline, scoring, and crawl evidence
            with citations.
          </SheetDescription>
        </SheetHeader>

        <form className="border-b border-border/50 p-4" onSubmit={submitAsk}>
          <div className="flex gap-2">
            <Textarea
              className="min-h-20 resize-none"
              value={question}
              placeholder={placeholder}
              onChange={(event) => setQuestion(event.target.value)}
            />
            <Button
              type="submit"
              className="h-20 w-11 shrink-0"
              disabled={isAsking || !question.trim()}
              size="icon"
            >
              {isAsking ? (
                <Loader2 aria-hidden="true" className="size-4 animate-spin" />
              ) : (
                <Send aria-hidden="true" className="size-4" />
              )}
              <span className="sr-only">Ask</span>
            </Button>
          </div>
        </form>

        <ScrollArea className="flex-1">
          <div className="space-y-4 p-4">
            {!answer && !error && (
              <div className="rounded-md border border-border/60 p-4 text-sm text-muted-foreground">
                Evidence ready.
              </div>
            )}

            {error && (
              <div className="rounded-md border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-600 dark:text-red-400">
                {error}
              </div>
            )}

            {answer && (
              <>
                <section className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-foreground">
                      Answer
                    </h3>
                    <Badge variant="secondary" className="text-[10px]">
                      {answer.confidence} confidence
                    </Badge>
                  </div>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                    {answer.answer}
                  </p>
                </section>

                {answer.citations.length > 0 && (
                  <section className="space-y-2">
                    <h3 className="text-sm font-semibold text-foreground">
                      Citations
                    </h3>
                    <div className="space-y-2">
                      {answer.citations.map((citation) => (
                        <div
                          key={citation.chunkId}
                          className="rounded-md border border-border/60 p-3"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-medium text-foreground">
                              {citation.title}
                            </span>
                            <Badge variant="outline" className="text-[9px]">
                              {citation.sourceType}
                            </Badge>
                          </div>
                          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                            {citation.snippet}
                          </p>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {answer.gaps.length > 0 && (
                  <section className="space-y-2">
                    <h3 className="text-sm font-semibold text-foreground">
                      Evidence Gaps
                    </h3>
                    <ul className="space-y-1 text-xs text-muted-foreground">
                      {answer.gaps.map((gap) => (
                        <li key={gap}>- {gap}</li>
                      ))}
                    </ul>
                  </section>
                )}

                {answer.needsCrawl && answer.crawlRequest && candidate && (
                  <section className="rounded-md border border-border/60 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-semibold text-foreground">
                          Public Evidence Crawl
                        </h3>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {answer.crawlRequest.reason}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-1">
                          {answer.crawlRequest.urls.slice(0, 4).map((url) => (
                            <Badge
                              key={url}
                              variant="outline"
                              className="max-w-48 truncate text-[9px]"
                            >
                              <ExternalLink
                                aria-hidden="true"
                                className="size-2.5"
                              />
                              {url}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={isCrawling}
                        onClick={runCrawl}
                      >
                        {isCrawling ? (
                          <Loader2
                            aria-hidden="true"
                            className="size-3.5 animate-spin"
                          />
                        ) : (
                          <Search aria-hidden="true" className="size-3.5" />
                        )}
                        Run crawl
                      </Button>
                    </div>
                    {crawlStatus && (
                      <p className="mt-2 text-xs text-muted-foreground">
                        Crawl {crawlStatus.status}
                        {crawlStatus.workflowRunId
                          ? `: ${crawlStatus.workflowRunId}`
                          : crawlStatus.reason
                            ? `: ${crawlStatus.reason}`
                            : ""}
                      </p>
                    )}
                  </section>
                )}

                {answer.followUps.length > 0 && (
                  <section className="space-y-2">
                    <h3 className="text-sm font-semibold text-foreground">
                      Follow-ups
                    </h3>
                    <div className="flex flex-wrap gap-1.5">
                      {answer.followUps.map((followUp) => (
                        <Button
                          key={followUp}
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-auto min-h-7 whitespace-normal text-left text-xs"
                          onClick={() => setQuestion(followUp)}
                        >
                          <Sparkles aria-hidden="true" className="size-3" />
                          {followUp}
                        </Button>
                      ))}
                    </div>
                  </section>
                )}
              </>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

function isPendingCrawlStatus(status: CandidateCrawlResponse["status"]) {
  return status === "queued" || status === "triggered" || status === "running";
}
