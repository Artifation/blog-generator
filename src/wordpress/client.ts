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

export function createWordpressClient(opts: WordpressClientOpts): WordpressClient {
  const f = opts.fetchImpl ?? fetch;
  const auth = `Basic ${Buffer.from(`${opts.user}:${opts.appPassword}`).toString("base64")}`;

  async function call<T>(path: string, init: RequestInit): Promise<T> {
    const res = await f(`${opts.baseUrl}${path}`, {
      ...init,
      headers: { Authorization: auth, ...(init.headers ?? {}) },
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
    postBinary: (path, body, contentType, filename) =>
      call(path, {
        method: "POST",
        headers: {
          "Content-Type": contentType,
          "Content-Disposition": `attachment; filename="${filename}"`,
        },
        body,
      }),
    patchJson: (path, body) =>
      call(path, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
  };
}
