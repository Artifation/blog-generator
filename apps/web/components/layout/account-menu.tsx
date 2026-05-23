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
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
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
      <div className="sidebar-footer" onClick={() => setOpen((o) => !o)}>
        <div className="user-avatar">{initials || "AB"}</div>
        <div className="user-meta">
          <div className="user-name">{name}</div>
          <div className="user-email">{email}</div>
        </div>
        <button type="button" className="icon-btn" style={{ color: "inherit" }} aria-label="Account menu">
          <MoreHorizontal size={14} />
        </button>
      </div>
    </div>
  );
}
