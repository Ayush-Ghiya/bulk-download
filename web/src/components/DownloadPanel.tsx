import type React from "react";
import { useEffect, useState } from "react";
import {
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  Loader2,
  MinusCircle,
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

export function DownloadPanel({
  open,
  onClose,
  stages,
  loading,
  error,
  downloadUrl,
  count,
  cacheHit,
  onRetry,
}: Props): React.JSX.Element {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    if (!downloadUrl) return;
    void navigator.clipboard.writeText(downloadUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  // Escape closes — convenience only, never required (no focus trap).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const active = stages.find((s) => s.status === "active");
  const activeLabel = active ? STAGE_LABEL[active.id] ?? active.id : null;

  return (
    <aside
      aria-hidden={!open}
      aria-label="Download status"
      className={cn(
        "fixed right-0 top-14 z-30 flex h-[calc(100dvh-3.5rem)] w-[min(92vw,400px)] flex-col",
        "border-l border-border bg-card/95 shadow-2xl shadow-black/50 backdrop-blur-xl",
        "transition-transform duration-300 ease-out will-change-transform",
        open ? "translate-x-0" : "pointer-events-none translate-x-full",
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
        <div className="flex flex-col gap-1">
          <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            Bulk download
          </span>
          <h2 className="text-lg font-semibold tracking-tight text-foreground">
            {error ? "Download failed" : downloadUrl ? "Archive ready" : "Building archive"}
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close panel"
          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        {error ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5">
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
              <p className="break-words text-sm text-muted-foreground">{error}</p>
            </div>
            <Button size="sm" onClick={onRetry} className="w-fit">
              Try again
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            {/* Live status line — connected to the flow animation */}
            <div className="flex items-center gap-2.5 rounded-lg border border-border bg-muted/40 px-3 py-2.5">
              {loading ? (
                <Loader2 className="size-4 shrink-0 animate-spin text-primary" />
              ) : (
                <CheckCircle2 className="size-4 shrink-0 text-primary" />
              )}
              <span className="text-sm text-foreground">
                {loading
                  ? activeLabel
                    ? `${activeLabel}…`
                    : "Starting…"
                  : downloadUrl
                    ? `${count} asset${count === 1 ? "" : "s"} packaged`
                    : "Done"}
              </span>
            </div>

            {/* Compact live checklist mirroring the pipeline */}
            <ol className="flex flex-col gap-1.5">
              {stages.map((s) => {
                const label = STAGE_LABEL[s.id] ?? s.id;
                return (
                  <li
                    key={s.id}
                    className={cn(
                      "flex items-center gap-2.5 text-sm",
                      s.status === "active"
                        ? "text-foreground"
                        : s.status === "done"
                          ? "text-muted-foreground"
                          : "text-muted-foreground/50",
                    )}
                  >
                    {s.status === "active" ? (
                      <Loader2 className="size-3.5 shrink-0 animate-spin text-primary" />
                    ) : s.status === "done" ? (
                      <CheckCircle2 className="size-3.5 shrink-0 text-primary/80" />
                    ) : s.status === "skipped" ? (
                      <MinusCircle className="size-3.5 shrink-0 text-muted-foreground/60" />
                    ) : s.status === "error" ? (
                      <TriangleAlert className="size-3.5 shrink-0 text-destructive" />
                    ) : (
                      <span className="ml-1 size-1.5 shrink-0 rounded-full bg-muted-foreground/40" />
                    )}
                    <span className={cn("truncate", s.status === "active" && "text-glow")}>
                      {label}
                    </span>
                    {s.detail ? (
                      <span className="ml-auto shrink-0 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                        {s.detail}
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ol>

            {/* Result */}
            {downloadUrl ? (
              <div className="flex flex-col gap-3 border-t border-border pt-4">
                <div className="flex items-center gap-2">
                  <Badge
                    variant="outline"
                    className={cn(
                      "gap-1.5 font-mono",
                      cacheHit
                        ? "border-primary/50 text-primary"
                        : "text-muted-foreground",
                    )}
                  >
                    <span
                      className={cn(
                        "size-1.5 rounded-full",
                        cacheHit ? "bg-primary" : "bg-muted-foreground/60",
                      )}
                    />
                    {cacheHit ? "CACHE HIT" : "CACHE MISS"}
                  </Badge>
                  <Badge variant="outline" className="font-mono text-muted-foreground">
                    {count} asset{count === 1 ? "" : "s"}
                  </Badge>
                </div>

                <div className="rounded-lg border border-border bg-muted/40 px-3 py-2.5">
                  <p className="select-all break-all font-mono text-xs text-muted-foreground">
                    {downloadUrl}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <Button size="sm" onClick={copy} className="gap-1.5">
                    {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                    {copied ? "Copied" : "Copy link"}
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
            ) : null}
          </div>
        )}
      </div>
    </aside>
  );
}
