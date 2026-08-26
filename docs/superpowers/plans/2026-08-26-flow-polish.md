# Flow Polish Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reframe the bulk-download demo's UI around the real two-request flow, remove the demo-vs-production ("real / narrated / live") classification, fix the live-flow glow-sync bug and the architecture-diagram geometry bugs, drop the Honesty section, and rename "Asset Hub" → "Media Library" everywhere.

**Architecture:** The single source of truth is `web/src/lib/flowStages.ts`. Every stage gains a `step: 1 | 2` field and loses its `kind` field. Consumers (the live-flow SVG widget, the deep-dive pipeline list, the SSE table, the architecture diagram, the docs) are updated to render the unified real flow grouped into two steps. The backend (`server/src/routes.ts`, `web/src/hooks/useBulkDownload.ts`) is **unchanged** — all eleven SSE events (including `browser`/`bff`/`cdn`) keep firing to pace the animation; only their UI labels change.

**Tech Stack:** Bun + Hono (server), Vite + React 19 + TailwindCSS v4 + shadcn/ui + react-router-dom v7 (web). Hand-built SVG for the flow widget and architecture diagram.

## Global Constraints

- **Local git only — NEVER push.** No remote exists; do not add one. All commits stay local.
- **No unit tests** for this project (standing user constraint). Each task's verification is `bun run typecheck` (from repo root — runs both workspaces) plus, for visual tasks, a browser check on the target page. Do **not** add test files or test steps.
- **Brand:** "Asset Hub" → "Media Library" in all UI copy, comments, docs, and README. The lowercase code slug `asset-hub` → `media-library`. (The package names `bulk-download-demo-*` are unrelated and stay.)
- **Keep all flow nodes.** browser, bff, and cdn stay as nodes in both the live-flow widget and the architecture diagram — CDN especially is part of the real flow. Only the real/narrated/live *classification* (pills, per-node tag labels, dashed styling, "kind" columns, legend, exception prose) is removed.
- **Two steps.** The flow is two HTTP requests. Step 1 — Generate the link: `browser → bff → resolve → payload-write → sign`. Step 2 — Use the link for the ZIP: `cdn → origin-verify → cache-check → (build → tee) or cached-serve → done`.
- **Code snippets:** keep them **only** in the Technique sections (03 Cache, 04 Tee builder, 05 Signed links) and the 06 SSE Protocol section. Everywhere else — flow-stage descriptions, the pipeline list, the architecture prose — use plain English with no code identifiers or `<Term>` chips.
- **Verification aesthetics:** the deep-dive page (`/#/deep-dive`) has no continuous animation and screenshots reliably; the demo page (`/`) has the particle animation and the browser pane capture is flaky there — verify the demo page by triggering a download and inspecting DOM/behaviour rather than relying on pixel screenshots.

---

## File Structure

- `web/src/lib/flowStages.ts` — **modified.** Drops `StageKind`/`kind`; adds `FlowStep`, `step`, and `STEP_LABELS`; all eleven `description` strings rewritten in plain English. The contract every other task consumes.
- `web/src/components/FlowWidget.tsx` — **modified.** Removes per-node narrated/live label + dashed styling; fixes glow-sync (node lit-state derived from particle position); adds a two-step indicator.
- `web/src/pages/DeepDivePage.tsx` — **modified.** Removes `KindPill`, the header legend, `PHASE_DETAIL` two-column blocks, the SSE "Kind" column, the Honesty section (07) and its data; groups the pipeline by step; softens architecture + pipeline prose to plain English; renames brand.
- `web/src/components/deepdive/ArchitectureDiagram.tsx` — **modified.** Uniform node styling (no narrated variant); corrected geometry (edges land on node edges, no label overlaps); renamed comment.
- `web/src/components/AppShell.tsx`, `web/src/pages/DemoPage.tsx` — **modified.** Brand rename in header/eyebrow copy.
- `README.md`, `docs/01-overview.md`, `docs/02-architecture.md`, `docs/05-sse-flow.md`, `docs/06-frontend.md` — **modified.** Brand rename; narrated/keeps-narrates-drops framing replaced with the unified two-step real-flow description.

