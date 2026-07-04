"use client";

import * as React from "react";
import { Check, X, RefreshCw, Circle } from "lucide-react";
import type { SaveStatus } from "./use-auto-save";

interface CardHeadProps {
  title: string;
  description?: React.ReactNode;
  status?: SaveStatus;
  /** Called when user clicks the error badge to retry. */
  onRetry?: () => void;
}

export function CardHead({ title, description, status = "idle", onRetry }: CardHeadProps) {
  return (
    <div className="card-header">
      <div>
        <h3>{title}</h3>
        {description && (
          <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
            {description}
          </div>
        )}
      </div>
      <StatusBadge status={status} onRetry={onRetry} />
    </div>
  );
}

function StatusBadge({ status, onRetry }: { status: SaveStatus; onRetry?: () => void }) {
  if (status === "idle") return null;
  const styles: React.CSSProperties = {
    fontSize: 11,
    padding: "2px 8px",
    borderRadius: 10,
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
  };
  if (status === "dirty")
    return (
      <span style={{ ...styles, background: "var(--warning-bg, #fef3c7)", color: "#92400e" }}>
        <Circle size={8} fill="currentColor" /> wijziging
      </span>
    );
  if (status === "saving")
    return (
      <span style={{ ...styles, background: "rgba(59,130,246,0.10)", color: "var(--secondary, #1e40af)" }}>
        <RefreshCw size={11} className="spin" /> opslaan…
      </span>
    );
  if (status === "saved")
    return (
      <span style={{ ...styles, background: "var(--success-bg, #d1fae5)", color: "var(--success, #065f46)" }}>
        <Check size={11} /> opgeslagen
      </span>
    );
  if (status === "error")
    return (
      <button
        type="button"
        onClick={onRetry}
        style={{
          ...styles,
          background: "rgba(220,38,38,0.10)",
          color: "#991b1b",
          border: "none",
          cursor: "pointer",
        }}
        title="Klik om opnieuw te proberen"
      >
        <X size={11} /> mislukt — opnieuw
      </button>
    );
  return null;
}
