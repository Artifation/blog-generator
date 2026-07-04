"use client";

import * as React from "react";
import { Plus, Trash2 } from "lucide-react";
import { RequiredBadge, OptionalBadge, FieldHelp } from "~/components/ui/form-help";

export type Pillar = { slug?: string; name: string; weight: number };

export function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="card">
      <div className="card-header">
        <div>
          <h3>{title}</h3>
          {description && <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{description}</div>}
        </div>
      </div>
      <div className="card-body col" style={{ gap: 14 }}>
        {children}
      </div>
    </div>
  );
}

export function Field({
  label,
  required,
  help,
  children,
}: {
  label: string;
  /** Defaults to false (= optional). Pass true for verplicht-velden so the
   * Required badge appears next to the label and screen readers see it. */
  required?: boolean;
  /** Short hint shown under the field, explaining what it's for. */
  help?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="field" style={{ flex: 1 }}>
      <label>
        <span>{label}</span>
        {required ? <RequiredBadge /> : <OptionalBadge />}
      </label>
      {children}
      {help && <FieldHelp>{help}</FieldHelp>}
    </div>
  );
}

export function ApiKey({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  /** Short hint explaining when this key is required and what it's used for. */
  hint?: string;
}) {
  const [show, setShow] = React.useState(false);
  return (
    <div className="field">
      <label>{label}</label>
      <div className="row" style={{ gap: 6 }}>
        <input
          className="input mono"
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="sk-..."
        />
        <button type="button" className="btn btn-outline btn-sm" onClick={() => setShow((s) => !s)}>
          {show ? "Verberg" : "Toon"}
        </button>
      </div>
      {hint && <FieldHelp>{hint}</FieldHelp>}
    </div>
  );
}

export function PillarEditor({ pillars, onChange }: { pillars: Pillar[]; onChange: (v: Pillar[]) => void }) {
  const total = pillars.reduce((s, p) => s + p.weight, 0);
  function set(i: number, patch: Partial<Pillar>) {
    onChange(pillars.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  }
  function add() {
    onChange([...pillars, { name: "", weight: 0.1 }]);
  }
  function remove(i: number) {
    onChange(pillars.filter((_, idx) => idx !== i));
  }
  return (
    <div className="col" style={{ gap: 10 }}>
      {pillars.map((p, i) => (
        <div key={i} className="row" style={{ gap: 10, alignItems: "flex-end" }}>
          <div className="field" style={{ flex: 1 }}>
            <label>Pillar</label>
            <input className="input" value={p.name} onChange={(e) => set(i, { name: e.target.value })} />
          </div>
          <div className="field" style={{ width: 110 }}>
            <label>Weight</label>
            <input
              className="input tnum"
              type="number"
              min={0}
              step="0.05"
              value={p.weight}
              onChange={(e) => set(i, { weight: Number(e.target.value) || 0 })}
            />
          </div>
          <button
            type="button"
            className="icon-btn"
            onClick={() => remove(i)}
            disabled={pillars.length === 1}
            aria-label="Verwijder pillar"
          >
            <Trash2 size={14} />
          </button>
        </div>
      ))}
      <div>
        <button type="button" className="btn btn-outline btn-sm" onClick={add}>
          <Plus size={12} /> Pillar toevoegen
        </button>
      </div>
      <div className="muted" style={{ fontSize: 11 }}>
        Totaal: {total.toFixed(2)} — wordt bij opslaan genormaliseerd naar 1.0.
      </div>
    </div>
  );
}

export function ChipsField({
  label,
  description,
  values,
  onChange,
  optional,
  required,
}: {
  label: string;
  description?: string;
  values: string[];
  onChange: (v: string[]) => void;
  /** Defaults to neither badge — explicit opt-in keeps backwards compat. */
  optional?: boolean;
  required?: boolean;
}) {
  const [input, setInput] = React.useState("");
  function add() {
    const v = input.trim();
    if (!v || values.includes(v)) return;
    onChange([...values, v]);
    setInput("");
  }
  return (
    <div className="field">
      <label>
        <span>{label}</span>
        {required ? <RequiredBadge /> : optional ? <OptionalBadge /> : null}
      </label>
      {description && <div className="hint">{description}</div>}
      <div className="chips">
        {values.map((v, i) => (
          <span key={`${v}-${i}`} className="chip">
            {v}
            <button
              type="button"
              className="chip-x"
              onClick={() => onChange(values.filter((_, idx) => idx !== i))}
              aria-label={`Verwijder ${v}`}
            >
              ×
            </button>
          </span>
        ))}
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
            if (e.key === "Backspace" && !input && values.length) {
              onChange(values.slice(0, -1));
            }
          }}
          placeholder="Typ en druk op Enter"
        />
      </div>
    </div>
  );
}
