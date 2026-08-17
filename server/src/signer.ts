import { createHmac, timingSafeEqual } from "node:crypto";

const DAY = 24 * 60 * 60;
export const DEFAULT_EXPIRES_IN = 5 * DAY;
export const MAX_EXPIRES_IN = 7 * DAY;

export function bulkDownloadContentPath(
  checksum: string,
  zipName: string,
): string {
  return `/download-all/${checksum}/${zipName}`;
}

export interface UrlSignerConfig {
  securityKey: string;
  baseUrl: string;
  tenantId: string;
}

export interface SignResult {
  url: string;
  token: string;
  expires: number;
  expiresAt: string;
}

/**
 * Minimal signed-URL scheme: token = base64url(HMAC-SHA256(key, pathname + "\n" + expires)).
 * The percent-encoded pathname is signed so zipNames with spaces survive on the wire.
 */
export class UrlSigner {
  private readonly securityKey: string;
  private readonly baseUrl: string;
  private readonly tenantId: string;

  constructor(config: UrlSignerConfig) {
    this.securityKey = config.securityKey;
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.tenantId = config.tenantId;
  }

  private fullPathname(contentPath: string): string {
    const path = contentPath.startsWith("/") ? contentPath : `/${contentPath}`;
    return encodeURI(`/assets/${this.tenantId}${path}`);
  }

  private token(pathname: string, expires: number): string {
    return createHmac("sha256", this.securityKey)
      .update(`${pathname}\n${expires}`)
      .digest("base64url");
  }

  sign(contentPath: string, opts: { expiresIn?: number } = {}): SignResult {
    const requested = opts.expiresIn ?? DEFAULT_EXPIRES_IN;
    const expiresIn = Math.min(Math.max(Math.floor(requested), 1), MAX_EXPIRES_IN);
    const now = Math.floor(Date.now() / 1000);
    const expires = now + expiresIn;
    const pathname = this.fullPathname(contentPath);
    const token = this.token(pathname, expires);
    const url = new URL(this.baseUrl);
    url.pathname = pathname;
    url.searchParams.set("token", token);
    url.searchParams.set("expires", String(expires));
    return {
      url: url.toString(),
      token,
      expires,
      expiresAt: new Date(expires * 1000).toISOString(),
    };
  }

  verify(pathname: string, token: string, expires: number): boolean {
    const now = Math.floor(Date.now() / 1000);
    if (!Number.isFinite(expires) || now > expires) return false;
    const expected = this.token(encodeURI(decodeURI(pathname)), expires);
    const a = Buffer.from(token);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    try {
      return timingSafeEqual(a, b);
    } catch {
      return false;
    }
  }
}
