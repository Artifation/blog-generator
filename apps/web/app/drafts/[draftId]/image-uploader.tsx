"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Upload, RefreshCw, Image as ImageIcon } from "lucide-react";

export function ImageUploader({
  draftId,
  hasImage,
}: {
  draftId: string;
  hasImage: boolean;
}) {
  const router = useRouter();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = React.useState(false);
  const [bust, setBust] = React.useState(0); // cache-bust query param

  async function handleFile(file: File) {
    setUploading(true);
    const tid = toast.loading("Bezig met uploaden…");
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await fetch(`/api/upload-image/${draftId}`, { method: "POST", body: fd });
      const data = await res.json();
      toast.dismiss(tid);
      setUploading(false);
      if (!data.ok) {
        toast.error(data.error ?? "Upload faalde");
        return;
      }
      toast.success("Featured image vervangen");
      setBust(Date.now());
      router.refresh();
    } catch (err) {
      toast.dismiss(tid);
      setUploading(false);
      toast.error((err as Error).message);
    }
  }

  return (
    <div
      style={{
        border: "1px dashed var(--border-strong)",
        background: "var(--surface-2)",
        borderRadius: 10,
        padding: 14,
      }}
    >
      <div className="row" style={{ gap: 12, alignItems: "center" }}>
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 8,
            background: hasImage ? "transparent" : "rgba(59,130,246,0.10)",
            color: "var(--secondary)",
            display: "grid",
            placeItems: "center",
            overflow: "hidden",
            flexShrink: 0,
          }}
        >
          {hasImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/api/draft-image/${draftId}?v=${bust}`}
              alt="Featured"
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          ) : (
            <ImageIcon size={24} />
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>
            {hasImage ? "Featured image" : "Geen featured image"}
          </div>
          <div className="muted" style={{ fontSize: 12 }}>
            Upload een eigen foto of behoud de AI-gegenereerde versie. Max 8 MB · JPG, PNG, WebP, AVIF.
          </div>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif,image/gif"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          className="btn btn-outline"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? (
            <>
              <RefreshCw size={13} className="spin" /> Uploaden…
            </>
          ) : (
            <>
              <Upload size={13} /> {hasImage ? "Vervang" : "Upload"}
            </>
          )}
        </button>
      </div>
    </div>
  );
}
