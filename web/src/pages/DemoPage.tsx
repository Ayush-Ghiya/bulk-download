import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Download, Loader2 } from "lucide-react";
import { BulkDownloadModal } from "@/components/BulkDownloadModal";
import { FlowWidget } from "@/components/FlowWidget";
import { RunHistory } from "@/components/RunHistory";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useBulkDownload } from "@/hooks/useBulkDownload";
import { cn } from "@/lib/utils";

interface Asset {
  id: string;
  name: string;
  contentType: string;
  bytes: number;
  thumbnailUrl: string;
}

function SectionHeader({
  index,
  label,
  title,
  children,
}: {
  index: string;
  label: string;
  title: string;
  children?: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="flex flex-col gap-1">
        <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          {index} · {label}
        </span>
        <h2 className="text-lg font-semibold tracking-tight text-foreground">{title}</h2>
      </div>
      {children}
    </div>
  );
}

export function DemoPage(): React.JSX.Element {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [modalOpen, setModalOpen] = useState(false);
  const [historyKey, setHistoryKey] = useState(0);
  const dl = useBulkDownload();

  useEffect(() => {
    void fetch("/api/assets")
      .then((r) => r.json())
      .then((d: { assets: Asset[] }) => setAssets(d.assets));
  }, []);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const selectedIds = useMemo(() => [...selected], [selected]);
  const allSelected = assets.length > 0 && selected.size === assets.length;

  useEffect(() => {
    if (dl.downloadUrl) setHistoryKey((k) => k + 1);
  }, [dl.downloadUrl]);

  const startDownload = () => {
    if (selectedIds.length === 0) return;
    setModalOpen(true);
    dl.start(selectedIds, "assets.zip");
  };

  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(assets.map((a) => a.id)));

  return (
    <div className="flex flex-col gap-14">
      {/* Intro */}
      <section className="flex flex-col gap-3">
        <span className="w-fit rounded-full border border-border bg-card/60 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          Asset Hub · Download All
        </span>
        <h1 className="max-w-2xl text-3xl font-semibold leading-tight tracking-tight text-foreground sm:text-4xl">
          Watch a signed, cached, tee-streamed ZIP build in real time.
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Pick some assets and hit download. The pipeline below lights up stage by stage as the
          request is resolved, signed, cache-checked, and streamed — the same flow that runs in
          production.
        </p>
      </section>

      {/* Asset picker */}
      <section className="flex flex-col gap-5">
        <SectionHeader index="01" label="Select" title="Assets">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleAll}
              disabled={assets.length === 0}
              className="text-muted-foreground"
            >
              {allSelected ? "Clear all" : "Select all"}
            </Button>
            <Button
              onClick={startDownload}
              disabled={selectedIds.length === 0 || dl.loading}
              className={cn(
                "font-medium",
                selectedIds.length > 0 && !dl.loading && "glow",
              )}
            >
              {dl.loading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Download className="size-4" />
              )}
              Download all
              <span className="font-mono text-xs opacity-80">({selectedIds.length})</span>
            </Button>
          </div>
        </SectionHeader>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {assets.map((a) => {
            const isSel = selected.has(a.id);
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => toggle(a.id)}
                aria-pressed={isSel}
                className={cn(
                  "group relative overflow-hidden rounded-xl border bg-card text-left transition-all duration-200",
                  isSel
                    ? "border-primary/70 glow-sm"
                    : "border-border hover:border-border/0 hover:ring-1 hover:ring-primary/30",
                )}
              >
                <div className="relative aspect-[3/2] w-full overflow-hidden">
                  <img
                    src={a.thumbnailUrl}
                    alt={a.name}
                    className={cn(
                      "size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]",
                      !isSel && "opacity-90",
                    )}
                  />
                  <div
                    className={cn(
                      "absolute right-2 top-2 flex size-5 items-center justify-center rounded-full border transition-all",
                      isSel
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-white/40 bg-black/30 text-transparent backdrop-blur",
                    )}
                  >
                    <CheckCircle2 className="size-3.5" />
                  </div>
                </div>
                <div className="flex items-center justify-between gap-2 px-3 py-2.5">
                  <span className="truncate text-xs font-medium text-foreground">{a.name}</span>
                  <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                    {a.bytes}B
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Flow visualization — the hero */}
      <section className="flex flex-col gap-5">
        <SectionHeader index="02" label="Pipeline" title="Live flow">
          <Badge
            variant="outline"
            className={cn(
              "gap-1.5 font-mono",
              dl.loading && "border-primary/50 text-primary",
            )}
          >
            <span
              className={cn(
                "size-1.5 rounded-full",
                dl.loading ? "bg-primary" : "bg-muted-foreground/60",
              )}
            />
            {dl.loading ? "streaming" : "idle"}
          </Badge>
        </SectionHeader>

        <div className="edge-glow relative overflow-hidden rounded-2xl border border-border bg-card/60 p-4 shadow-2xl shadow-black/40 sm:p-8">
          <FlowWidget stages={dl.stages} />
        </div>
      </section>

      {/* Run history */}
      <section className="flex flex-col gap-5">
        <SectionHeader index="03" label="Local" title="Run history" />
        <RunHistory refreshKey={historyKey} />
      </section>

      <BulkDownloadModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        loading={dl.loading}
        error={dl.error}
        downloadUrl={dl.downloadUrl}
        count={selectedIds.length}
        cacheHit={dl.cacheHit}
        onRetry={startDownload}
      />
    </div>
  );
}