---

## Task 1: Rename "Asset Hub" → "Media Library" (safe sweep)

Pure string replacements. No type or structural changes; the app must still typecheck and run identically. Done first because it is isolated and low-risk.

**Files:**
- Modify: `web/src/components/AppShell.tsx:56` (`asset-hub · bulk-download` → `media-library · bulk-download`)
- Modify: `web/src/pages/DemoPage.tsx:97` (`Asset Hub · Download All` → `Media Library · Download All`)
- Modify: `web/src/pages/DeepDivePage.tsx:312` (header prose "Asset Hub's real distributed…" → "the Media Library's real distributed…")
- Modify: `web/src/components/deepdive/ArchitectureDiagram.tsx:4` (comment)
- Modify: `README.md:3`, `docs/01-overview.md` (heading + body), `docs/02-architecture.md:5`
- (The DeepDivePage Honesty-section mention at line ~639 is removed wholesale in Task 6 — leave it for now.)

**Interfaces:**
- Consumes: nothing.
- Produces: nothing (copy-only).

- [ ] **Step 1: Find every remaining mention**

Run: `grep -rin -E "asset[ _-]*hub" web/src README.md docs/`
Expected: the lines listed above (plus the DeepDivePage Honesty-section line, which Task 6 deletes).

- [ ] **Step 2: Replace each occurrence**

Replace the human-readable brand "Asset Hub" with "Media Library" and the lowercase slug `asset-hub` with `media-library`, preserving surrounding punctuation and separators (e.g. `asset-hub · bulk-download` → `media-library · bulk-download`). Keep grammar natural ("In Asset Hub, …" → "In the Media Library, …").

- [ ] **Step 3: Confirm none remain (except the Task-6 line)**

Run: `grep -rin -E "asset[ _-]*hub" web/src README.md docs/`
Expected: only `web/src/pages/DeepDivePage.tsx` (the Honesty-section paragraph, removed in Task 6). If any other line remains, fix it.

- [ ] **Step 4: Typecheck**

Run: `bun run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore(demo): rename Asset Hub to Media Library"
```

---

## Task 2: Two-step data model + remove real/narrated/live classification end-to-end

Atomic "kill the classification" change: it must land together so the workspace keeps compiling (removing `kind` breaks every reader at once). Also rewrites the stage descriptions in plain English (same file, same responsibility).

**Files:**
- Modify: `web/src/lib/flowStages.ts` (whole file — replace)
- Modify: `web/src/components/FlowWidget.tsx` (remove `narrated` handling only — glow fix + step indicator come in Task 3)
- Modify: `web/src/pages/DeepDivePage.tsx` (remove `KindPill`, header legend, pipeline pill usage, SSE "Kind" column, `SseRow.kind`)
- Modify: `web/src/components/deepdive/ArchitectureDiagram.tsx` (remove the `narrated` `Kind` variant → uniform node styling; keep `store`/`decision` variants)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `export type FlowStep = 1 | 2`
  - `interface FlowStage { id: StageId; label: string; node: string; step: FlowStep; description: string }` (no `kind`)
  - `export const STEP_LABELS: Record<FlowStep, { title: string; caption: string }>`
  - `export const FLOW_STAGES: FlowStage[]` (eleven entries, plain-English descriptions)

- [ ] **Step 1: Replace `web/src/lib/flowStages.ts` in full**

