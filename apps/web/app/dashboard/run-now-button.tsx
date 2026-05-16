"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Sparkles, RefreshCw } from "lucide-react";
import { runNextQueuedAction } from "~/lib/actions/cron";

export function RunNowButton({ disabled }: { disabled?: boolean }) {
  const router = useRouter();
  const [running, setRunning] = React.useState(false);

  async function run() {
    setRunning(true);
    const tid = toast.loading("Pipeline draait voor je volgende topic — duurt 1–3 minuten…");
    const res = await runNextQueuedAction();
    toast.dismiss(tid);
    setRunning(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    if (res.verdict === "published" && res.draftId) {
      toast.success(`Draft klaar: "${res.topicTitle}"`);
      router.push(`/drafts/${res.draftId}`);
    } else if (res.verdict === "rejected") {
      toast.warning(`"${res.topicTitle}" afgewezen: ${res.reason ?? "onder drempel"}`);
      router.refresh();
    } else {
      toast.error(`Pipeline-fout: ${res.reason ?? "onbekend"}`);
      router.refresh();
    }
  }

  return (
    <button type="button" className="btn btn-secondary" onClick={run} disabled={running || disabled}>
      {running ? (
        <>
          <RefreshCw size={13} className="spin" /> Draait…
        </>
      ) : (
        <>
          <Sparkles size={13} /> Run nu
        </>
      )}
    </button>
  );
}
