import { Resend } from "resend";

export interface SendEmailInput {
  apiKey: string;
  from: string;
  to: string;
  replyTo: string;
  subject: string;
  html: string;
  attachments?: { filename: string; content: Buffer }[];
}

export async function sendEmail(input: SendEmailInput): Promise<{ id: string }> {
  const client = new Resend(input.apiKey);
  // Resend SDK v6 expects camelCase `replyTo`; the old snake_case `reply_to`
  // was silently dropped (and the `as` cast hid the type error), so every
  // notification went out with no Reply-To header.
  const res = await client.emails.send({
    from: input.from,
    to: input.to,
    replyTo: input.replyTo,
    subject: input.subject,
    html: input.html,
    attachments: input.attachments?.map((a) => ({
      filename: a.filename,
      content: a.content,
    })),
  });

  if (res.error) throw new Error(`Resend error: ${res.error.message}`);
  return { id: res.data?.id ?? "" };
}
