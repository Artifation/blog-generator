export interface WordpressClientOpts {
  baseUrl: string;
  user: string;
  appPassword: string;
  fetchImpl?: typeof fetch;
}

export interface WordpressClient {
  get<T>(path: string): Promise<T>;
  postJson<T>(path: string, body: unknown): Promise<T>;
  postBinary<T>(path: string, body: Buffer, contentType: string, filename: string): Promise<T>;
  patchJson<T>(path: string, body: unknown): Promise<T>;
}

// Realistische browser-UA om Hostinger/LiteSpeed WAFs te omzeilen die Node's
// default `undici/x.y.z` UA als bot herkennen en met 403 + reCAPTCHA blokkeren.
// Zelfde aanpak als pipeline/sitemap.ts.
const DEFAULT_HEADERS: Record<string, string> = {
  "User-Agent": "Mozilla/5.0 (compatible; ArtifationBlogBot/1.0; +https://artifation.nl)",
  Accept: "application/json, */*",
};

export function createWordpressClient(opts: WordpressClientOpts): WordpressClient {
  const f = opts.fetchImpl ?? fetch;
  const auth = `Basic ${Buffer.from(`${opts.user}:${opts.appPassword}`).toString("base64")}`;

  async function call<T>(path: string, init: RequestInit, timeoutMs = 30_000): Promise<T> {
    // Bound every WP call so a hung/slow WordPress host can't stall the run.
    const res = await f(`${opts.baseUrl}${path}`, {
      ...init,
      signal: init.signal ?? AbortSignal.timeout(timeoutMs),
      headers: { ...DEFAULT_HEADERS, Authorization: auth, ...(init.headers ?? {}) },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`WP ${init.method ?? "GET"} ${path} failed: ${res.status} ${body}`);
    }
    return (await res.json()) as T;
  }

  return {
    get: (path) => call(path, { method: "GET" }),
    postJson: (path, body) =>
      call(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    postBinary: (path, body, contentType, filename) => {
      // Reject oversized uploads before streaming them to WP (a bad optimizer
      // output or unexpected input shouldn't push tens of MB at the host).
      const MAX_UPLOAD_BYTES = 12 * 1024 * 1024; // 12 MB
      if (body.length > MAX_UPLOAD_BYTES) {
        throw new Error(
          `WP upload too large: ${body.length} bytes exceeds ${MAX_UPLOAD_BYTES} byte limit`,
        );
      }
      return call(path, {
        method: "POST",
        headers: {
          "Content-Type": contentType,
          "Content-Disposition": `attachment; filename="${filename}"`,
        },
        // Wrap in a Blob so the body is a typed BodyInit that satisfies both
        // root tsc (node lib) and webapp tsc (dom lib). Node 18+ has a global
        // Blob class so this works in both runtimes. The cast through Uint8Array
        // narrows Buffer's ArrayBufferLike generic to ArrayBuffer for BlobPart.
        body: new Blob([body as unknown as Uint8Array<ArrayBuffer>], { type: contentType }),
      }, 60_000);
    },
    patchJson: (path, body) =>
      call(path, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
  };
}
