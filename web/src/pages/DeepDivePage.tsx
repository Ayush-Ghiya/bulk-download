import type React from "react";
import { Walkthrough } from "@/components/Walkthrough";

export function DeepDivePage(): React.JSX.Element {
  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-col gap-3 border-b border-border pb-8">
        <span className="w-fit rounded-full border border-border bg-card/60 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          Deep dive
        </span>
        <h1 className="max-w-3xl text-3xl font-semibold leading-tight tracking-tight text-foreground sm:text-4xl">
          How the real feature works
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
          A stage-by-stage tour of the production pipeline behind the demo: signed links, a
          content-addressed idempotent cache, and a tee-streamed ZIP builder.
        </p>
      </header>

      <Walkthrough />
    </div>
  );
}
