import type React from "react";
import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { FLOW_STAGES, STEP_LABELS, type FlowStep } from "@/lib/flowStages";
import type { StageState, StageStatus } from "@/hooks/useBulkDownload";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ *
 * Layout — a serpentine of 11 phase nodes, laid out on a 4-column
 * grid so the whole pipeline breathes without horizontal scroll on
 * desktop. Rows alternate direction (L→R, R→L, L→R) so the connectors
 * are all clean right angles and the particle glides through them.
 *
 *   row 0  →   browser · bff · resolve · payload-write
 *   row 1  ←   sign · cdn · origin-verify · cache-check
 *   row 2  →   build · tee · done
 * ------------------------------------------------------------------ */

const COLS = 4;
const NODE_W = 128;
const NODE_H = 60;
const COL_GAP = 40;
const ROW_GAP = 82;
const PAD_X = 30;
const PAD_TOP = 34;
const LABEL_H = 24;

const ROWS = Math.ceil(FLOW_STAGES.length / COLS);
const VIEW_W = PAD_X * 2 + COLS * NODE_W + (COLS - 1) * COL_GAP;
const VIEW_H = PAD_TOP + ROWS * NODE_H + (ROWS - 1) * ROW_GAP + LABEL_H;

interface Pt {
  x: number;
  y: number;
}

function rowOf(i: number): number {
  return Math.floor(i / COLS);
}
function visualCol(i: number): number {
  const col = i % COLS;
  return rowOf(i) % 2 === 0 ? col : COLS - 1 - col;
}
function nodeX(i: number): number {
  return PAD_X + visualCol(i) * (NODE_W + COL_GAP);
}
function nodeY(i: number): number {
  return PAD_TOP + rowOf(i) * (NODE_H + ROW_GAP);
}
function nodeCenter(i: number): Pt {
  return { x: nodeX(i) + NODE_W / 2, y: nodeY(i) + NODE_H / 2 };
}

// Cache-check (7) sits directly above build (8); the bypass lane runs
// through the gap between row 1 and row 2, arcing over build + tee.
const LANE_Y = nodeY(7) + NODE_H + ROW_GAP / 2;

/* ------------------------------------------------------------------ *
 * Route geometry. A route is an ordered polyline of points plus a
 * mapping from logical "stops" (the phases the particle rests at) to
 * point indices. Because every connector is a straight segment, the
 * JS-computed cumulative lengths exactly match the SVG path length —
 * so the particle (analytic) and the glowing trail (dashoffset on the
 * same <path>) never desync.
 * ------------------------------------------------------------------ */

interface Route {
  d: string;
  pts: Pt[];
  cum: number[]; // cumulative length at each point
  stopLen: number[]; // length along the route at each logical stop
  total: number;
  numStops: number;
}

