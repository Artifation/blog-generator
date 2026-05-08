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
  const res = await client.emails.send({
    from: input.from,
    to: input.to,
    reply_to: input.replyTo,
    subject: input.subject,
    html: input.html,
    attachments: input.attachments?.map((a) => ({
      filename: a.filename,
      content: a.content,
    })),
  } as Parameters<Resend["emails"]["send"]>[0]);

  if (res.error) throw new Error(`Resend error: ${res.error.message}`);
  return { id: res.data?.id ?? "" };
}
