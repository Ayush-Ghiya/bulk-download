import type React from "react";
import { FLOW_STAGES } from "@/lib/flowStages";
import type { StageState, StageStatus } from "@/hooks/useBulkDownload";
import { cn } from "@/lib/utils";

const NODE_W = 96;
const NODE_H = 56;
const GAP = 40;
const PAD = 16;

const statusColor: Record<StageStatus, string> = {
  idle: "fill-muted stroke-border",
  active: "fill-primary stroke-primary",
  done: "fill-secondary stroke-primary/60",
  skipped: "fill-muted/40 stroke-border",
  error: "fill-destructive/20 stroke-destructive",
};

const textColor: Record<StageStatus, string> = {
  idle: "fill-muted-foreground",
  active: "fill-primary-foreground",
  done: "fill-secondary-foreground",
  skipped: "fill-muted-foreground/60",
  error: "fill-destructive",
};

export function FlowWidget({ stages }: { stages: StageState[] }): React.JSX.Element {
  const byId = new Map(stages.map((s) => [s.id, s]));
  const width = PAD * 2 + FLOW_STAGES.length * NODE_W + (FLOW_STAGES.length - 1) * GAP;
  const height = 140;
  const yTop = 40;

  const xOf = (i: number) => PAD + i * (NODE_W + GAP);

  return (
    <div className="w-full overflow-x-auto rounded-xl border bg-card p-4">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="min-w-[720px]"
        role="img"
        aria-label="Bulk download production flow"
      >
        {FLOW_STAGES.slice(0, -1).map((stage, i) => {
          const next = FLOW_STAGES[i + 1];
          const from = xOf(i) + NODE_W;
          const to = xOf(i + 1);
          const y = yTop + NODE_H / 2;
          const nextState = byId.get(next.id)?.status ?? "idle";
          const active = nextState === "active";
          const skipped = byId.get(next.id)?.status === "skipped";
          return (
            <g key={`edge-${stage.id}`}>
              <line
                x1={from} y1={y} x2={to} y2={y}
                strokeWidth={2}
                className={cn(
                  "stroke-border",
                  active && "stroke-primary",
                  skipped && "stroke-border [stroke-dasharray:4_4]",
                )}
              />
              {active && (
                <circle r={4} className="fill-primary">
                  <animate attributeName="cx" from={from} to={to} dur="0.8s" repeatCount="indefinite" />
                  <set attributeName="cy" to={y} />
                </circle>
              )}
            </g>
          );
        })}

        {FLOW_STAGES.map((stage, i) => {
          const state = byId.get(stage.id)?.status ?? "idle";
          const x = xOf(i);
          return (
            <g key={stage.id}>
              <rect
                x={x} y={yTop} width={NODE_W} height={NODE_H} rx={10}
                strokeWidth={2}
                className={cn(statusColor[state], state === "active" && "animate-pulse")}
              />
              <text
                x={x + NODE_W / 2} y={yTop + NODE_H / 2 - 2}
                textAnchor="middle" className={cn("text-[10px] font-medium", textColor[state])}
              >
                {stage.node}
              </text>
              <text
                x={x + NODE_W / 2} y={yTop + NODE_H / 2 + 12}
                textAnchor="middle" className="fill-muted-foreground text-[8px]"
              >
                {stage.kind === "narrated" ? "narrated" : "live"}
              </text>
              <text
                x={x + NODE_W / 2} y={yTop + NODE_H + 16}
                textAnchor="middle" className="fill-foreground text-[9px]"
              >
                {stage.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
