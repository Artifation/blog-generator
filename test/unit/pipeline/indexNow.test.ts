import { describe, expect, it, vi } from "vitest";
import { pingIndexNow } from "@/pipeline/indexNow";

function makeJsonFetch(status: number, body?: unknown): typeof fetch {
  return vi.fn(async () =>
    new Response(body !== undefined ? JSON.stringify(body) : "", {
      status,
      headers: { "Content-Type": "application/json" },
    })
  ) as unknown as typeof fetch;
}

describe("pingIndexNow", () => {
  it("POSTs correct JSON payload to api.indexnow.org and returns ok on 200", async () => {
    const fetchImpl = makeJsonFetch(200, { ok: true });

    const result = await pingIndexNow({
      host: "artifation.nl",
      key: "abcdef1234567890abcdef1234567890",
      urlList: ["https://artifation.nl/ai-in-hr-mkb/"],
      fetchImpl,
    });

    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);

    const [url, options] = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(url).toBe("https://api.indexnow.org/indexnow");
    expect(options.method).toBe("POST");

    const body = JSON.parse(options.body as string);
    expect(body.host).toBe("artifation.nl");
    expect(body.key).toBe("abcdef1234567890abcdef1234567890");
    expect(body.keyLocation).toBe(
      "https://artifation.nl/abcdef1234567890abcdef1234567890.txt"
    );
    expect(body.urlList).toEqual(["https://artifation.nl/ai-in-hr-mkb/"]);
  });

  it("returns ok:false and status on non-200 response", async () => {
    const fetchImpl = makeJsonFetch(422);

    const result = await pingIndexNow({
      host: "artifation.nl",
      key: "abcdef1234567890abcdef1234567890",
      urlList: ["https://artifation.nl/test/"],
      fetchImpl,
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBe(422);
  });

  it("propagates network errors (caller is responsible for catch)", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("Network failure");
    }) as unknown as typeof fetch;

    await expect(
      pingIndexNow({
        host: "artifation.nl",
        key: "abcdef1234567890abcdef1234567890",
        urlList: ["https://artifation.nl/test/"],
        fetchImpl,
      })
    ).rejects.toThrow("Network failure");
  });

  it("handles multiple URLs in urlList", async () => {
    const fetchImpl = makeJsonFetch(200);

    await pingIndexNow({
      host: "artifation.nl",
      key: "abcdef1234567890abcdef1234567890",
      urlList: [
        "https://artifation.nl/post-1/",
        "https://artifation.nl/post-2/",
        "https://artifation.nl/post-3/",
      ],
      fetchImpl,
    });

    const body = JSON.parse(
      ((fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit])[1]
        .body as string
    );
    expect(body.urlList).toHaveLength(3);
  });
});
