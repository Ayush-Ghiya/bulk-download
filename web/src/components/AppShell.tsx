import type React from "react";
import { NavLink, Outlet } from "react-router-dom";
import { cn } from "@/lib/utils";

const navItems = [
  { to: "/", label: "Demo", end: true },
  { to: "/how-it-works", label: "How it works", end: false },
];

export function AppShell(): React.JSX.Element {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-border/80 bg-background/70 backdrop-blur-xl">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-6">
          <NavLink to="/" className="group flex items-center gap-2.5">
            <span className="relative flex size-2.5">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary/60" />
              <span className="glow-sm relative inline-flex size-2.5 rounded-full bg-primary" />
            </span>
            <span className="text-sm font-semibold tracking-tight text-foreground">
              Bulk Download
              <span className="ml-1.5 font-mono text-xs font-normal text-muted-foreground">
                /demo
              </span>
            </span>
          </NavLink>

          <nav className="flex items-center gap-1">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-secondary text-foreground"
                      : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">
        <Outlet />
      </main>

      <footer className="border-t border-border/60">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-5 text-xs text-muted-foreground">
          <span className="font-mono">media-library · bulk-download</span>
          <span>Content-addressed cache · tee-streamed ZIP · signed links</span>
        </div>
      </footer>
    </div>
  );
}