```ts
export type FlowStep = 1 | 2;

export type StageId =
  | "browser"
  | "bff"
  | "resolve"
  | "payload-write"
  | "sign"
  | "cdn"
  | "origin-verify"
  | "cache-check"
  | "build"
  | "tee"
  | "done";

export interface FlowStage {
  id: StageId;
  label: string;
  node: string;
  /** Which of the two HTTP requests this stage belongs to. */
  step: FlowStep;
  description: string;
}

export const STEP_LABELS: Record<FlowStep, { title: string; caption: string }> = {
  1: {
    title: "Step 1 — Generate the link",
    caption: "Resolve the selection, save a record of it, and sign a link.",
  },
  2: {
    title: "Step 2 — Use the link for the ZIP",
    caption: "Verify the link, then serve the cached archive or build it.",
  },
};

export const FLOW_STAGES: FlowStage[] = [
  { id: "browser", label: "Browser", node: "Browser", step: 1,
    description: "The dashboard sends the list of selected items and a name for the download." },
  { id: "bff", label: "Dashboard BFF", node: "BFF", step: 1,
    description: "A dashboard proxy forwards the request to the API so the API's credentials stay on the server." },
  { id: "resolve", label: "Resolve assets", node: "API", step: 1,
    description: "The API looks up each selected item and quietly skips any it can't find." },
  { id: "payload-write", label: "Write record", node: "Storage", step: 1,
    description: "A small record of exactly what this archive should contain is saved to storage, filed under a fingerprint of the selection, so the same request can be recognised later." },
  { id: "sign", label: "Sign URL", node: "Signer", step: 1,
    description: "A signed, time-limited download link is minted for that fingerprint and handed back to the browser." },
  { id: "cdn", label: "CDN edge", node: "CDN", step: 2,
    description: "The browser opens that link. It travels through a CDN, which serves a cached copy when it has one and forwards a miss on to the origin." },
  { id: "origin-verify", label: "Verify token", node: "Origin", step: 2,
    description: "The origin re-checks the link's signature and expiry before doing any work — it never trusts the request blindly." },
  { id: "cache-check", label: "Cache check", node: "Cache", step: 2,
    description: "The origin looks for an archive already built for this fingerprint. If one exists it is streamed straight back — a cache hit." },
  { id: "build", label: "Build ZIP", node: "ZIP builder", step: 2,
    description: "On a first request the archive is assembled one file at a time from the original files." },
  { id: "tee", label: "Tee stream", node: "Client + Cache", step: 2,
    description: "As it builds, the archive streams to the browser and is saved to storage at the same time — so the next identical request is an instant hit." },
  { id: "done", label: "Download", node: "Browser", step: 2,
    description: "The finished ZIP is delivered to the browser." },
];
```

- [ ] **Step 2: FlowWidget — strip the narrated/live label and dashed styling**

In `web/src/components/FlowWidget.tsx`, inside the node `.map`:
- Delete the line `const narrated = stage.kind === "narrated";`.
- Change `const strokeDasharray = narrated ? "5 4" : isSkipped ? "3 4" : undefined;` to `const strokeDasharray = isSkipped ? "3 4" : undefined;`.
- Delete the entire `<text>` element that renders `{narrated ? "narrated" : "live"}` (the mono caption at ~y `c.y + 13`).
- Move the remaining `stage.label` caption up so the node text stays centred: change its `y={y + NODE_H + 15}` position is fine to keep; ensure the node `title` text (`stage.node`) `y={c.y - 3}` becomes `y={c.y + 4}` so the single title line is vertically centred now that the second in-box line is gone.
- Update the layout comment block at the top (the `row 0 → browser · bff …` diagram is still accurate; just remove any "narrated" wording in comments).

(Do **not** touch the animation/glow logic in this task — that is Task 3.)

- [ ] **Step 3: DeepDivePage — remove the classification UI**

