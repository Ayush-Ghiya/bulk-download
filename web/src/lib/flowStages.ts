export type StageKind = "real" | "narrated";

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
  kind: StageKind;
  description: string;
}

export const FLOW_STAGES: FlowStage[] = [
  { id: "browser", label: "Browser", node: "Browser", kind: "narrated",
    description: "The dashboard sends the selected asset IDs and a zip name." },
  { id: "bff", label: "Dashboard BFF", node: "BFF", kind: "narrated",
    description: "In production a Next.js BFF proxies the request to the API, hiding the API key." },
  { id: "resolve", label: "Resolve assets", node: "API", kind: "real",
    description: "The API looks up each requested asset by ID; unknown IDs are skipped." },
  { id: "payload-write", label: "Write payload", node: "S3 payload", kind: "real",
    description: "A content-addressed payload.json is written to the derived bucket, keyed by SHA-256 checksum." },
  { id: "sign", label: "Sign URL", node: "Signer", kind: "real",
    description: "An HMAC-signed, expiring CDN URL is minted for the checksum." },
  { id: "cdn", label: "CDN edge", node: "CDN", kind: "narrated",
    description: "The signed link is fetched through the CDN, which forwards a miss to the origin." },
  { id: "origin-verify", label: "Verify token", node: "Origin", kind: "real",
    description: "The origin re-verifies the HMAC token and expiry with the same key." },
  { id: "cache-check", label: "Cache check", node: "Cache", kind: "real",
    description: "If download.zip already exists for this checksum it is streamed directly (HIT)." },
  { id: "build", label: "Build ZIP", node: "ZIP builder", kind: "real",
    description: "On a miss the archive is built entry-by-entry from the source bucket." },
  { id: "tee", label: "Tee stream", node: "Client + Cache", kind: "real",
    description: "The ZIP is streamed to the client and written to cache at the same time." },
  { id: "done", label: "Download", node: "Browser", kind: "real",
    description: "The signed link is ready; opening it streams the cached ZIP." },
];
