"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Link2, RefreshCw } from "lucide-react";
import { runInternalLinkerAction } from "~/lib/actions/internal-linker";

export function InternalLinkerButton() {
  const router = useRouter();
  const [running, setRunning] = React.useState(false);

  async function run() {
    setRunning(true);
    const tid = toast.loading("Internal linker draait — checkt oudere posts…");
    const res = await runInternalLinkerAction();
    toast.dismiss(tid);
    setRunning(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    if (res.linksAdded === 0) {
      toast.info("Geen nieuwe links toegevoegd. Probeer later opnieuw als er meer content is.");
    } else {
      toast.success(`${res.linksAdded} interne link${res.linksAdded === 1 ? "" : "s"} toegevoegd in ${(res.durationMs / 1000).toFixed(1)}s`);
    }
    router.refresh();
  }

  return (
    <button type="button" className="btn btn-secondary" onClick={run} disabled={running}>
      {running ? (
        <>
          <RefreshCw size={13} className="spin" /> Linker draait…
        </>
      ) : (
        <>
          <Link2 size={13} /> Internal linker
        </>
      )}
    </button>
  );
}
