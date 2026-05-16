"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Sparkles, Copy, RefreshCw, Linkedin, Mail, MessageSquare } from "lucide-react";
import { repurposePostAction } from "~/lib/actions/repurpose";

type Repurposed = {
  linkedin?: { hook_first_200: string; full_text: string; cta: string };
  newsletter?: { subject_line: string; preheader: string; body_html: string; cta_url: string };
  xthread?: { tweets: string[]; blog_link_tweet_index: number };
  generated_at?: string;
} | null;

export function RepurposePanel({
  postId,
  repurposed,
}: {
  postId: string;
  repurposed: Repurposed;
}) {
  const router = useRouter();
  const [running, setRunning] = React.useState<string | null>(null);
  const [open, setOpen] = React.useState<"linkedin" | "newsletter" | "xthread" | null>(
    repurposed?.linkedin ? "linkedin" : repurposed?.newsletter ? "newsletter" : repurposed?.xthread ? "xthread" : null
  );

  async function generate(formats: Array<"linkedin" | "newsletter" | "xthread">) {
    setRunning(formats.join(","));
    const tid = toast.loading(`Genereren ${formats.join(" + ")}…`);
    const res = await repurposePostAction(postId, formats);
    toast.dismiss(tid);
    setRunning(null);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Klaar — schuif door om te kopiëren");
    router.refresh();
    setOpen(formats[0] ?? null);
  }

  function copy(text: string) {
    navigator.clipboard.writeText(text);
    toast.success("Gekopieerd naar klembord");
  }

  return (
    <aside className="col gap-lg">
      <div className="card">
        <div className="card-header">
          <h3>Repurpose</h3>
        </div>
        <div className="card-body col" style={{ gap: 10 }}>
          <p className="muted" style={{ margin: 0, fontSize: 12 }}>
            Maak een LinkedIn-post, nieuwsbrief of X-thread van deze blog.
          </p>
          <div className="col" style={{ gap: 6 }}>
            <FormatButton
              icon={<Linkedin size={14} />}
              label="LinkedIn-post"
              has={!!repurposed?.linkedin}
              running={running === "linkedin"}
              onClick={() => generate(["linkedin"])}
            />
            <FormatButton
              icon={<Mail size={14} />}
              label="Nieuwsbrief"
              has={!!repurposed?.newsletter}
              running={running === "newsletter"}
              onClick={() => generate(["newsletter"])}
            />
            <FormatButton
              icon={<MessageSquare size={14} />}
              label="X-thread (7-9 tweets)"
              has={!!repurposed?.xthread}
              running={running === "xthread"}
              onClick={() => generate(["xthread"])}
            />
          </div>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => generate(["linkedin", "newsletter", "xthread"])}
            disabled={running !== null}
            style={{ marginTop: 6 }}
          >
            {running === "linkedin,newsletter,xthread" ? (
              <>
                <RefreshCw size={13} className="spin" /> Alles genereren…
              </>
            ) : (
              <>
                <Sparkles size={13} /> Alles in één keer
              </>
            )}
          </button>
        </div>
      </div>

      {repurposed?.linkedin && (
        <Pane
          title="LinkedIn-post"
          open={open === "linkedin"}
          onToggle={() => setOpen(open === "linkedin" ? null : "linkedin")}
        >
          <Snippet label="Hook (eerste 200 chars)" text={repurposed.linkedin.hook_first_200} onCopy={copy} />
          <Snippet label="Volledige tekst" text={repurposed.linkedin.full_text} onCopy={copy} multiline />
          <Snippet label="CTA" text={repurposed.linkedin.cta} onCopy={copy} />
        </Pane>
      )}

      {repurposed?.newsletter && (
        <Pane
          title="Nieuwsbrief"
          open={open === "newsletter"}
          onToggle={() => setOpen(open === "newsletter" ? null : "newsletter")}
        >
          <Snippet label="Onderwerp" text={repurposed.newsletter.subject_line} onCopy={copy} />
          <Snippet label="Preheader" text={repurposed.newsletter.preheader} onCopy={copy} />
          <Snippet label="Body HTML" text={repurposed.newsletter.body_html} onCopy={copy} multiline />
          <Snippet label="CTA URL" text={repurposed.newsletter.cta_url} onCopy={copy} />
        </Pane>
      )}

      {repurposed?.xthread && (
        <Pane
          title="X-thread"
          open={open === "xthread"}
          onToggle={() => setOpen(open === "xthread" ? null : "xthread")}
        >
          <div className="col" style={{ gap: 8 }}>
            {repurposed.xthread.tweets.map((t, i) => (
              <div
                key={i}
                style={{
                  border: i === repurposed.xthread!.blog_link_tweet_index ? "1px solid var(--secondary)" : "1px solid var(--border)",
                  borderRadius: 8,
                  padding: 10,
                  fontSize: 13,
                  background: "var(--surface)",
                }}
              >
                <div className="row between" style={{ marginBottom: 4 }}>
                  <span className="muted mono" style={{ fontSize: 11 }}>
                    Tweet {i + 1}
                    {i === repurposed.xthread!.blog_link_tweet_index && " · link"}
                  </span>
                  <span className="muted tnum" style={{ fontSize: 11 }}>
                    {t.length}/280
                  </span>
                </div>
                <div>{t}</div>
                <div style={{ marginTop: 6 }}>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => copy(t)}>
                    <Copy size={11} /> Kopieer
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Pane>
      )}
    </aside>
  );
}

function FormatButton({
  icon,
  label,
  has,
  running,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  has: boolean;
  running: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={running}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 10px",
        border: "1px solid var(--border)",
        borderRadius: 8,
        background: has ? "var(--success-bg)" : "var(--surface)",
        cursor: running ? "wait" : "pointer",
        fontSize: 13,
        textAlign: "left",
      }}
    >
      <span style={{ color: has ? "var(--success)" : "var(--text-muted)" }}>{icon}</span>
      <span style={{ flex: 1 }}>{label}</span>
      <span className="muted" style={{ fontSize: 11 }}>
        {running ? "…" : has ? "klaar — opnieuw" : "Genereer"}
      </span>
    </button>
  );
}

function Pane({
  title,
  open,
  onToggle,
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="card">
      <div className="card-header" onClick={onToggle} style={{ cursor: "pointer" }}>
        <h3>{title}</h3>
        <span className="card-action muted" style={{ fontSize: 11 }}>
          {open ? "verbergen" : "tonen"}
        </span>
      </div>
      {open && <div className="card-body col" style={{ gap: 12 }}>{children}</div>}
    </div>
  );
}

function Snippet({
  label,
  text,
  onCopy,
  multiline,
}: {
  label: string;
  text: string;
  onCopy: (s: string) => void;
  multiline?: boolean;
}) {
  return (
    <div>
      <div className="row between" style={{ marginBottom: 4 }}>
        <label style={{ fontSize: 11, fontWeight: 500, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
          {label}
        </label>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => onCopy(text)}>
          <Copy size={11} /> Kopieer
        </button>
      </div>
      {multiline ? (
        <textarea
          className="textarea"
          readOnly
          rows={6}
          value={text}
          style={{ fontSize: 12, background: "var(--surface-2)" }}
        />
      ) : (
        <input className="input" readOnly value={text} style={{ background: "var(--surface-2)" }} />
      )}
    </div>
  );
}
