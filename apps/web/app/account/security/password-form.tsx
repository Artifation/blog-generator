"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { RefreshCw, ShieldCheck } from "lucide-react";
import { setPasswordAction } from "~/lib/actions/auth";

export function PasswordForm({ hasPassword }: { hasPassword: boolean }) {
  const router = useRouter();
  const [current, setCurrent] = React.useState("");
  const [pw1, setPw1] = React.useState("");
  const [pw2, setPw2] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function submit() {
    if (pw1.length < 8) {
      toast.error("Wachtwoord moet minimaal 8 tekens zijn.");
      return;
    }
    if (pw1 !== pw2) {
      toast.error("De nieuwe wachtwoorden komen niet overeen.");
      return;
    }
    setBusy(true);
    const res = await setPasswordAction(hasPassword ? current : null, pw1);
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(
      hasPassword
        ? "Wachtwoord gewijzigd."
        : "Wachtwoord ingesteld. Invitecodes werken nu niet meer om in te loggen.",
    );
    setCurrent("");
    setPw1("");
    setPw2("");
    router.refresh();
  }

  return (
    <div className="col" style={{ gap: 12 }}>
      {hasPassword && (
        <div className="field">
          <label htmlFor="cur">Huidig wachtwoord</label>
          <input
            id="cur"
            className="input"
            type="password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            autoComplete="current-password"
          />
        </div>
      )}
      <div className="field">
        <label htmlFor="pw1">Nieuw wachtwoord</label>
        <input
          id="pw1"
          className="input"
          type="password"
          value={pw1}
          onChange={(e) => setPw1(e.target.value)}
          autoComplete="new-password"
          placeholder="minimaal 8 tekens"
        />
      </div>
      <div className="field">
        <label htmlFor="pw2">Bevestig nieuw wachtwoord</label>
        <input
          id="pw2"
          className="input"
          type="password"
          value={pw2}
          onChange={(e) => setPw2(e.target.value)}
          autoComplete="new-password"
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />
      </div>
      <button
        type="button"
        className="btn btn-primary"
        disabled={busy || !pw1 || !pw2 || (hasPassword && !current)}
        onClick={submit}
      >
        {busy ? (
          <>
            <RefreshCw size={13} className="spin" /> Opslaan…
          </>
        ) : (
          <>
            <ShieldCheck size={13} /> {hasPassword ? "Wijzig wachtwoord" : "Stel wachtwoord in"}
          </>
        )}
      </button>
      <div className="muted" style={{ fontSize: 12 }}>
        Vergeten? Run lokaal:
        <code className="mono" style={{ marginLeft: 4 }}>
          npx tsx apps/web/scripts/reset-admin-password.ts &lt;email&gt; &lt;nieuw-wachtwoord&gt;
        </code>
      </div>
    </div>
  );
}
