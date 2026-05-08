import { describe, expect, it, vi } from "vitest";

vi.mock("resend", () => ({
  Resend: class {
    emails = {
      send: vi.fn(async (req: any) => ({ data: { id: "msg-1" }, error: null, _req: req })),
    };
  },
}));

import { sendEmail } from "@/email/resend";

describe("sendEmail", () => {
  it("calls Resend SDK with rendered HTML + attachments", async () => {
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
  });
});
