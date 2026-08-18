import type React from "react";
import { useEffect, useState } from "react";
import {
  Check,
  ChevronDown,
  Copy,
  ExternalLink,
  Loader2,
  TriangleAlert,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FLOW_STAGES } from "@/lib/flowStages";
import type { StageState } from "@/hooks/useBulkDownload";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onClose: () => void;
  stages: StageState[];
  loading: boolean;
  error: string | null;
  downloadUrl: string | null;
  count: number;
  cacheHit: boolean | null;
  onRetry: () => void;
}

const STAGE_LABEL: Record<string, string> = Object.fromEntries(
  FLOW_STAGES.map((s) => [s.id, s.label]),
);

export function DownloadDock({
  open,
  onClose,
  stages,
  loading,
  error,
  downloadUrl,
  count,
  cacheHit,
  onRetry,
}: Props): React.JSX.Element | null {
  const [copied, setCopied] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  // Every fresh run should re-expand the dock.
  useEffect(() => {
    if (loading) setCollapsed(false);
  }, [loading]);

  const copy = () => {
    if (!downloadUrl) return;
    void navigator.clipboard.writeText(downloadUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (!open) return null;

  const active = stages.find((s) => s.status === "active");
  const activeLabel = active ? STAGE_LABEL[active.id] ?? active.id : null;
  const doneCount = stages.filter((s) => s.status === "done" || s.status === "skipped").length;
  const total = stages.length;

  const statusWord = error
    ? "Failed"
    : downloadUrl
      ? "Ready"
      : loading
        ? "Running"
        : "Idle";

  // Short one-glance label for the collapsed pill.
  const glanceLabel = error
    ? "Failed"
    : downloadUrl
      ? cacheHit === null
        ? "Archive ready"
        : `Archive ready · ${cacheHit ? "HIT" : "MISS"}`
      : loading
        ? activeLabel
          ? `${activeLabel}…`
          : "Starting…"
        : "Idle";

  const dotClass = error
    ? "bg-destructive"
    : loading
      ? "bg-primary animate-pulse"
      : "bg-primary";

  const baseAnim =
    "motion-safe:animate-[dock-in_260ms_cubic-bezier(0.16,1,0.3,1)] motion-reduce:animate-none";

  // Collapsed launcher pill.
  if (collapsed) {
    return (
      <div
        className={cn(
          "fixed bottom-4 right-4 z-40",
          baseAnim,
        )}
      >
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          aria-label="Expand download status"
          className={cn(
            "flex items-center gap-2.5 rounded-full border border-border bg-card/95 py-2 pl-3 pr-3.5",
            "shadow-2xl shadow-black/50 backdrop-blur-xl transition-colors hover:bg-accent",
            !error && "glow-sm",
          )}
        >
          <span className={cn("size-1.5 shrink-0 rounded-full", dotClass)} />
          <span className="max-w-[200px] truncate text-xs font-medium text-foreground">
            {glanceLabel}
          </span>
        </button>
      </div>
    );
  }

  return (
    <aside
      aria-label="Download status"
      className={cn(
        "fixed bottom-4 right-4 z-40 flex w-[336px] max-w-[calc(100vw-2rem)] flex-col",
        "edge-glow rounded-2xl border border-border bg-card/95 shadow-2xl shadow-black/50 backdrop-blur-xl",
        baseAnim,
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className={cn("size-1.5 shrink-0 rounded-full", dotClass)} />
          <span className="text-sm font-semibold tracking-tight text-foreground">Download</span>
          <span className="truncate font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
            {statusWord}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            onClick={() => setCollapsed(true)}
            aria-label="Collapse panel"
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <ChevronDown className="size-4" />
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Dismiss panel"
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="px-4 py-3.5">
        {error ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5">
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
              <p className="break-words text-xs leading-relaxed text-muted-foreground">{error}</p>
            </div>
            <Button size="sm" onClick={onRetry} className="w-fit">
              Retry
            </Button>
          </div>
        ) : downloadUrl ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Badge
                variant="outline"
                className={cn(
                  "gap-1.5 font-mono",
                  cacheHit ? "border-primary/50 text-primary" : "text-muted-foreground",
                )}
              >
                <span
                  className={cn(
                    "size-1.5 rounded-full",
                    cacheHit ? "bg-primary" : "bg-muted-foreground/60",
                  )}
                />
                {cacheHit ? "HIT" : "MISS"}
              </Badge>
              <Badge variant="outline" className="font-mono text-muted-foreground">
                {count} asset{count === 1 ? "" : "s"}
              </Badge>
            </div>

            <div className="overflow-x-auto rounded-lg border border-border bg-muted/40 px-3 py-2">
              <p className="select-all whitespace-nowrap font-mono text-[11px] text-muted-foreground">
                {downloadUrl}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Button size="sm" onClick={copy} className="gap-1.5">
                {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                {copied ? "Copied" : "Copy"}
              </Button>
              <a
                href={downloadUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent"
              >
                <ExternalLink className="size-3.5" /> Open
              </a>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            <div className="flex items-center gap-2.5">
              <span className="relative flex size-2 shrink-0">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary/70 motion-reduce:hidden" />
                <span className="relative inline-flex size-2 rounded-full bg-primary" />
              </span>
              <span className="truncate text-sm text-foreground">
                {activeLabel ? `${activeLabel}…` : "Starting…"}
              </span>
              <span className="ml-auto shrink-0 font-mono text-[11px] text-muted-foreground">
                {doneCount} / {total}
              </span>
            </div>
            {/* Thin progress bar */}
            <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out"
                style={{ width: `${total ? (doneCount / total) * 100 : 0}%` }}
              />
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