In `web/src/pages/DeepDivePage.tsx`:
- Delete the `KindPill` function component (lines ~38–52).
- Delete the header "Legend" block (the `<div className="mt-1 flex flex-wrap …">` containing the two `<KindPill …/>` rows, ~319–329).
- In the pipeline `<ol>` items, delete the `<span className="ml-auto"><KindPill …/></span>` element (~381–383).
- In `interface SseRow`, remove the `kind` field; in `SSE_ROWS`, remove the `kind:` property from every row (keep all rows including browser/bff/cdn).
- In the SSE `<table>`, delete the `<th>Kind</th>` header cell and the `<td>` cell that renders `row.kind === "real" ? "live" : "narrated"` (~615–624).

(The `PHASE_DETAIL` two-column blocks and the Honesty section are removed in Tasks 4 and 6 respectively — leave them here.)

- [ ] **Step 4: ArchitectureDiagram — uniform node styling**

In `web/src/components/deepdive/ArchitectureDiagram.tsx`:
- Change `type Kind = "real" | "narrated" | "store" | "decision";` to `type Kind = "node" | "store" | "decision";`.
- For the two nodes currently `kind: "narrated"` (`A_BFF`, `B_CDN`) and all currently `kind: "real"`, set `kind: "node"`.
- In `Node`, delete the `narrated` branch: `rectClass` becomes `store ? "fill-card stroke-primary/30" : decision ? "fill-secondary stroke-primary/60" : "fill-secondary stroke-primary/45"`; remove `strokeDasharray={narrated ? "5 4" : undefined}` (drop the prop); the title `<text>` always uses `"fill-foreground text-[12.5px] font-medium"`.
- Update the top-of-file comment to drop the "Solid cyan-edged nodes are REAL … dashed … NARRATED" paragraph.

(Geometry fixes are Task 5 — this task only removes the classification.)

- [ ] **Step 5: Typecheck**

Run: `bun run typecheck`
Expected: PASS (no remaining references to `stage.kind`, `StageKind`, `KindPill`, or `SseRow.kind`).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(web): replace real/narrated classification with two-step model"
```

---

## Task 3: Live-flow widget — glow-sync fix + two-step indicator

Fixes the reported bug (the node box glows the instant its SSE event arrives, but the trail line only reaches it a beat later, because the box reads raw SSE status while the line reads the eased particle position). The fix: derive each node's active/done state from the **particle position** too, so box and line light in lockstep. Then add a two-step indicator so the "generate the link, then use it" story is visible.

**Files:**
- Modify: `web/src/components/FlowWidget.tsx`

**Interfaces:**
- Consumes: `FLOW_STAGES`, `STEP_LABELS`, `FlowStep` from `flowStages.ts`; `stageToStop(mode, i)`, `pos`, `mode`, `targetStop`, `route`, `byId` already present in the component.
- Produces: nothing external.

- [ ] **Step 1: Add a position-derived node-state helper**

In `web/src/components/FlowWidget.tsx`, after the derived render values (`const pos = posRef.current;` … `const dashOffset = …;`), compute the current frontier stop from the particle position and add a helper that maps a node index to its visual state:

```tsx
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
  const s = stageToStop(mode, i);
  if (s < 0) return "idle";
  if (s > pos + 0.001) return "idle"; // particle hasn't arrived yet
  if (s === frontierStop) return settledAtEnd ? "done" : "active";
  return "done"; // particle has already passed this node
}
```

- [ ] **Step 2: Drive the node render from the helper**

In the node `.map`, replace `const state: StageStatus = byId.get(stage.id) ?? "idle";` with `const state: StageStatus = nodeStateFromPos(i);`. Leave the rest of the node rendering (rectClass, checkmark, halo) unchanged — it already keys off `state`.

- [ ] **Step 3: Add the two-step indicator above the SVG**

Determine the active step from the frontier stage, then render a two-chip indicator between the existing header row and the `<div className="w-full overflow-x-auto">` that wraps the SVG:

```tsx
const frontierStageIdx = (() => {
  let idx = 0;
  for (let i = 0; i < FLOW_STAGES.length; i++) {
    const s = stageToStop(mode, i);
    if (s >= 0 && s <= Math.round(pos) && s <= frontierStop) idx = i;
  }
  return idx;
})();
const activeStep: FlowStep = isIdle ? 1 : FLOW_STAGES[frontierStageIdx].step;
```

```tsx
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
```

Add `STEP_LABELS` and `FlowStep` to the existing `import … from "@/lib/flowStages"`.

- [ ] **Step 4: Typecheck**

Run: `bun run typecheck`
Expected: PASS.

- [ ] **Step 5: Visual verification (orchestrator)**

Start `bun run dev`, open `/`, select 2–3 assets, click Download all. Confirm: (a) each node box lights **as** the glowing line reaches it — not before; (b) the two-step indicator's Step 1 chip is lit through browser→sign and Step 2 lights from cdn onward; (c) on an immediate re-download (HIT) the build/tee nodes render skipped and the particle takes the bypass lane. (Inspect DOM/behaviour; the animated page's pixel capture is unreliable.)

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "fix(web): sync flow-node glow to particle position; add two-step indicator"
```

