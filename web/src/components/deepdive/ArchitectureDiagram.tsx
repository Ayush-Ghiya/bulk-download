import type React from "react";

/* ------------------------------------------------------------------ *
 * A hand-built SVG of the Media Library's production "Download All" topology.
 *
 * The flow is genuinely TWO separate HTTP requests, and the diagram is
 * split into two lanes to make that honest:
 *
 *   Lane A — MINT   : GET /api/bulk-download/stream  (the SSE progress feed)
 *                     resolves assets, writes payload.json, signs a link.
 *   Lane B — SERVE  : GET /assets/{tenantId}/download-all/{checksum}/{zipName}
 *                     re-verifies the token, then HITs the cache or builds.
 * ------------------------------------------------------------------ */

const W = 908;
const H = 470;
const NW = 124;
const NH = 52;

type Kind = "node" | "store" | "decision";

interface NodeDef {
  x: number;
  y: number;
  w?: number;
  title: string;
  sub: string;
  kind: Kind;
}

// ---- Lane A: mint the link (y ~ 64) ----
const AY = 64;
const A_BROWSER = {
  x: 16,
  y: AY,
  title: "Browser",
  sub: "dashboard",
  kind: "node",
} as const;
const A_BFF = {
  x: 188,
  y: AY,
  title: "Browser",
  sub: "Calls BE API",
  kind: "node",
} as const;
const A_API = {
  x: 360,
  y: AY,
  title: "API",
  sub: "resolve + sign",
  kind: "node",
} as const;
const A_SIGNER = {
  x: 532,
  y: AY,
  title: "Signer",
  sub: "HMAC-SHA256",
  kind: "node",
} as const;
const A_PAYLOAD = {
  x: 360,
  y: 162,
  title: "Derived bucket",
  sub: "payload.json",
  kind: "store",
} as const;

// ---- Lane B: serve the archive (y ~ 276) ----
const BY = 276;
const B_BROWSER = {
  x: 16,
  y: BY,
  title: "Browser",
  sub: "opens link",
  kind: "node",
} as const;
const B_CDN = {
  x: 168,
  y: BY,
  title: "CDN edge",
  sub: "cache · prod",
  kind: "node",
} as const;
const B_ORIGIN = {
  x: 320,
  y: BY,
  title: "Origin worker",
  sub: "verify token",
  kind: "node",
} as const;
const B_CACHE = {
  x: 472,
  y: BY,
  title: "Cache",
  sub: "download.zip?",
  kind: "decision",
} as const;
const B_TEE = {
  x: 624,
  y: BY,
  title: "Tee builder",
  sub: "archiver · store",
  kind: "node",
} as const;
const B_OUT = {
  x: 776,
  y: BY,
  title: "ZIP response",
  sub: "→ browser",
  kind: "node",
} as const;
const B_SOURCE = {
  x: 320,
  y: 392,
  title: "Source bucket",
  sub: "originals · read",
  kind: "store",
} as const;
const B_DERIVED = {
  x: 624,
  y: 392,
  title: "Derived bucket",
  sub: "download.zip · write",
  kind: "store",
} as const;

const NODES: NodeDef[] = [
  A_BFF,
  A_API,
  A_SIGNER,
  A_PAYLOAD,
  B_BROWSER,
  B_CDN,
  B_ORIGIN,
  B_CACHE,
  B_TEE,
  B_OUT,
  B_SOURCE,
  B_DERIVED,
];

function cx(n: { x: number; w?: number }): number {
  return n.x + (n.w ?? NW) / 2;
}
function right(n: { x: number; w?: number }): number {
  return n.x + (n.w ?? NW);
}

function Node({ n }: { n: NodeDef }): React.JSX.Element {
  const w = n.w ?? NW;
  const c = n.x + w / 2;
  const store = n.kind === "store";
  const decision = n.kind === "decision";
  const rectClass = store
    ? "fill-card stroke-primary/30"
    : decision
      ? "fill-secondary stroke-primary/60"
      : "fill-secondary stroke-primary/45";
  return (
    <g>
      <rect
        x={n.x}
        y={n.y}
        width={w}
        height={NH}
        rx={12}
        strokeWidth={1.5}
        className={rectClass}
      />
      {store ? (
        <circle
          cx={n.x + 14}
          cy={n.y + 14}
          r={2.5}
          className="fill-primary/60"
        />
      ) : null}
      <text
        x={c}
        y={n.y + 22}
        textAnchor="middle"
        className="fill-foreground text-[12.5px] font-medium"
      >
        {n.title}
      </text>
      <text
        x={c}
        y={n.y + 38}
        textAnchor="middle"
        className="fill-muted-foreground/80 font-mono text-[9px] tracking-tight"
      >
        {n.sub}
      </text>
    </g>
  );
}

