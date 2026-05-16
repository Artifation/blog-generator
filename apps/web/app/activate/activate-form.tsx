"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowLeft, ArrowRight, CheckCircle, Key, RefreshCw } from "lucide-react";
import { checkInviteCodeAction } from "~/lib/actions/auth";

type InviteInfo = {
  company: string;
  email: string;
  name: string;
  plan: "starter" | "pro" | "custom";
  domain: string;
};

export function ActivateForm({ codes }: { codes: Array<{ code: string; company: string; plan: string }> }) {
  const router = useRouter();
  const [stage, setStage] = React.useState<"code" | "password">("code");
  const [code, setCode] = React.useState("");
  const [info, setInfo] = React.useState<InviteInfo | null>(null);
  const [pw1, setPw1] = React.useState("");
  const [pw2, setPw2] = React.useState("");
  const [error, setError] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  function formatCode(v: string): string {
    const clean = v.toUpperCase().replace(/[^A-Z0-9]/g, "");
    const parts: string[] = [];
    if (clean.length > 0) parts.push(clean.slice(0, 4));
    if (clean.length > 4) parts.push(clean.slice(4, 8));
    if (clean.length > 8) parts.push(clean.slice(8, 12));
    return parts.join("-");
  }

  async function checkCode() {
    const normalized = code.trim().toUpperCase();
    if (!normalized) {
      setError("Voer een code in.");
      return;
    }
    setError("");
    setBusy(true);
    const res = await checkInviteCodeAction(normalized);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setInfo(res.info);
    setStage("password");
  }

  function setPassword() {
    if (pw1.length < 6) {
      setError("Wachtwoord moet minimaal 6 tekens zijn.");
      return;
    }
    if (pw1 !== pw2) {
      setError("De wachtwoorden komen niet overeen.");
      return;
    }
    setError("");
    setBusy(true);
    // Stash invite info + password in sessionStorage so the onboarding wizard can
    // pre-fill and finalize the owner-user creation at the end.
    sessionStorage.setItem(
      "artifation_invite",
      JSON.stringify({ ...info, code, password: pw1 })
    );
    setTimeout(() => {
      router.push("/onboarding");
    }, 400);
  }

  if (stage === "password" && info) {
    return (
      <div className="auth-card">
        <div
          className="row"
          style={{
            gap: 10,
            marginBottom: 16,
            padding: 12,
            background: "var(--success-bg)",
            border: "1px solid #a7f3d0",
            borderRadius: 8,
            color: "var(--success)",
          }}
        >
          <CheckCircle size={18} />
          <div style={{ flex: 1, fontSize: 13 }}>
            Code geldig — welkom <strong>{info.name}</strong>
          </div>
        </div>

        <h1>Stel je wachtwoord in</h1>
        <div className="auth-sub">Hierna kun je je blog inrichten.</div>

        <div className="auth-form">
          <div className="field">
            <label>E-mail</label>
            <input
              className="input"
              value={info.email}
              disabled
              style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}
            />
            <div className="hint">Gekoppeld aan code {code}</div>
          </div>
          <div className="field">
            <label>Nieuw wachtwoord</label>
            <input
              className="input"
              type="password"
              autoFocus
              value={pw1}
              onChange={(e) => setPw1(e.target.value)}
              placeholder="minimaal 6 tekens"
            />
          </div>
          <div className="field">
            <label>Wachtwoord bevestigen</label>
            <input
              className="input"
              type="password"
              value={pw2}
              onChange={(e) => setPw2(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && setPassword()}
            />
          </div>

          {error && (
            <div className="hint" style={{ color: "var(--danger)" }}>
              <AlertCircle size={11} style={{ verticalAlign: "middle", marginRight: 4 }} />
              {error}
            </div>
          )}

          <button
            type="button"
            className="btn btn-primary btn-lg"
            disabled={busy || !pw1 || !pw2}
            onClick={setPassword}
          >
            {busy ? (
              <>
                <RefreshCw size={14} className="spin" /> Account aanmaken…
              </>
            ) : (
              <>
                Verder met setup <ArrowRight size={14} />
              </>
            )}
          </button>

          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              setStage("code");
              setError("");
              setInfo(null);
            }}
          >
            <ArrowLeft size={12} /> Andere code invoeren
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-card">
      <h1>Activeer je account</h1>
      <div className="auth-sub">Voer de code in die je van Artifation hebt ontvangen.</div>

      <div className="auth-form">
        <div className="field">
          <label>Uitnodigingscode</label>
          <input
            className="input mono"
            style={{
              fontSize: 18,
              letterSpacing: "0.08em",
              textAlign: "center",
              padding: "12px 14px",
              textTransform: "uppercase",
              fontWeight: 600,
            }}
            value={code}
            onChange={(e) => setCode(formatCode(e.target.value))}
            placeholder="ARTI-2026-XXXX"
            maxLength={14}
            autoFocus
            onKeyDown={(e) => e.key === "Enter" && checkCode()}
          />
          {error && (
            <div className="hint" style={{ color: "var(--danger)", marginTop: 6 }}>
              <AlertCircle size={11} style={{ verticalAlign: "middle", marginRight: 4 }} />
              {error}
            </div>
          )}
        </div>

        <button
          type="button"
          className="btn btn-primary btn-lg"
          disabled={busy || code.length < 14}
          onClick={checkCode}
        >
          {busy ? (
            <>
              <RefreshCw size={14} className="spin" /> Controleren…
            </>
          ) : (
            <>
              Activeren <ArrowRight size={14} />
            </>
          )}
        </button>
      </div>

      <div className="auth-divider">of</div>

      <div className="auth-demo">
        <div className="auth-demo-h">
          <Key size={11} /> Demo-codes (klik om in te vullen)
        </div>
        <div className="col" style={{ gap: 2 }}>
          {codes.map(({ code: c, company, plan }) => (
            <button
              key={c}
              type="button"
              className="auth-demo-row"
              onClick={() => {
                setCode(c);
                setError("");
              }}
              style={{ background: "transparent", border: "none", width: "100%" }}
            >
              <div className="auth-demo-avatar" style={{ background: "var(--accent)" }}>
                <Key size={12} />
              </div>
              <div className="auth-demo-meta">
                <div
                  className="auth-demo-name mono"
                  style={{ fontSize: 12, letterSpacing: "0.04em" }}
                >
                  {c}
                </div>
                <div className="auth-demo-domain">
                  {company} · {plan}
                </div>
              </div>
              <ArrowRight size={13} style={{ color: "var(--text-muted)" }} />
            </button>
          ))}
        </div>
      </div>

      <div className="auth-foot">
        Heb je al een account? <Link href="/login">Log in</Link>
      </div>

      <div className="auth-foot" style={{ marginTop: 10, fontSize: 12 }}>
        Geen code?{" "}
        <a href="mailto:info@artifation.nl?subject=Toegang%20tot%20Artifation%20Blog">
          Neem contact met ons op
        </a>
      </div>
    </div>
  );
}