---

## Task 4: Pipeline section — real flow only, plain English, grouped by step

Removes the "In this demo / In production" split and the eleven-flat-phases framing; presents each phase's plain-English description grouped under the two steps.

**Files:**
- Modify: `web/src/pages/DeepDivePage.tsx` (section 02 "Pipeline" + its data)

**Interfaces:**
- Consumes: `FLOW_STAGES`, `STEP_LABELS`, `FlowStep` from `flowStages.ts`.
- Produces: nothing external.

- [ ] **Step 1: Delete the demo/prod detail data**

Remove the `PHASE_DETAIL` constant (the whole `Record<StageId, { impl; prod }>` object, ~67–112) and the `StageId` import if it becomes unused (keep it if still referenced elsewhere — check first).

- [ ] **Step 2: Rewrite the pipeline section intro**

Replace the section-02 intro `<p>` (currently "The eleven phases below are the single source of truth … what the production system does differently.") with plain English, no code chips:

> The flow is two HTTP requests. First the browser asks the server to prepare a download and gets back a signed link; then it opens that link to actually receive the ZIP. Here is every phase of both, in order.

- [ ] **Step 3: Group the phase list by step**

Replace the single `<ol>` that maps `FLOW_STAGES` with two grouped blocks. For each `step` in `[1, 2]`, render a step header from `STEP_LABELS[step]` followed by an `<ol>` of only that step's stages. Each list item keeps the numbered chip, `stage.node`, `stage.label`, and `stage.description`, but **drops** the `KindPill` (already removed in Task 2) and the two-column `In this demo / In production` grid. Example shape:

```tsx
{([1, 2] as FlowStep[]).map((step) => (
  <div key={step} className="flex flex-col gap-3">
    <div className="flex flex-col gap-0.5">
      <h3 className="text-sm font-semibold text-foreground">{STEP_LABELS[step].title}</h3>
      <p className="text-xs text-muted-foreground">{STEP_LABELS[step].caption}</p>
    </div>
    <ol className="flex flex-col gap-3">
      {FLOW_STAGES.filter((s) => s.step === step).map((stage) => {
        const n = FLOW_STAGES.indexOf(stage) + 1;
        return (
          <li key={stage.id} className="rounded-xl border border-border bg-card p-4 sm:p-5">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-border bg-secondary font-mono text-[11px] font-semibold text-foreground">
                {n}
              </span>
              <span className="text-sm font-semibold text-foreground">{stage.node}</span>
              <span className="font-mono text-[11px] text-muted-foreground">{stage.label}</span>
            </div>
            <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">
              {stage.description}
            </p>
          </li>
        );
      })}
    </ol>
  </div>
))}
```

Wrap the two blocks in the existing section container (bump its gap so the two groups breathe, e.g. `className="flex flex-col gap-8"` on the inner wrapper).

