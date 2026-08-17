import type React from "react";
import { FLOW_STAGES } from "@/lib/flowStages";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

export function Walkthrough(): React.JSX.Element {
  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold">How the real feature works</h2>
        <p className="text-sm text-muted-foreground">
          This demo runs one service, but the stages below mirror Asset Hub's real
          distributed flow. "Live" stages execute real backend work here; "narrated"
          stages (BFF, CDN) exist only in production and are shown for completeness.
        </p>
      </div>

      <ol className="grid gap-3 sm:grid-cols-2">
        {FLOW_STAGES.map((stage, i) => (
          <li key={stage.id}>
            <Card className="h-full p-3">
              <div className="mb-1 flex items-center gap-2">
                <span className="flex size-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                  {i + 1}
                </span>
                <span className="text-sm font-medium">{stage.node}</span>
                <Badge variant={stage.kind === "real" ? "default" : "secondary"}>
                  {stage.kind === "real" ? "live" : "narrated"}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">{stage.description}</p>
            </Card>
          </li>
        ))}
      </ol>

      <div className="flex flex-col gap-2 text-sm text-muted-foreground">
        <h3 className="text-base font-semibold text-foreground">The two headline techniques</h3>
        <p>
          <strong className="text-foreground">Content-addressed idempotent cache.</strong>{" "}
          The archive is described by a payload whose SHA-256 checksum names both the
          <code className="mx-1 rounded bg-muted px-1">payload.json</code> and the cached
          <code className="mx-1 rounded bg-muted px-1">download.zip</code>. Re-requesting the
          same selection yields the same checksum, so the second run is a pure cache HIT —
          no rebuild.
        </p>
        <p>
          <strong className="text-foreground">Tee-streaming ZIP builder.</strong>{" "}
          On a miss the ZIP is generated once and piped to two sinks at the same time: the
          client download and the derived-bucket cache. The first requester pays the build
          cost while everyone after them gets the cached object.
        </p>
        <p>
          <strong className="text-foreground">Two-bucket layout.</strong>{" "}
          Source objects live in an originals bucket; generated payloads and archives live in
          a separate derived bucket (here, two local folders). Signed, expiring links gate the
          origin so only authorized, unexpired requests are served.
        </p>
      </div>
    </section>
  );
}
