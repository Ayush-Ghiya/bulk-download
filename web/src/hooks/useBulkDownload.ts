import { useCallback, useRef, useState } from "react";
import { FLOW_STAGES, type StageId } from "@/lib/flowStages";
import { addRun } from "@/lib/runHistory";

export type StageStatus = "idle" | "active" | "done" | "skipped" | "error";

export interface StageState {
  id: StageId;
  status: StageStatus;
  detail?: string;
}

export interface UseBulkDownload {
  stages: StageState[];
  loading: boolean;
  error: string | null;
  downloadUrl: string | null;
  checksum: string | null;
  cacheHit: boolean | null;
  start: (assetIds: string[], zipName: string) => void;
  reset: () => void;
}

const idleStages = (): StageState[] =>
  FLOW_STAGES.map((s) => ({ id: s.id, status: "idle" as StageStatus }));

// Maps an incoming SSE event name to the stage it activates.
const EVENT_TO_STAGE: Record<string, StageId> = {
  browser: "browser",
  bff: "bff",
  resolve: "resolve",
  "payload-write": "payload-write",
  sign: "sign",
  cdn: "cdn",
  "origin-verify": "origin-verify",
  "cache-check": "cache-check",
  build: "build",
  tee: "tee",
  done: "done",
};

const ORDER = FLOW_STAGES.map((s) => s.id);

export function useBulkDownload(): UseBulkDownload {
  const [stages, setStages] = useState<StageState[]>(idleStages);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [checksum, setChecksum] = useState<string | null>(null);
  const [cacheHit, setCacheHit] = useState<boolean | null>(null);
  const esRef = useRef<EventSource | null>(null);

  const markActive = useCallback((id: StageId, detail?: string) => {
    setStages((prev) => {
      const idx = ORDER.indexOf(id);
      return prev.map((s) => {
        const sIdx = ORDER.indexOf(s.id);
        if (s.id === id) return { ...s, status: "active", detail };
        if (sIdx < idx && s.status === "active") return { ...s, status: "done" };
        return s;
      });
    });
  }, []);

  const finish = useCallback((hit: boolean) => {
    setStages((prev) =>
      prev.map((s) => {
        if (hit && (s.id === "build" || s.id === "tee")) {
          return { ...s, status: "skipped" };
        }
        return s.status === "active" || s.status === "idle"
          ? { ...s, status: "done" }
          : s;
      }),
    );
  }, []);

  const reset = useCallback(() => {
    esRef.current?.close();
    esRef.current = null;
    setStages(idleStages());
    setLoading(false);
    setError(null);
    setDownloadUrl(null);
    setChecksum(null);
    setCacheHit(null);
  }, []);

  const start = useCallback(
    (assetIds: string[], zipName: string) => {
      if (assetIds.length === 0) return;
      esRef.current?.close();
      setStages(idleStages());
      setLoading(true);
      setError(null);
      setDownloadUrl(null);
      setChecksum(null);
      setCacheHit(null);

      const qs = new URLSearchParams({ assetIds: assetIds.join(","), zipName });
      const es = new EventSource(`/api/bulk-download/stream?${qs.toString()}`);
      esRef.current = es;

      for (const name of Object.keys(EVENT_TO_STAGE)) {
        es.addEventListener(name, (ev) => {
          const data = JSON.parse((ev as MessageEvent).data);
          if (name === "cache-check") {
            setCacheHit(Boolean(data.hit));
            markActive("cache-check", data.hit ? "HIT" : "MISS");
            return;
          }
          if (name === "done") {
            // The server sends a relative download URL; resolve it against
            // the current origin so it works on any deployment (and locally
            // through the Vite dev proxy).
            const absUrl = new URL(data.downloadUrl, window.location.origin).href;
            setDownloadUrl(absUrl);
            setChecksum(data.checksum);
            setCacheHit(Boolean(data.cacheHit));
            finish(Boolean(data.cacheHit));
            setLoading(false);
            es.close();
            esRef.current = null;
            void addRun({
              at: Date.now(),
              assetIds,
              zipName,
              checksum: data.checksum,
              cacheHit: Boolean(data.cacheHit),
              downloadUrl: absUrl,
              expiresAt: data.expiresAt,
            });
            return;
          }
          markActive(EVENT_TO_STAGE[name], data.name ?? data.message);
        });
      }

      es.addEventListener("error", (ev) => {
        const data = (ev as MessageEvent).data;
        const msg = data ? JSON.parse(data).message : "Connection lost";
        setError(msg);
        setLoading(false);
        setStages((prev) =>
          prev.map((s) => (s.status === "active" ? { ...s, status: "error" } : s)),
        );
        es.close();
        esRef.current = null;
      });
    },
    [markActive, finish],
  );

  return { stages, loading, error, downloadUrl, checksum, cacheHit, start, reset };
}
