"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { User, Tag, Settings, ShieldCheck, AlertCircle, ArrowLeft, MoreHorizontal } from "lucide-react";
import { logoutAction } from "~/lib/actions/auth";

export function AccountMenu({ name, email }: { name: string; email: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const initials = name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const logout = async () => {
    await logoutAction();
    router.push("/login");
  };

  return (
    <div style={{ position: "relative" }} ref={ref}>
      {open && (
        <div className="acct-menu">
          <Link href="/account" className="acct-menu-item" onClick={() => setOpen(false)}>
            <User size={14} /> Mijn account
          </Link>
          <Link href="/account" className="acct-menu-item" onClick={() => setOpen(false)}>
            <Tag size={14} /> Abonnement & facturatie
          </Link>
          <Link href="/account/security" className="acct-menu-item" onClick={() => setOpen(false)}>
            <ShieldCheck size={14} /> Wachtwoord & beveiliging
          </Link>
          <Link href="/settings" className="acct-menu-item" onClick={() => setOpen(false)}>
            <Settings size={14} /> Instellingen
          </Link>
          <div className="acct-menu-sep" />
          <a
            href="mailto:support@artifation.nl"
            className="acct-menu-item"
            onClick={() => setOpen(false)}
          >
            <AlertCircle size={14} /> Support
          </a>
          <div className="acct-menu-sep" />
          <button
            type="button"
            className="acct-menu-item"
            onClick={logout}
            style={{ color: "#fca5a5", width: "100%", background: "transparent", border: "none", textAlign: "left" }}
          >
            <ArrowLeft size={14} /> Uitloggen
          </button>
        </div>
      )}
      <button
        type="button"
        className="sidebar-footer"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        style={{ width: "100%", background: "transparent", border: "none", textAlign: "left", color: "inherit", cursor: "pointer" }}
      >
        <div className="user-avatar">{initials || "AB"}</div>
        <div className="user-meta">
          <div className="user-name">{name}</div>
          {email && <div className="user-email">{email}</div>}
        </div>
        <span className="icon-btn" aria-hidden="true" style={{ color: "inherit" }}>
          <MoreHorizontal size={14} />
        </span>
      </button>
    </div>
  );
}
