"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowRight, RefreshCw, Sparkles } from "lucide-react";
import { loginAction, loginWithPasswordAction } from "~/lib/actions/auth";

interface DemoSite {
  slug: string;
  name: string;
  domain: string;
}

export function LoginForm({ demoSites }: { demoSites: DemoSite[] }) {
  const router = useRouter();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function loginEmail() {
    if (!email || !password) {
      toast.error("Vul je e-mail en wachtwoord in.");
      return;
    }
    setBusy(true);
    const res = await loginWithPasswordAction(email, password);
    setBusy(false);
    if (res.ok) {
      toast.success(`Welkom terug, ${email.split("@")[0]}`);
      router.push("/dashboard");
    } else {
      toast.error(res.error);
    }
  }

  async function loginAsDemo(site: DemoSite) {
    const res = await loginAction(site.slug);
    if (res.ok) {
      toast.success(`Ingelogd als ${site.name}`);
      router.push("/dashboard");
    } else {
      toast.error(res.error);
    }
  }

  return (
    <div className="auth-card">
      <h1>Welkom terug</h1>
      <div className="auth-sub">Log in om je dashboard te openen.</div>

      <div className="auth-form">
        <div className="field">
          <label htmlFor="email">E-mail</label>
          <input
            id="email"
            className="input"
            type="email"
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="jij@bedrijf.nl"
          />
        </div>
        <div className="field">
          <div className="row between">
            <label htmlFor="password">Wachtwoord</label>
            <a style={{ fontSize: 11, color: "var(--secondary)", cursor: "pointer" }}>Vergeten?</a>
          </div>
          <input
            id="password"
            className="input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && loginEmail()}
          />
        </div>
        <button
          type="button"
          className="btn btn-primary btn-lg"
          disabled={!email || busy}
          onClick={loginEmail}
        >
          {busy ? (
            <>
              <RefreshCw size={14} className="spin" /> Inloggen…
            </>
          ) : (
            <>
              Log in <ArrowRight size={14} />
            </>
          )}
        </button>
      </div>

      <div className="auth-foot">
        Nog geen account? <Link href="/activate">Activeer met je code</Link>
      </div>

      {demoSites.length > 0 && (
        <div className="auth-demo">
          <div className="auth-demo-h">
            <Sparkles size={11} /> Demo-accounts (één klik in)
          </div>
          <div className="col" style={{ gap: 2 }}>
            {demoSites.map((s) => (
              <button
                type="button"
                key={s.slug}
                className="auth-demo-row"
                onClick={() => loginAsDemo(s)}
                style={{ background: "transparent", border: "none", width: "100%" }}
              >
                <div className="auth-demo-avatar">{s.name[0]}</div>
                <div className="auth-demo-meta">
                  <div className="auth-demo-name">{s.name}</div>
                  <div className="auth-demo-domain">{s.domain}</div>
                </div>
                <ArrowRight size={13} style={{ color: "var(--text-muted)" }} />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
