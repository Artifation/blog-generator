import { describe, expect, it, vi } from "vitest";

const sendSpy = vi.fn(async (_req: any) => ({ data: { id: "msg-1" }, error: null }));

vi.mock("resend", () => ({
  Resend: class {
    emails = { send: sendSpy };
  },
}));

import { sendEmail } from "@/email/resend";

describe("sendEmail", () => {
  it("forwards camelCase replyTo (not snake_case) plus HTML + attachments", async () => {
    const r = await sendEmail({
      apiKey: "key",
      from: "a@x.test",
      to: "b@x.test",
      replyTo: "c@x.test",
      subject: "S",
      html: "<p>hi</p>",
      attachments: [{ filename: "draft.html", content: Buffer.from("<x/>") }],
    });
    expect(r.id).toBe("msg-1");

    const payload = sendSpy.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    // The SDK (v6) only accepts camelCase replyTo; the old snake_case field was
    // silently dropped, sending mail with no Reply-To header.
    expect(payload.replyTo).toBe("c@x.test");
    expect(payload).not.toHaveProperty("reply_to");
    expect(payload.html).toBe("<p>hi</p>");
    expect((payload.attachments as Array<{ filename: string }>)[0]?.filename).toBe("draft.html");
  });
});
