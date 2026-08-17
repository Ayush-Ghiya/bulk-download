import type React from "react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { clearRuns, listRuns, type RunRecord } from "@/lib/runHistory";

export function RunHistory({ refreshKey }: { refreshKey: number }): React.JSX.Element {
  const [runs, setRuns] = useState<RunRecord[]>([]);

  useEffect(() => {
    void listRuns().then(setRuns);
  }, [refreshKey]);

  const onClear = async () => {
    await clearRuns();
    setRuns([]);
  };

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Run history</h3>
        {runs.length > 0 && (
          <Button variant="ghost" size="sm" onClick={onClear}>Clear</Button>
        )}
      </div>
      {runs.length === 0 ? (
        <p className="text-xs text-muted-foreground">No runs yet. Runs are stored in your browser (IndexedDB).</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {runs.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs">
              <div className="flex flex-col">
                <span className="font-medium">{r.zipName}</span>
                <span className="text-muted-foreground">
                  {new Date(r.at).toLocaleString()} · {r.assetIds.length} file
                  {r.assetIds.length === 1 ? "" : "s"} · {r.checksum.slice(0, 10)}…
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={r.cacheHit ? "secondary" : "default"}>
                  {r.cacheHit ? "HIT" : "MISS"}
                </Badge>
                <a
                  href={r.downloadUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-md border px-2 py-1 hover:bg-accent"
                >
                  Open
                </a>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