- [ ] **Step 4: Typecheck**

Run: `bun run typecheck`
Expected: PASS.

- [ ] **Step 5: Visual verification (orchestrator)**

Open `/#/deep-dive`, scroll to section 02. Confirm two clearly-labelled step groups, plain-English descriptions with no code identifiers, and no demo/prod columns or pills.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(web): group deep-dive pipeline by step, plain-English descriptions"
```

---

## Task 5: Architecture section — geometry fixes + plain-English prose

The topology SVG already splits into the two lanes (correct), but has real geometry bugs: the `reads` diagonal (source→tee) mispoints into empty space, and the `hit · cached download.zip` arc label collides with the lane-B header. Fix the geometry with all nodes kept, and soften the surrounding prose to plain English (the "solid cyan-edged nodes are real" exception paragraph is removed).

**Files:**
- Modify: `web/src/components/deepdive/ArchitectureDiagram.tsx` (geometry)
- Modify: `web/src/pages/DeepDivePage.tsx` (section 01 prose)

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing external.

- [ ] **Step 1: Re-lay the canvas + node coordinates**

In `ArchitectureDiagram.tsx`, set `const H = 470;` (was 452) and use this node layout (only the numbers change; keep the node objects and their titles/subs):

```
Lane A header text y = 36
Lane A row: AY = 64
  A_BROWSER x=16   A_BFF x=188   A_API x=360   A_SIGNER x=532
  A_PAYLOAD x=360  y=162   (below A_API)
Divider line y = 214 ; divider label rect y=202 h=24 (unchanged)
Lane B header text y = 250
Lane B row: BY = 276
  B_BROWSER x=16  B_CDN x=168  B_ORIGIN x=320  B_CACHE x=472  B_TEE x=624  B_OUT x=776
  B_SOURCE x=320  y=392   (below B_ORIGIN)
  B_DERIVED x=624 y=392   (below B_TEE)
```

- [ ] **Step 2: Fix the HIT-bypass arc + label**

The arc rises from the top of `B_CACHE` and lands on the top of `B_OUT`, clearing the `B_TEE` node, with the label centred above the arc and clear of the lane-B header (which is left-aligned at x=16). Replace the HIT-bypass `<Edge>` with:

```tsx
<Edge
  d={`M ${cx(B_CACHE)} ${B_CACHE.y} C ${cx(B_CACHE)} ${B_CACHE.y - 30}, ${cx(B_OUT)} ${B_OUT.y - 30}, ${cx(B_OUT)} ${B_OUT.y - 4}`}
  label="hit · cached download.zip"
  lx={(cx(B_CACHE) + cx(B_OUT)) / 2}
  ly={B_CACHE.y - 20}
/>
```

With `BY=276`, the label sits at y≈256 and x≈686 (far right), clear of both the divider rect (bottom y=226) and the left-aligned lane-B header at y=250.

- [ ] **Step 3: Fix the `reads` (source→tee) diagonal so the arrow lands on the Tee node**

Replace the source `<Edge>` so it runs from the top of `B_SOURCE` to the **bottom-centre of `B_TEE`**, and place the label along it without overlapping cache:

```tsx
<Edge
  d={`M ${cx(B_SOURCE)} ${B_SOURCE.y - 4} L ${cx(B_TEE)} ${B_TEE.y + NH + 4}`}
  label="reads"
  lx={(cx(B_SOURCE) + cx(B_TEE)) / 2 + 8}
  ly={(B_SOURCE.y + B_TEE.y + NH) / 2 - 6}
