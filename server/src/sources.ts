/**
 * The seed asset sources, inlined so the server needs no filesystem at
 * runtime (serverless has no persistent/writable disk). Kept in sync by
 * hand with the human-readable originals under server/storage/source/.
 */
export interface SeedSource {
  content: string;
  contentType: string;
}

export const SEED_SOURCES: Record<string, SeedSource> = {
  "mountains.svg": {
    content: `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400">
  <rect width="600" height="400" fill="#1e3a5f"/>
  <polygon points="0,400 180,180 320,400" fill="#3b6ea5"/>
  <polygon points="220,400 400,140 600,400" fill="#5b8fc7"/>
  <circle cx="480" cy="90" r="42" fill="#ffd76a"/>
  <text x="24" y="376" font-family="sans-serif" font-size="28" fill="#eaf2fb">mountains</text>
</svg>
`,
    contentType: "image/svg+xml",
  },
  "ocean.svg": {
    content: `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400">
  <rect width="600" height="400" fill="#001a4d"/>
  <rect y="200" width="600" height="200" fill="#0066cc"/>
  <circle cx="150" cy="120" r="35" fill="#00ccff"/>
  <circle cx="500" cy="280" r="28" fill="#0099ff"/>
  <path d="M 0 250 Q 150 220 300 250 T 600 250" stroke="#0052a3" stroke-width="3" fill="none"/>
  <text x="24" y="376" font-family="sans-serif" font-size="28" fill="#e0f7ff">ocean</text>
</svg>
`,
    contentType: "image/svg+xml",
  },
  "desert.svg": {
    content: `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400">
  <rect width="600" height="400" fill="#f4d4a8"/>
  <polygon points="0,300 100,200 200,300" fill="#e8b896"/>
  <polygon points="250,320 380,150 500,320" fill="#d4a574"/>
  <circle cx="500" cy="80" r="50" fill="#ffeb99"/>
  <ellipse cx="150" cy="350" rx="40" ry="15" fill="#c9945f"/>
  <text x="24" y="376" font-family="sans-serif" font-size="28" fill="#8b6f47">desert</text>
</svg>
`,
    contentType: "image/svg+xml",
  },
  "forest.svg": {
    content: `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400">
  <rect width="600" height="400" fill="#2d5016"/>
  <polygon points="0,400 120,180 240,400" fill="#3d6b1f"/>
  <polygon points="200,400 350,150 500,400" fill="#4a8f2a"/>
  <polygon points="420,400 520,220 620,400" fill="#5baa36"/>
  <circle cx="200" cy="80" r="25" fill="#ffdd57"/>
  <text x="24" y="376" font-family="sans-serif" font-size="28" fill="#c8e6c9">forest</text>
</svg>
`,
    contentType: "image/svg+xml",
  },
};
