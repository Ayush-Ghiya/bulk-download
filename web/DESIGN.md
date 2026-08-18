# Design system — Dark observability / control-room

This is the **contract** every page and component follows so the Demo page, the flow
widget, and the Deep-dive page read as one system. Tokens live in `src/index.css`.

## Palette

The dark palette is the **default** (and only) theme. Values are on `:root`; the `dark`
class is set on `<html>` so shadcn `dark:` utilities engage. All values are oklch.

| Token | Value | Role |
| --- | --- | --- |
| `--background` | `oklch(0.16 0.014 256)` | Near-black slate base |
| `--foreground` | `oklch(0.93 0.008 250)` | Primary text |
| `--card` | `oklch(0.205 0.017 256)` | Layered surface (panels, cards) |
| `--popover` | `oklch(0.205 0.017 256)` | Overlays / dialogs |
| `--primary` | `oklch(0.83 0.135 197)` | **Luminous cyan accent** — the ONE glow color |
| `--primary-foreground` | `oklch(0.18 0.03 250)` | Dark text on the cyan accent |
| `--secondary` | `oklch(0.27 0.02 256)` | Muted chips / raised surface |
| `--muted` | `oklch(0.245 0.017 256)` | Recessed surface |
| `--muted-foreground` | `oklch(0.66 0.02 250)` | Secondary text, labels |
| `--accent` | `oklch(0.3 0.035 220)` | Hover surface (faint cyan tint) |
| `--destructive` | `oklch(0.64 0.2 25)` | Errors |
| `--border` | `oklch(0.98 0.01 250 / 9%)` | Hairline borders (near-white @ 9%) |
| `--input` | `oklch(0.98 0.01 250 / 12%)` | Field borders |
| `--ring` | `oklch(0.83 0.135 197 / 55%)` | Focus ring (cyan) |
| `--glow` / `--glow-strong` / `--glow-soft` | cyan @ 100 / 65% / 28% | Glow recipe inputs |

**Rule:** cyan (`--primary` / `--glow`) is reserved for **active / live / particle** states
and the primary CTA. Never use it for large fills or idle chrome — its power comes from being
rare against the slate.

## Accent-glow recipe

Custom Tailwind utilities (defined with `@utility` in `index.css`):

- **`.glow`** — luminous halo for active nodes and the download CTA:
  `box-shadow: 0 0 0 1px var(--glow-soft), 0 0 16px -2px var(--glow-strong), 0 0 40px -8px var(--glow-soft);`
- **`.glow-sm`** — hover / secondary emphasis: `box-shadow: 0 0 12px -4px var(--glow-strong);`
- **`.text-glow`** — glowing mono values: cyan color + `text-shadow: 0 0 10px var(--glow-soft);`
- **`.edge-glow`** — hairline luminous top edge on hero panels (a `::before` gradient rule).

For SVG (the flow widget), reuse `--glow` via `filter: drop-shadow(0 0 6px var(--glow))` or the
theme color `text-primary` / `fill-primary`.

## Typography

- **Sans** (`--font-sans`, default): system UI stack. Body copy, headings.
- **Mono** (`--font-mono` → `.font-mono`): `ui-monospace, "SF Mono", "JetBrains Mono", …`.
  Use for **technical values and labels**: checksums, byte sizes, stage kinds (`live`/`narrated`),
  section eyebrows, status pills. No external fonts — system stacks only.
- Headings: `font-semibold tracking-tight`. Page titles `text-3xl sm:text-4xl`, section titles
  `text-lg`. Eyebrow labels: `font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground`.
- Body: `text-sm leading-relaxed text-muted-foreground`; emphasis with `text-foreground`.

## Spacing rhythm

- Page container: `max-w-6xl px-6` (in `AppShell`).
- Between major sections: `gap-14` (demo) / `gap-10` (deep-dive).
- Within a section: `gap-5` (header → content); cards use `p-4`.
- Radii: `--radius: 0.75rem`. Cards `rounded-xl`, hero panels `rounded-2xl`, chips `rounded-full`.

## Component patterns

**Card / panel** — layered surface, hairline border:
`rounded-xl border border-border bg-card`. Hero panels add depth + luminous edge:
`edge-glow rounded-2xl border border-border bg-card/60 p-8 shadow-2xl shadow-black/40`.

**Section header** — mono eyebrow (`NN · LABEL`) over a `text-lg` title, optional right-aligned
action/status. See `SectionHeader` in `DemoPage.tsx`.

**Stat / badge / status pill** — `Badge variant="outline"` with `font-mono`, a leading
`size-1.5 rounded-full` dot. Cyan dot + `border-primary/50 text-primary` = active/live; muted
dot = idle. Selected states use `border-primary/70` + `.glow-sm`, never a heavy fill.