/>
```

- [ ] **Step 4: Fix the two remaining labels**

- The `A_PAYLOAD` write edge label: keep the vertical edge; set `label="saves record"`, `lx={cx(A_API) + 46}`, `ly={A_API.y + NH + 22}`.
- The `B_TEE → B_DERIVED` edge label: change `label="tee"` to `label="saves"`, `lx={cx(B_TEE) + 26}`, `ly={B_TEE.y + NH + 22}`.

- [ ] **Step 5: Soften the architecture prose (DeepDivePage section 01)**

- Rewrite the section-01 intro `<p>` (~335–343) in plain English, removing the `<Term>payload.json</Term>` chip: describe it as "First the dashboard asks the server to prepare the download over a streaming connection — the server resolves the selection, saves a record of it, and signs a link (lane A). Then the browser opens that link as a second request, and the server re-verifies it and either serves a cached archive or builds one (lane B). The streaming connection never carries the ZIP itself — only progress updates."
- **Delete** the paragraph beginning "Solid cyan-edged nodes are real in this demo; dashed nodes…" (~347–355) and replace it with one plain sentence keeping the storage note without the classification: "The two 'buckets' are two local folders — read-only originals and regenerable payloads/archives — the same read-only-vs-derived split two S3 buckets would give you." (No `<Term>` chips.)

- [ ] **Step 6: Typecheck**

Run: `bun run typecheck`
Expected: PASS.

- [ ] **Step 7: Visual verification (orchestrator)**

Open `/#/deep-dive`, section 01. Take a browser screenshot (this page is static — capture is reliable). Confirm: every arrowhead terminates on a node edge (especially source→Tee and the HIT arc→ZIP response); no text label overlaps another label, a node, or the lane headers; all nodes share one style (no dashed outlines). Iterate on the coordinates if any overlap remains, then re-verify.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "fix(web): correct architecture-diagram geometry; uniform nodes; plain prose"
```

---

## Task 6: Remove the Honesty section

Deletes section 07 ("What this demo keeps, narrates, and drops") and its supporting data — the last home of the narrated/drops framing.

**Files:**
- Modify: `web/src/pages/DeepDivePage.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing.

- [ ] **Step 1: Delete the section and its data**

- Remove the `interface SimplifyRow`, the `SIMPLIFY_ROWS` array, and the `STATUS_STYLES` constant (~136–162).
- Remove the entire `{/* 07 — What this demo simplifies */}` `<section>` block (~635–671), including its heading, intro paragraph, and table.
- If the `Badge` import is now unused, remove it; if still used elsewhere, keep it. (Verify with a grep.)

- [ ] **Step 2: Typecheck**

Run: `bun run typecheck`
Expected: PASS (no unused-symbol or missing-reference errors).

- [ ] **Step 3: Visual verification (orchestrator)**

