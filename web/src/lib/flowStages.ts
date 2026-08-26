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