function Edge({
  d,
  dashed,
  label,
  lx,
  ly,
}: {
  d: string;
  dashed?: boolean;
  label?: string;
  lx?: number;
  ly?: number;
}): React.JSX.Element {
  return (
    <g>
      <path
        d={d}
        fill="none"
        strokeWidth={1.5}
        strokeDasharray={dashed ? "4 4" : undefined}
        markerEnd="url(#arrow)"
        className="stroke-muted-foreground/55"
      />
      {label && lx != null && ly != null ? (
        <text
          x={lx}
          y={ly}
          textAnchor="middle"
          className="fill-muted-foreground font-mono text-[9px] uppercase tracking-[0.1em]"
        >
          {label}
        </text>
      ) : null}
    </g>
  );
}

export function ArchitectureDiagram(): React.JSX.Element {
  const ay = AY + NH / 2; // lane A edge y
  const by = BY + NH / 2; // lane B edge y
  return (
    <div className="w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full min-w-[760px]"
        role="img"
        aria-label="Production architecture of the Download All flow, split into a mint lane and a serve lane"
      >
        <defs>
          <marker
            id="arrow"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path
              d="M 0 0 L 10 5 L 0 10 z"
              className="fill-muted-foreground/70"
            />
          </marker>
        </defs>

        {/* Lane labels */}
        <text
          x={16}
          y={36}
          className="fill-foreground font-mono text-[11px] uppercase tracking-[0.16em]"
        >
          <tspan className="fill-primary">A</tspan> · mint — GET
          /api/bulk-download/stream (SSE)
        </text>
        <text
          x={16}
          y={250}
          className="fill-foreground font-mono text-[11px] uppercase tracking-[0.16em]"
        >
          <tspan className="fill-primary">B</tspan> · serve — GET /assets/
          {"{tenantId}"}/download-all/{"{checksum}"}/{"{zipName}"}
        </text>

        {/* Lane A edges */}
        <Edge d={`M ${right(A_BFF)} ${ay} L ${A_API.x - 4} ${ay}`} />
        <Edge d={`M ${right(A_API)} ${ay} L ${A_SIGNER.x - 4} ${ay}`} />
        <Edge
          d={`M ${cx(A_API)} ${A_API.y + NH} L ${cx(A_API)} ${A_PAYLOAD.y - 4}`}
          label="saves record"
          lx={cx(A_API) + 46}
          ly={A_API.y + NH + 22}
        />

        {/* Divider — the signed link bridges the two requests */}
        <line
          x1={16}
          y1={226}
          x2={W - 16}
          y2={226}
          className="stroke-border"
          strokeDasharray="2 6"
        />
        <rect
          x={W / 2 - 232}
          y={214}
          width={464}
          height={24}
          rx={12}
          className="fill-card stroke-primary/30"
          strokeWidth={1}
        />
        <text
          x={W / 2}
          y={230}
          textAnchor="middle"
          className="fill-muted-foreground font-mono text-[10px] tracking-tight"
        >
          Signer returns a signed, expiring link → the browser opens it as
          request B
        </text>

        {/* Lane B edges */}
        <Edge d={`M ${right(B_BROWSER)} ${by} L ${B_CDN.x - 4} ${by}`} />
        <Edge d={`M ${right(B_CDN)} ${by} L ${B_ORIGIN.x - 4} ${by}`} />
        <Edge d={`M ${right(B_ORIGIN)} ${by} L ${B_CACHE.x - 4} ${by}`} />
        <Edge
          d={`M ${right(B_CACHE)} ${by} L ${B_TEE.x - 4} ${by}`}
          label="miss"
          lx={(right(B_CACHE) + B_TEE.x) / 2}
          ly={BY - 4}
        />
        <Edge
          d={`M ${right(B_TEE)} ${by} L ${B_OUT.x - 4} ${by}`}
          label="client"
          lx={(right(B_TEE) + B_OUT.x) / 2}
          ly={BY - 4}
        />

        {/* HIT bypass arc — cache-check jumps straight to the response */}
        <Edge
          d={`M ${cx(B_CACHE)} ${B_CACHE.y} C ${cx(B_CACHE)} ${B_CACHE.y - 30}, ${cx(B_OUT)} ${B_OUT.y - 30}, ${cx(B_OUT)} ${B_OUT.y - 4}`}
          label="hit · cached download.zip"
          lx={(cx(B_CACHE) + cx(B_OUT)) / 2}
          ly={B_CACHE.y - 20}
        />

        {/* Bucket edges */}
        <Edge
          d={`M ${cx(B_SOURCE)} ${B_SOURCE.y - 4} L ${cx(B_TEE)} ${B_TEE.y + NH + 4}`}
          label="reads"
          lx={(cx(B_SOURCE) + cx(B_TEE)) / 2 + 8}
          ly={(B_SOURCE.y + B_TEE.y + NH) / 2 - 6}
        />
        <Edge
          d={`M ${cx(B_TEE)} ${B_TEE.y + NH} L ${cx(B_DERIVED)} ${B_DERIVED.y - 4}`}
          label="saves"
          lx={cx(B_TEE) + 26}
          ly={B_TEE.y + NH + 22}
        />

        {NODES.map((n) => (
          <Node key={`${n.title}-${n.x}-${n.y}`} n={n} />
        ))}
      </svg>
    </div>
  );
}