Open `/#/deep-dive`. Confirm the page now ends at section 06 (SSE protocol) followed by the closing "Now watch it run" cross-link, with no Honesty section between them.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore(web): remove Honesty (keeps/narrates/drops) section"
```

---

## Task 7: Docs + README — brand + unified two-step real-flow framing

Aligns the prose docs with the app: no "Asset Hub", no Real/Narrated columns or Keeps/Narrates/Drops framing; describe the unified real flow as two steps. (Brand rename already done in Task 1; this task handles the narrated-framing prose the rename didn't touch.)

**Files:**
- Modify: `README.md`
- Modify: `docs/01-overview.md` (the "Keeps / Narrates / Drops" section)
- Modify: `docs/02-architecture.md` (the "Real / Narrated" table + surrounding text)
- Modify: `docs/05-sse-flow.md` (the "Real / Narrated" event table)
- Modify: `docs/06-frontend.md` (the `flowStages.ts` / per-stage `kind` description)

**Interfaces:**
- Consumes: nothing.
- Produces: nothing.

- [ ] **Step 1: README**

Update the intro (line ~3–4) and the "Live SSE flow visualization" bullet (~22–25): drop "(some real, some narrated)" and the keeps/narrates/drops language; describe it as the two-step flow (generate a signed link, then use it to stream a tee-cached ZIP) with a live particle pipeline and a HIT short-circuit. Update the `docs/01-overview.md` link description (~59) to drop "keeps / narrates / drops".

- [ ] **Step 2: docs/05-sse-flow.md**

In the event table: remove the "Real / Narrated" column entirely. Rewrite the sentence introducing it (~32) to say the stream emits one named event per phase in order (browser/bff/cdn included) to pace the flow. Keep all event rows and their payload/meaning.

- [ ] **Step 3: docs/02-architecture.md**

Remove the "Real / Narrated" column from the diagram-node table (~58–65) and the "**narrated**: the SSE stream emits…" explanation (~54); keep a "Diagram node / What it does" table describing the real flow. Frame the topology as the two requests (mint lane, serve lane).

- [ ] **Step 4: docs/01-overview.md**

Replace the "## Keeps / Narrates / Drops" section (~44 onward) with a "## What the demo implements" section: a short prose or two-column (Aspect / Notes) description of the real mechanisms kept (content-addressed checksum, tee-stream builder, idempotent cache, HMAC signed links, origin re-verification, SSE progress) and, briefly, what a production deployment adds (real object store, multi-tenancy) — as plain prose, **not** as a real/narrated/drops classification.

- [ ] **Step 5: docs/06-frontend.md**

Update the `flowStages.ts` description (~66, ~134) to say it is the single source of truth for stage IDs, labels, and the two-step grouping (`step`), removing the `"live"/"narrated"` caption and `real/narrated kind` references.

- [ ] **Step 6: Confirm the framing is gone**

Run: `grep -rin -E "narrat|real / narrated|keeps / narrates" README.md docs/`
Expected: no matches (or only incidental prose that clearly is not the old classification — review any hit).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "docs: align docs/README with unified two-step real-flow framing"
```

---

## Self-Review

**Spec coverage** (against the user's fix list):
- "Asset Hub → Media Library" → Task 1 (code) + Task 7 (docs prose). ✓
- Live-flow glow bug (line lags box) → Task 3. ✓
- Remove narrated/live keywords (widget + everywhere) → Task 2 (UI) + Task 7 (docs). ✓
- Two-step model (generate URL → use URL to build/tee or cache-serve) → Task 2 (data) + Task 3 (widget indicator) + Task 4 (pipeline) + Task 5 (diagram lanes already present). ✓
- Keep CDN in architecture (part of real flow) → Global Constraints + Task 2 (nodes kept) + Task 5. ✓
- "How it works" URL/topology viz bug (arrows mispoint, text overlap) → Task 5. ✓
- "How it works" — no demo-vs-prod, remove cyan-edged exception → Task 2 (uniform nodes) + Task 5 (prose). ✓
- Pipeline — real flow only, no demo/prod difference → Task 4. ✓
- Remove narrated/live from pipeline → Task 2 (pill) + Task 4. ✓
- Code snippets out of descriptions, plain English → Task 2 (stage descriptions) + Task 4 (pipeline prose) + Task 5 (architecture prose). ✓
- Keep code snippets in Technique sections → untouched (Global Constraints; Tasks 4/5 explicitly scope prose only). ✓
- Remove Honesty section → Task 6. ✓

**Placeholder scan:** Glow-fix and step-indicator code is concrete; diagram coordinates are concrete; prose rewrites give the actual replacement text or a precise instruction with the exact target. No TBD/TODO/"handle edge cases".

**Type consistency:** `FlowStep`, `STEP_LABELS`, and the `step` field are defined in Task 2 (flowStages.ts) and consumed with the same names/types in Tasks 3 and 4. `nodeStateFromPos` returns `StageStatus` (existing type). `Kind` in the diagram narrows to `"node" | "store" | "decision"` and every node is reassigned accordingly in Task 2. No dangling references to removed symbols (`StageKind`, `kind`, `KindPill`, `PHASE_DETAIL`, `SimplifyRow`, `SIMPLIFY_ROWS`, `STATUS_STYLES`) after their removal tasks.