function dist(a: Pt, b: Pt): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function buildRoute(pts: Pt[], stopPointIdx: number[]): Route {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum[i] = cum[i - 1] + dist(pts[i - 1], pts[i]);
  const total = cum[cum.length - 1];
  const stopLen = stopPointIdx.map((pi) => cum[pi]);
  const d =
    "M " + pts.map((p) => `${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(" L ");
  return { d, pts, cum, stopLen, total, numStops: stopPointIdx.length };
}

type Mode = "normal" | "bypass";

function makeRoute(mode: Mode): Route {
  const n = FLOW_STAGES.length;
  if (mode === "normal") {
    const pts = FLOW_STAGES.map((_, i) => nodeCenter(i));
    const stopPointIdx = pts.map((_, i) => i);
    return buildRoute(pts, stopPointIdx);
  }
  // Bypass: route cache-check (7) → done (10) directly, skipping build
  // and tee. The detour drops into the lane, travels right above the
  // skipped nodes, then drops into done.
  const c7 = nodeCenter(7);
  const cDone = nodeCenter(n - 1);
  const pts: Pt[] = [];
  const stopPointIdx: number[] = [];
  for (let i = 0; i <= 7; i++) {
    stopPointIdx.push(pts.length);
    pts.push(nodeCenter(i));
  }
  pts.push({ x: c7.x, y: LANE_Y }); // W1 — drop into lane
  pts.push({ x: cDone.x, y: LANE_Y }); // W2 — travel over build + tee
  stopPointIdx.push(pts.length); // done stop
  pts.push(cDone);
  return buildRoute(pts, stopPointIdx);
}

function lenAtPos(route: Route, pos: number): number {
  const clamped = Math.max(0, Math.min(route.numStops - 1, pos));
  const k = Math.floor(clamped);
  const f = clamped - k;
  if (k >= route.numStops - 1) return route.stopLen[route.numStops - 1];
  return route.stopLen[k] + f * (route.stopLen[k + 1] - route.stopLen[k]);
}

function pointAtLen(route: Route, len: number): Pt {
  const { pts, cum, total } = route;
  const L = Math.max(0, Math.min(total, len));
  let i = 1;
  while (i < cum.length && cum[i] < L) i++;
  const a = pts[i - 1];
  const b = pts[i] ?? a;
  const segLen = cum[i] - cum[i - 1] || 1;
  const f = (L - cum[i - 1]) / segLen;
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
}

/* ------------------------------------------------------------------ *
 * Target derivation — from stage statuses to a delay-gated target.
 * ------------------------------------------------------------------ */

interface Target {
  targetStop: number;
  mode: Mode;
  isIdle: boolean;
  hasError: boolean;
}

function stageToStop(mode: Mode, i: number): number {
  if (mode === "normal") return i;
  const last = FLOW_STAGES.length - 1;
  if (i <= 7) return i;
  if (i === last) return 8; // done → final stop on the bypass route
  return -1; // build / tee are off-route
}

function computeTarget(stages: StageState[]): Target {
  const status = new Map<string, StageStatus>(stages.map((s) => [s.id, s.status]));
  const at = (i: number): StageStatus => status.get(FLOW_STAGES[i].id) ?? "idle";

  const mode: Mode = at(8) === "skipped" || at(9) === "skipped" ? "bypass" : "normal";

  let frontier = -1;
  let errorIdx = -1;
  let anyNonIdle = false;
  for (let i = 0; i < FLOW_STAGES.length; i++) {
    const st = at(i);
    if (st !== "idle") anyNonIdle = true;
    if (st === "active" || st === "done") frontier = i;
    if (st === "error") errorIdx = i;
  }

  // On error the particle settles at the failed phase.
  const targetStageIdx = errorIdx >= 0 ? errorIdx : frontier;
  let targetStop = 0;
  if (targetStageIdx >= 0) {
    for (let i = targetStageIdx; i >= 0; i--) {
      const s = stageToStop(mode, i);
      if (s >= 0) {
        targetStop = s;
        break;
      }
    }
  }

  return { targetStop, mode, isIdle: !anyNonIdle, hasError: errorIdx >= 0 };
}

/* ------------------------------------------------------------------ */

const GLOW_FILTER = "drop-shadow(0 0 5px var(--glow)) drop-shadow(0 0 11px var(--glow))";
const TRAIL_FILTER = "drop-shadow(0 0 4px var(--glow))";

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handler = (): void => setReduced(mq.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return reduced;
}

const SPEEDS = [0.5, 1, 2] as const;

export function FlowWidget({
  stages,
  phaseDelayMs = 450,
}: {
  stages: StageState[];
  /** Minimum dwell (ms) the particle spends per phase before it may
   *  advance to the next revealed phase. The "custom delay" knob. */
  phaseDelayMs?: number;
}): React.JSX.Element {
  const reduced = usePrefersReducedMotion();
  const [speed, setSpeed] = useState(1);

  const { targetStop, mode, isIdle, hasError } = useMemo(
    () => computeTarget(stages),
    [stages],
  );
  const route = useMemo(() => makeRoute(mode), [mode]);

  const byId = useMemo(
    () => new Map(stages.map((s) => [s.id, s.status])),
    [stages],
  );

  // Animation state lives in refs; a reducer tick forces a re-render
  // each frame so the render reads the freshest positions.
  const posRef = useRef(0);
  const revealedRef = useRef(0);
  const lastAdvanceRef = useRef(0);
  const targetRef = useRef(targetStop);
  const rafRef = useRef<number | null>(null);
  const runningRef = useRef(false);
  const speedRef = useRef(speed);
  const [, tick] = useReducer((x: number) => x + 1, 0);

  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);

  useEffect(() => {
    targetRef.current = targetStop;

    if (reduced) {
      // No continuous motion: snap to the frontier, render once.
      posRef.current = targetStop;
      revealedRef.current = targetStop;
      lastAdvanceRef.current = performance.now();
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      runningRef.current = false;
      tick();
      return;
    }

    // Regression (a reset / new run) — snap the frontier back so the
    // particle returns to the start rather than easing backwards.
    if (targetStop < revealedRef.current) {
      revealedRef.current = targetStop;
      posRef.current = Math.min(posRef.current, targetStop);
      lastAdvanceRef.current = performance.now();
    }

    if (runningRef.current) return;
    runningRef.current = true;
    let prev = performance.now();

    const step = (now: number): void => {
      const dt = Math.min(0.05, (now - prev) / 1000);
      prev = now;
      const target = targetRef.current;
      const sp = speedRef.current;
      const effDelay = phaseDelayMs / sp;

      // Delay-gated frontier: advance at most one phase per effDelay so
      // a burst of SSE events (build → tee → done) still glides one
      // phase at a time instead of snapping.
      if (revealedRef.current < target && now - lastAdvanceRef.current >= effDelay) {
        revealedRef.current = Math.min(target, revealedRef.current + 1);
        lastAdvanceRef.current = now;
      }
      if (target < revealedRef.current) revealedRef.current = target;

      // Critically-damped exponential ease toward the revealed frontier
      // (frame-rate independent, never snaps).
      const k = 6 * sp;
      const a = 1 - Math.exp(-dt * k);
      posRef.current += (revealedRef.current - posRef.current) * a;
      if (Math.abs(revealedRef.current - posRef.current) < 0.0015) {
        posRef.current = revealedRef.current;
      }
      tick();

      const settled =
        revealedRef.current === target &&
        Math.abs(posRef.current - target) < 0.0015;
      if (settled) {
        runningRef.current = false;
        rafRef.current = null;
        return;
      }
      rafRef.current = requestAnimationFrame(step);
    };

    rafRef.current = requestAnimationFrame(step);
  }, [targetStop, mode, reduced, phaseDelayMs]);

  // Cleanup on unmount — no leaked frames.
  useEffect(() => {
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      runningRef.current = false;
    };
  }, []);

  // ---- Derived render values (read the live ref each frame) ----
  const pos = posRef.current;
  const len = lenAtPos(route, pos);
  const particle = pointAtLen(route, len);
  const dashOffset = route.total - len;
  const running = !isIdle && !hasError && targetStop < route.numStops - 1;
  const moving = !isIdle;

  // Greatest on-route stop the particle has reached — the node it currently
  // occupies. Node lit-state is derived from THIS (the same `pos` that drives
  // the trail line), so the box and the line light in lockstep.
  let frontierStop = -1;
  for (let i = 0; i < FLOW_STAGES.length; i++) {
    const s = stageToStop(mode, i);
    if (s >= 0 && s <= pos + 0.001 && s > frontierStop) frontierStop = s;
  }
  const settledAtEnd =
    targetStop === route.numStops - 1 && Math.abs(pos - targetStop) < 0.05;

  function nodeStateFromPos(i: number): StageStatus {
    const raw = byId.get(FLOW_STAGES[i].id) ?? "idle";
    if (raw === "error") return "error";
    if (raw === "skipped") return "skipped"; // build/tee on a HIT bypass
    // At true rest (no run in progress) `pos` sits at 0, which trivially
    // equals stop 0's position — without this guard the first node would
    // read as permanently "active" even though nothing is running.
    if (isIdle) return "idle";
    const s = stageToStop(mode, i);
    if (s < 0) return "idle";
    if (s > pos + 0.001) return "idle"; // particle hasn't arrived yet
    if (s === frontierStop) return settledAtEnd ? "done" : "active";
    return "done"; // particle has already passed this node
  }

  const frontierStageIdx = (() => {
    let idx = 0;
    for (let i = 0; i < FLOW_STAGES.length; i++) {
      const s = stageToStop(mode, i);
      if (s >= 0 && s <= Math.round(pos) && s <= frontierStop) idx = i;
    }
    return idx;
  })();
  const activeStep: FlowStep = isIdle ? 1 : FLOW_STAGES[frontierStageIdx].step;

  // Comet trail — a few fading dots just behind the particle.
  const cometStep = 11;
  const comet = moving
    ? [1, 2, 3, 4].map((j) => {
        const cl = len - j * cometStep;
        return {
          p: pointAtLen(route, cl),
          o: cl > 0 ? 0.5 * (1 - j / 5) : 0,
          r: 3.4 - j * 0.55,
        };
      })
    : [];

  return (
    <div className="flex flex-col gap-4">
      {/* Speed / delay control */}
      <div className="flex items-center justify-between gap-3">
        <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
          Particle · flow
        </span>
        <div
          role="group"
          aria-label="Particle speed"
          className="inline-flex items-center gap-0.5 rounded-full border border-border bg-card/60 p-0.5 font-mono text-[11px]"
        >
          {SPEEDS.map((s) => {
            const active = s === speed;
            return (
              <button
                key={s}
                type="button"
                aria-pressed={active}
                onClick={() => setSpeed(s)}
                className={cn(
                  "rounded-full px-2.5 py-1 transition-colors",
                  active
                    ? "glow-sm border border-primary/60 bg-secondary text-primary"
                    : "border border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {s}×
              </button>
            );
          })}
        </div>
      </div>

      {/* Two-step indicator */}
      <div className="grid grid-cols-2 gap-2">
        {([1, 2] as FlowStep[]).map((step) => {
          const on = !isIdle && activeStep === step;
          return (
            <div
              key={step}
              className={cn(
                "rounded-lg border px-3 py-2 transition-colors",
                on ? "glow-sm border-primary/60 bg-secondary" : "border-border bg-card/50",
              )}
            >
              <div
                className={cn(
                  "font-mono text-[11px] font-semibold",
                  on ? "text-primary" : "text-muted-foreground",
                )}
              >
                {STEP_LABELS[step].title}
              </div>
              <div className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                {STEP_LABELS[step].caption}
              </div>
            </div>
          );
        })}
      </div>

      <div className="w-full overflow-x-auto">
        <svg
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          className="w-full min-w-[560px]"
          role="img"
          aria-label="Bulk download production pipeline"
        >
          {/* Dim base track (the full route). */}
          <path
            d={route.d}
            fill="none"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            className={cn("stroke-border", isIdle && "fw-shimmer")}
          />

          {/* Luminous filled trail behind the particle. */}
          <path
            d={route.d}
            fill="none"
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
            className={hasError ? "stroke-destructive" : "stroke-primary"}
            style={{
              strokeDasharray: route.total,
              strokeDashoffset: dashOffset,
              filter: hasError ? undefined : TRAIL_FILTER,
              opacity: moving ? 0.95 : 0,
              transition: reduced ? "stroke-dashoffset 0.25s linear" : undefined,
            }}
          />

          {/* Nodes. */}
          {FLOW_STAGES.map((stage, i) => {
            const state: StageStatus = nodeStateFromPos(i);
            const c = nodeCenter(i);
            const x = nodeX(i);
            const y = nodeY(i);
            const isActive = state === "active";
            const isDone = state === "done";
            const isSkipped = state === "skipped";
            const isError = state === "error";

            const rectClass = cn(
              "transition-[fill,stroke] duration-300",
              isActive && "fill-primary/10 stroke-primary",
              isDone && "fill-secondary stroke-primary/50",
              isError && "fill-destructive/15 stroke-destructive",
              isSkipped && "fill-muted/30 stroke-border",
              !isActive && !isDone && !isError && !isSkipped && "fill-muted stroke-border",
            );

            const nameClass = cn(
              "text-[12px] font-medium",
              isActive && "fill-primary",
              isDone && "fill-foreground",
              isError && "fill-destructive",
              (isSkipped || (!isActive && !isDone && !isError)) && "fill-muted-foreground",
            );

            const strokeDasharray = isSkipped ? "3 4" : undefined;

            return (
              <g key={stage.id} opacity={isSkipped ? 0.5 : 1}>
                {/* Pulsing halo behind an active node. */}
                {isActive && !reduced && (
                  <rect
                    x={x - 3}
                    y={y - 3}
                    width={NODE_W + 6}
                    height={NODE_H + 6}
                    rx={13}
                    className="fw-pulse fill-primary/25"
                  />
                )}
                <rect
                  x={x}
                  y={y}
                  width={NODE_W}
                  height={NODE_H}
                  rx={12}
                  strokeWidth={isActive ? 2 : 1.5}
                  strokeDasharray={strokeDasharray}
                  className={rectClass}
                  style={isActive ? { filter: TRAIL_FILTER } : undefined}
                />

                {/* Check mark on a done node. */}
                {isDone && (
                  <path
                    d={`M ${x + NODE_W - 20} ${y + 12} l 3 3.4 l 6 -7`}
                    fill="none"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="stroke-primary"
                  />
                )}

                <text
                  x={c.x}
                  y={c.y + 4}
                  textAnchor="middle"
                  className={nameClass}
                >
                  {stage.node}
                </text>
                <text
                  x={c.x}
                  y={y + NODE_H + 15}
                  textAnchor="middle"
                  className="fill-muted-foreground text-[9.5px]"
                >
                  {stage.label}
                </text>
              </g>
            );
          })}

          {/* Comet trail + particle (drawn last, on top). */}
          {comet.map((d, i) =>
            d.o > 0 ? (
              <circle
                key={`comet-${i}`}
                cx={d.p.x}
                cy={d.p.y}
                r={Math.max(0.5, d.r)}
                className="fill-primary"
                style={{ opacity: d.o }}
              />
            ) : null,
          )}

          {/* Outer halo. */}
          <circle
            cx={particle.x}
            cy={particle.y}
            r={11}
            className={cn("fill-primary", !reduced && moving && "fw-breathe")}
            style={{ opacity: moving ? 0.28 : 0.14 }}
          />
          {/* Bright core. */}
          <circle
            cx={particle.x}
            cy={particle.y}
            r={moving ? 4 : 3}
            className="fill-primary"
            style={{ filter: GLOW_FILTER, opacity: moving ? 1 : 0.55 }}
          />
        </svg>
      </div>
    </div>
  );
}
