/**
 * Shared form-affordances for the webapp. Every form in the app should use
 * these so:
 *   - users always know what's verplicht vs optioneel at a glance
 *   - every field has a hint explaining what it's for, when relevant
 *   - terminology + visual treatment stay consistent across screens
 *
 * Conventions:
 *   - <RequiredBadge /> = data MUST be filled in to use the feature
 *   - <OptionalBadge /> = field can stay empty; tool falls back to a default
 *   - <FieldHelp>   = short explanation under a field's label
 *   - <FieldLabel>  = wraps label + required/optional badge in one place
 */
"use client";

import * as React from "react";

export function RequiredBadge() {
  return (
    <span
      title="Verplicht — zonder dit veld werkt de feature niet"
      style={{
        marginLeft: 6,
        fontSize: 9,
        fontWeight: 600,
        textTransform: "uppercase",
        letterSpacing: 0.5,
        color: "var(--danger, #b91c1c)",
        background: "rgba(185, 28, 28, 0.08)",
        padding: "1px 6px",
        borderRadius: 999,
        border: "1px solid rgba(185, 28, 28, 0.25)",
        verticalAlign: "middle",
      }}
    >
      Verplicht
    </span>
  );
}

export function OptionalBadge() {
  return (
    <span
      title="Optioneel — laat leeg om de default te gebruiken"
      style={{
        marginLeft: 6,
        fontSize: 9,
        fontWeight: 500,
        textTransform: "uppercase",
        letterSpacing: 0.5,
        color: "var(--muted, #6b7280)",
        background: "var(--surface-2, rgba(0,0,0,0.04))",
        padding: "1px 6px",
        borderRadius: 999,
        border: "1px solid var(--border, rgba(0,0,0,0.1))",
        verticalAlign: "middle",
      }}
    >
      Optioneel
    </span>
  );
}

/**
 * Label + required/optional badge in one. Use as a drop-in replacement for
 * a plain <label> inside the form.
 */
export function FieldLabel({
  required,
  children,
}: {
  required: boolean;
  children: React.ReactNode;
}) {
  return (
    <label style={{ display: "block" }}>
      <span>{children}</span>
      {required ? <RequiredBadge /> : <OptionalBadge />}
    </label>
  );
}

/**
 * Hint text shown directly under a field. Use for "what this is for" and a
 * short example, not for the field's value. Keep it ≤ 2 zinnen.
 */
export function FieldHelp({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 11,
        lineHeight: 1.4,
        color: "var(--muted, #6b7280)",
        marginTop: 4,
      }}
    >
      {children}
    </div>
  );
}

/**
 * Section intro shown directly under a section title. Explains the "why" so
 * users understand the purpose of the group of fields below.
 */
export function SectionIntro({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 12,
        lineHeight: 1.5,
        color: "var(--muted, #6b7280)",
        marginTop: 4,
        marginBottom: 8,
        paddingBottom: 8,
        borderBottom: "1px dashed var(--border, rgba(0,0,0,0.1))",
      }}
    >
      {children}
    </div>
  );
}
