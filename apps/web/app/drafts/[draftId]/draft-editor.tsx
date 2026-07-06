"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle, XCircle, Eye, Code, Type as TypeIcon, Save, RefreshCw } from "lucide-react";
import { updateDraftAction, publishDraftAction, rejectDraftAction } from "~/lib/actions/drafts";
import { slugify } from "~/lib/utils";
import { sanitizePreviewHtml } from "~/lib/security/sanitize-preview";
import { ImageUploader } from "./image-uploader";
import { RichTextEditor } from "./rich-text-editor";

interface DraftData {
  id: string;
  title: string;
  slug: string;
  contentHtml: string;
  metaTitle: string;
  metaDescription: string;
  tldr: string;
  status: string;
  weightedTotal: number | null;
  rubricScores: Record<string, number> | null;
  hardFails: string[];
  imagePath: string | null;
}

type Tab = "edit" | "preview" | "html" | "seo";

export function DraftEditor({
  draft,
  publishDestination,
  qualityThreshold,
}: {
  draft: DraftData;
  publishDestination: string;
  qualityThreshold: number;
}) {
  const router = useRouter();
  const [tab, setTab] = React.useState<Tab>("edit");
  const [title, setTitle] = React.useState(draft.title);
  const [slug, setSlug] = React.useState(draft.slug);
  const [contentHtml, setContentHtml] = React.useState(draft.contentHtml);
  const [metaTitle, setMetaTitle] = React.useState(draft.metaTitle);
  const [metaDescription, setMetaDescription] = React.useState(draft.metaDescription);
  const [tldr, setTldr] = React.useState(draft.tldr);
  const [saving, setSaving] = React.useState(false);
  const [publishing, setPublishing] = React.useState(false);

  const dirty =
    title !== draft.title ||
    slug !== draft.slug ||
    contentHtml !== draft.contentHtml ||
    metaTitle !== draft.metaTitle ||
    metaDescription !== draft.metaDescription ||
    tldr !== draft.tldr;

  // Warn before a tab close / reload / external navigation when there are
  // unsaved edits, so a reviewer doesn't silently lose a long edit. (In-app
  // route changes via the sidebar aren't covered by beforeunload — same
  // limitation as the settings auto-save hook.)
  React.useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  async function save() {
    setSaving(true);
    const r = await updateDraftAction(draft.id, "/drafts", {
      title,
      slug,
      contentHtml,
      metaTitle,
      metaDescription,
      tldr,
    });
    setSaving(false);
    if (r.ok) toast.success("Opgeslagen");
    else toast.error(r.error);
  }

  async function publish() {
    if (dirty) await save();
    setPublishing(true);
    const r = await publishDraftAction(draft.id);
    setPublishing(false);
    if (r.ok) {
      // Offer a one-click "Openen" for the resulting URL (markdown export,
      // WordPress post, or built-in blog post) so the operator doesn't have to
      // hand-assemble the link — r.url is same-origin for markdown/built_in.
      toast.success(r.message ?? "Gepubliceerd", {
        action: r.url
          ? { label: "Openen", onClick: () => window.open(r.url!, "_blank") }
          : undefined,
      });
      router.push("/drafts");
    } else {
      toast.error(r.error);
    }
  }

  async function reject() {
    // Two-step so a mis-click can't reject: confirm, then optionally a reason.
    // prompt() returns null on Cancel — abort instead of rejecting anyway (the
    // old `?? undefined` rejected even when the user cancelled).
    if (!confirm("Deze draft afwijzen? Het topic gaat terug uit de wachtrij.")) return;
    const reason = prompt("Reden voor afwijzen? (optioneel)");
    if (reason === null) return; // cancelled at the reason step
    await rejectDraftAction(draft.id, reason.trim() || undefined);
  }

  const readOnly = draft.status === "published" || draft.status === "rejected";

  return (
    <>
      <div className="page-head">
        <div className="ph-text">
          <h1>{title || "Untitled draft"}</h1>
          <div className="ph-sub">Status: {draft.status.replace("_", " ")} · /{slug}</div>
        </div>
        {!readOnly && (
          <div className="ph-actions">
            <button type="button" className="btn btn-outline" onClick={save} disabled={saving || !dirty}>
              {saving ? <><RefreshCw size={13} className="spin" /> Opslaan…</> : <><Save size={13} /> {dirty ? "Opslaan" : "Geen wijzigingen"}</>}
            </button>
            <button type="button" className="btn btn-danger" onClick={reject}>
              <XCircle size={13} /> Afwijzen
            </button>
            <button type="button" className="btn btn-primary" onClick={publish} disabled={publishing}>
              <CheckCircle size={13} /> {publishing ? "Publiceren…" : `Publiceer naar ${publishDestination.replace("_", " ")}`}
            </button>
          </div>
        )}
      </div>

      <div className="editor-grid">
        <div className="col gap-lg">
          <div className="card">
            <div className="card-body col" style={{ gap: 12 }}>
              <div className="field">
                <label>Titel</label>
                <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} disabled={readOnly} />
              </div>
              <div className="field">
                <label>Slug</label>
                <input className="input mono" value={slug} onChange={(e) => setSlug(slugify(e.target.value))} disabled={readOnly} />
              </div>
              <div className="field">
                <label>TL;DR</label>
                <textarea className="textarea" rows={2} value={tldr} onChange={(e) => setTldr(e.target.value)} disabled={readOnly} />
              </div>
              {!readOnly && <ImageUploader draftId={draft.id} hasImage={!!draft.imagePath} />}
            </div>
          </div>

          <div className="card">
            <div className="editor-tabs">
              <button type="button" className={`editor-tab ${tab === "edit" ? "active" : ""}`} onClick={() => setTab("edit")}>
                <TypeIcon size={13} /> Edit
              </button>
              <button type="button" className={`editor-tab ${tab === "preview" ? "active" : ""}`} onClick={() => setTab("preview")}>
                <Eye size={13} /> Preview
              </button>
              <button type="button" className={`editor-tab ${tab === "html" ? "active" : ""}`} onClick={() => setTab("html")}>
                <Code size={13} /> HTML
              </button>
              <button type="button" className={`editor-tab ${tab === "seo" ? "active" : ""}`} onClick={() => setTab("seo")}>
                <TypeIcon size={13} /> SEO
              </button>
            </div>
            <div className="card-body">
              {tab === "edit" && (
                <RichTextEditor
                  value={contentHtml}
                  onChange={setContentHtml}
                  readOnly={readOnly}
                />
              )}
              {tab === "preview" && (
                <article className="prose">
                  <h1>{title}</h1>
                  {tldr && <div className="tldr-box"><strong>TL;DR.</strong> {tldr}</div>}
                  {draft.imagePath && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`/api/draft-image/${draft.id}`}
                      alt={title}
                      style={{ width: "100%", height: "auto", borderRadius: 10, margin: "16px 0" }}
                    />
                  )}
                  <div dangerouslySetInnerHTML={{ __html: sanitizePreviewHtml(contentHtml) }} />
                </article>
              )}
              {tab === "html" && (
                <textarea
                  className="textarea mono"
                  rows={28}
                  value={contentHtml}
                  onChange={(e) => setContentHtml(e.target.value)}
                  disabled={readOnly}
                />
              )}
              {tab === "seo" && (
                <div className="col" style={{ gap: 14 }}>
                  <div className="field">
                    <label>Meta titel</label>
                    <input className="input" value={metaTitle} onChange={(e) => setMetaTitle(e.target.value)} disabled={readOnly} maxLength={70} />
                    <div className="seo-meter">
                      <div className="seo-count">
                        <span>{metaTitle.length} tekens</span>
                        <span>doel 60–70</span>
                      </div>
                      <div className="seo-bar">
                        <div
                          className={`seo-bar-fill ${metaTitle.length > 70 ? "over" : metaTitle.length < 50 ? "under" : ""}`}
                          style={{ width: `${Math.min((metaTitle.length / 70) * 100, 100)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="field">
                    <label>Meta description</label>
                    <textarea className="textarea" rows={3} value={metaDescription} onChange={(e) => setMetaDescription(e.target.value)} disabled={readOnly} />
                    <div className="seo-meter">
                      <div className="seo-count">
                        <span>{metaDescription.length} tekens</span>
                        <span>doel 140–160</span>
                      </div>
                      <div className="seo-bar">
                        <div
                          className={`seo-bar-fill ${metaDescription.length > 160 ? "over" : metaDescription.length < 130 ? "under" : ""}`}
                          style={{ width: `${Math.min((metaDescription.length / 160) * 100, 100)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <aside className="col gap-lg">
          <div className="card quality-card">
            <div className="card-header">
              <h3>Quality score</h3>
            </div>
            <div className="card-body">
              {draft.weightedTotal != null ? (
                <>
                  <div className="qc-total">
                    <span className="qc-num">{draft.weightedTotal.toFixed(1)}</span>
                    <span className="qc-max">/ 10</span>
                  </div>
                  <div className="qc-bar">
                    <div
                      className={`qc-bar-fill ${draft.weightedTotal < qualityThreshold ? "warn" : ""}`}
                      style={{ width: `${(draft.weightedTotal / 10) * 100}%` }}
                    />
                  </div>
                </>
              ) : (
                <p className="muted" style={{ margin: 0, fontSize: 13 }}>Nog niet beoordeeld.</p>
              )}
              {draft.rubricScores && (
                <div className="qc-rubric">
                  {Object.entries(draft.rubricScores).map(([k, v]) => (
                    <div key={k} className="qc-row">
                      <span className="qc-label">{k.replace(/_/g, " ")}</span>
                      <div className="qc-bar">
                        <div className="qc-bar-fill" style={{ width: `${(v / 10) * 100}%` }} />
                      </div>
                      <span className="qc-val tnum">{v.toFixed(1)}</span>
                    </div>
                  ))}
                </div>
              )}
              {draft.hardFails.length > 0 && (
                <>
                  <div className="muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em", margin: "16px 0 6px", fontWeight: 600 }}>
                    Hard fails
                  </div>
                  <div className="col" style={{ gap: 6 }}>
                    {draft.hardFails.map((f) => {
                      // Split factChecker-fixer's "claim\n→ FIX: rewrite"
                      // zodat de FIX herkenbaar onder de claim staat met een
                      // copy-knop voor 1-klik plakken in de editor.
                      const fixIdx = f.indexOf("\n→ FIX: ");
                      if (fixIdx < 0) {
                        return <span key={f} className="badge b-red" style={{ alignSelf: "flex-start" }}>{f}</span>;
                      }
                      const claim = f.slice(0, fixIdx);
                      const fix = f.slice(fixIdx + "\n→ FIX: ".length);
                      return (
                        <div key={f} style={{ display: "flex", flexDirection: "column", gap: 3, padding: 8, background: "rgba(185,28,28,0.06)", borderRadius: 6, borderLeft: "3px solid rgba(185,28,28,0.5)" }}>
                          <div style={{ fontSize: 12, lineHeight: 1.4 }}>{claim}</div>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--success, #047857)" }}>
                            <span style={{ fontWeight: 600 }}>→ FIX:</span>
                            <span style={{ flex: 1, fontStyle: "italic" }}>{fix}</span>
                            <button
                              type="button"
                              className="btn btn-ghost"
                              style={{ fontSize: 11, padding: "2px 8px", whiteSpace: "nowrap" }}
                              onClick={() => navigator.clipboard.writeText(fix)}
                              title="Kopieer voorgestelde vervanging"
                            >
                              Kopieer
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}
