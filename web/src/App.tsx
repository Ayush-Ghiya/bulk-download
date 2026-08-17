import { useEffect, useMemo, useState } from "react";
import { BulkDownloadModal } from "@/components/BulkDownloadModal";
import { FlowWidget } from "@/components/FlowWidget";
import { RunHistory } from "@/components/RunHistory";
import { Walkthrough } from "@/components/Walkthrough";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { useBulkDownload } from "@/hooks/useBulkDownload";

interface Asset {
  id: string;
  name: string;
  contentType: string;
  bytes: number;
  thumbnailUrl: string;
}

export default function App() {
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

  // Refresh history when a run completes (downloadUrl becomes available).
  useEffect(() => {
    if (dl.downloadUrl) setHistoryKey((k) => k + 1);
  }, [dl.downloadUrl]);

  const startDownload = () => {
    if (selectedIds.length === 0) return;
    setModalOpen(true);
    dl.start(selectedIds, "assets.zip");
  };

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8 p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">Bulk Download Demo</h1>
        <p className="text-sm text-muted-foreground">
          Select assets, then watch the real production flow light up as the ZIP is signed,
          built, and cached.
        </p>
      </header>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Assets</h2>
          <Button onClick={startDownload} disabled={selectedIds.length === 0 || dl.loading}>
            Download all ({selectedIds.length})
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {assets.map((a) => {
            const isSel = selected.has(a.id);
            return (
              <Card
                key={a.id}
                className={`cursor-pointer overflow-hidden p-0 transition ${isSel ? "ring-2 ring-primary" : ""}`}
                onClick={() => toggle(a.id)}
              >
                <div className="relative">
                  <img src={a.thumbnailUrl} alt={a.name} className="aspect-[3/2] w-full object-cover" />
                  <div className="absolute left-2 top-2">
                    <Checkbox checked={isSel} />
                  </div>
                </div>
                <div className="flex items-center justify-between p-2">
                  <span className="truncate text-xs font-medium">{a.name}</span>
                  <Badge variant="secondary">{a.bytes}B</Badge>
                </div>
              </Card>
            );
          })}
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Live flow</h2>
        <FlowWidget stages={dl.stages} />
      </section>

      <RunHistory refreshKey={historyKey} />

      <Walkthrough />

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
