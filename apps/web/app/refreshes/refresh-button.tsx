"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { RefreshCw, Wand2 } from "lucide-react";
import { startRefreshAction } from "~/lib/actions/refresh";

export function RefreshButton({
  publishedPostId,
  label = "Refresh",
}: {
  publishedPostId: string;
  label?: string;
}) {
  const router = useRouter();
  const [running, setRunning] = React.useState(false);

  async function run() {
    if (running) return;
    setRunning(true);
    const tid = toast.loading("Rewriter draait — refresh kan ~30s duren…");
    const res = await startRefreshAction({ publishedPostId });
    toast.dismiss(tid);
    setRunning(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Refresh-draft klaar — open hem in Drafts");
    router.push(`/drafts/${res.draftId}`);
  }

  return (
    <button type="button" className="btn btn-primary" onClick={run} disabled={running}>
      {running ? (
        <>
          <RefreshCw size={13} className="spin" /> Bezig…
        </>
      ) : (
        <>
          <Wand2 size={13} /> {label}
        </>
      )}
    </button>
  );
}
