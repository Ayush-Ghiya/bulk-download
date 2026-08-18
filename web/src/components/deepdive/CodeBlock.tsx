import type React from "react";

/**
 * A styled dark code excerpt with a small file-path caption. Excerpts are
 * short, verbatim copies of the real server source — no syntax-highlighting
 * dependency, just the mono stack the rest of the app uses for technical values.
 */
export function CodeBlock({
  file,
  code,
  note,
}: {
  file: string;
  code: string;
  note?: string;
}): React.JSX.Element {
  return (
    <figure className="overflow-hidden rounded-xl border border-border bg-[oklch(0.135_0.012_256)]">
      <figcaption className="flex items-center gap-2 border-b border-border/70 bg-card/50 px-4 py-2">
        <span className="size-1.5 shrink-0 rounded-full bg-primary/60" />
        <span className="font-mono text-[11px] tracking-tight text-muted-foreground">
          {file}
        </span>
      </figcaption>
      <pre className="overflow-x-auto p-4 text-[12.5px] leading-relaxed">
        <code className="font-mono text-foreground/90">{code}</code>
      </pre>
      {note ? (
        <figcaption className="border-t border-border/70 px-4 py-2 text-[11px] leading-relaxed text-muted-foreground">
          {note}
        </figcaption>
      ) : null}
    </figure>
  );
}
