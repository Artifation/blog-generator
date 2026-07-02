"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { UserPlus, Trash2, RefreshCw, Copy } from "lucide-react";
import { inviteUserAction, removeUserAction } from "~/lib/actions/auth";

export interface TeamMember {
  id: string;
  email: string;
  name: string;
  role: "owner" | "editor" | "viewer";
  invitedAt: string;
  lastLoginAt: string | null;
  isMe: boolean;
}

export function TeamSection({ members }: { members: TeamMember[] }) {
  const router = useRouter();
  const [inviting, setInviting] = React.useState(false);
  const [showInvite, setShowInvite] = React.useState(false);

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <h3>Team</h3>
          <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
            Wie kan inloggen en de blog beheren.
          </div>
        </div>
        <button
          type="button"
          className="btn btn-outline btn-sm card-action"
          onClick={() => setShowInvite(true)}
        >
          <UserPlus size={13} /> Uitnodigen
        </button>
      </div>
      <div className="card-body">
        {members.length === 0 ? (
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>
            Nog geen teamleden.
          </p>
        ) : (
          <div className="col" style={{ gap: 0 }}>
            {members.map((m, i) => (
              <div
                key={m.id}
                className="row"
                style={{
                  gap: 12,
                  padding: "10px 0",
                  borderTop: i === 0 ? "none" : "1px solid var(--border)",
                  alignItems: "center",
                }}
              >
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    background: "var(--secondary)",
                    color: "white",
                    display: "grid",
                    placeItems: "center",
                    fontSize: 12,
                    fontWeight: 700,
                    flexShrink: 0,
                  }}
                >
                  {(m.name || m.email)
                    .split(" ")
                    .map((n) => n[0])
                    .join("")
                    .slice(0, 2)
                    .toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="row" style={{ gap: 6, alignItems: "center" }}>
                    <span style={{ fontSize: 13, fontWeight: 500 }}>{m.name || m.email}</span>
                    {m.isMe && <span className="badge b-blue">Jij</span>}
                    <span className={`badge ${m.role === "owner" ? "b-navy" : "b-gray"}`}>
                      {m.role}
                    </span>
                  </div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {m.email}
                    {m.lastLoginAt && ` · laatst ingelogd ${new Date(m.lastLoginAt).toLocaleDateString("nl-NL")}`}
                  </div>
                </div>
                {!m.isMe && (
                  <RemoveMemberButton id={m.id} onRemoved={() => router.refresh()} />
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {showInvite && (
        <InviteModal
          onClose={() => setShowInvite(false)}
          onInvited={() => {
            setShowInvite(false);
            router.refresh();
          }}
          busy={inviting}
          setBusy={setInviting}
        />
      )}
    </div>
  );
}

function RemoveMemberButton({ id, onRemoved }: { id: string; onRemoved: () => void }) {
  const [busy, setBusy] = React.useState(false);
  async function remove() {
    if (!confirm("Dit lid verwijderen?")) return;
    setBusy(true);
    const r = await removeUserAction(id);
    setBusy(false);
    if (r.ok) {
      toast.success("Verwijderd");
      onRemoved();
    } else {
      toast.error(r.error);
    }
  }
  return (
    <button type="button" className="icon-btn" onClick={remove} disabled={busy} aria-label="Verwijder">
      {busy ? <RefreshCw size={14} className="spin" /> : <Trash2 size={14} />}
    </button>
  );
}

function InviteModal({
  onClose,
  onInvited,
  busy,
  setBusy,
}: {
  onClose: () => void;
  onInvited: () => void;
  busy: boolean;
  setBusy: (b: boolean) => void;
}) {
  const [email, setEmail] = React.useState("");
  const [name, setName] = React.useState("");
  const [role, setRole] = React.useState<"editor" | "viewer" | "owner">("editor");
  // The temp password is generated SERVER-SIDE (CSPRNG) and returned on success.
  const [tempPassword, setTempPassword] = React.useState("");
  const [done, setDone] = React.useState(false);

  async function submit() {
    if (!email.trim() || !email.includes("@")) {
      toast.error("Ongeldig e-mailadres");
      return;
    }
    setBusy(true);
    const r = await inviteUserAction(email.trim(), name.trim(), role);
    setBusy(false);
    if (r.ok) {
      setTempPassword(r.tempPassword);
      setDone(true);
    } else {
      toast.error(r.error);
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(11,27,59,0.4)",
        backdropFilter: "blur(2px)",
        display: "grid",
        placeItems: "center",
        zIndex: 50,
      }}
    >
      <div
        className="card"
        onClick={(e) => e.stopPropagation()}
        style={{ width: "min(92vw, 480px)", boxShadow: "var(--shadow-lg)" }}
      >
        <div className="card-header">
          <h3>{done ? "Uitgenodigd" : "Teamlid uitnodigen"}</h3>
        </div>
        {done ? (
          <div className="card-body col" style={{ gap: 12 }}>
            <p style={{ margin: 0, fontSize: 13 }}>
              Stuur deze gegevens naar <strong>{email}</strong> zodat ze kunnen inloggen:
            </p>
            <div
              className="row"
              style={{
                gap: 8,
                padding: 10,
                background: "var(--surface-2)",
                borderRadius: 8,
                border: "1px solid var(--border)",
                fontSize: 12,
              }}
            >
              <div style={{ flex: 1 }}>
                <div className="muted">URL</div>
                <div className="mono">/login</div>
                <div className="muted" style={{ marginTop: 6 }}>E-mail</div>
                <div className="mono">{email}</div>
                <div className="muted" style={{ marginTop: 6 }}>Tijdelijk wachtwoord</div>
                <div className="mono">{tempPassword}</div>
              </div>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => {
                  navigator.clipboard.writeText(
                    `Inloggen op Artifation Blog:\nURL: /login\nE-mail: ${email}\nWachtwoord: ${tempPassword}`
                  );
                  toast.success("Gekopieerd");
                }}
              >
                <Copy size={11} /> Kopieer
              </button>
            </div>
            <p className="muted" style={{ margin: 0, fontSize: 11 }}>
              Vraag ze het wachtwoord te wijzigen na de eerste login (binnenkort beschikbaar).
            </p>
            <div className="row" style={{ justifyContent: "flex-end" }}>
              <button type="button" className="btn btn-primary" onClick={onInvited}>
                Klaar
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="card-body col" style={{ gap: 12 }}>
              <div className="field">
                <label>E-mail</label>
                <input
                  className="input"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoFocus
                  placeholder="collega@bedrijf.nl"
                />
              </div>
              <div className="field">
                <label>Naam (optioneel)</label>
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="field">
                <label>Rol</label>
                <select className="select" value={role} onChange={(e) => setRole(e.target.value as typeof role)}>
                  <option value="owner">Owner — alles, ook abonnement</option>
                  <option value="editor">Editor — alles behalve abonnement</option>
                  <option value="viewer">Viewer — alleen lezen</option>
                </select>
              </div>
              <div className="hint">
                Je krijgt na het uitnodigen een veilig tijdelijk wachtwoord om te delen.
              </div>
            </div>
            <div
              style={{
                padding: "14px 20px",
                borderTop: "1px solid var(--border)",
                display: "flex",
                gap: 8,
                justifyContent: "flex-end",
                background: "var(--surface-2)",
              }}
            >
              <button type="button" className="btn btn-ghost" onClick={onClose}>
                Annuleer
              </button>
              <button type="button" className="btn btn-primary" onClick={submit} disabled={busy}>
                {busy ? "Versturen..." : "Voeg toe"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
