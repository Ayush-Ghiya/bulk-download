import type React from "react";
import { useState } from "react";
import { Check, Copy, ExternalLink, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loading: boolean;
  error: string | null;
  downloadUrl: string | null;
  count: number;
  cacheHit: boolean | null;
  onRetry: () => void;
}

export function BulkDownloadModal({
  open, onOpenChange, loading, error, downloadUrl, count, cacheHit, onRetry,
}: Props): React.JSX.Element {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    if (!downloadUrl) return;
    void navigator.clipboard.writeText(downloadUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Download selected assets</DialogTitle>
          <DialogDescription>
            {loading
              ? "Preparing your signed download link…"
              : downloadUrl
                ? `A ZIP with ${count} asset${count === 1 ? "" : "s"} is ready${cacheHit ? " (served from cache)" : ""}.`
                : "Something went wrong."}
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5">
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
              <p className="text-sm text-muted-foreground break-words">{error}</p>
            </div>
            <div className="flex justify-end">
              <Button size="sm" onClick={onRetry}>Try again</Button>
            </div>
          </div>
        ) : downloadUrl ? (
          <div className="flex flex-col gap-3">
            <div className="rounded-lg border bg-muted/40 px-3 py-2.5">
              <p className="select-all break-all font-mono text-xs text-muted-foreground">
                {downloadUrl}
              </p>
            </div>
            <div className="flex items-center justify-end gap-2">
              <a
                href={downloadUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium hover:bg-accent"
              >
                <ExternalLink className="size-3.5" /> Open
              </a>
              <Button size="sm" onClick={copy}>
                {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                {copied ? "Copied" : "Copy link"}
              </Button>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
