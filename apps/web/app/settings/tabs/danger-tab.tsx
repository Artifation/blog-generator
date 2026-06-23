"use client";

import * as React from "react";
import { Trash2, AlertCircle } from "lucide-react";
import type { SiteWithPillars } from "~/lib/sites";
import { deleteSiteAction } from "~/lib/actions/sites";

interface Props {
  site: SiteWithPillars;
}

export function DangerTab({ site }: Props) {
  async function destroy() {
    if (!confirm(`Verwijder "${site.name}" en alles wat erbij hoort?`)) return;
    if (!confirm("Echt zeker? Dit is onomkeerbaar.")) return;
    await deleteSiteAction(site.id);
  }

  return (
    <div className="col gap-lg" style={{ paddingBottom: 40 }}>
      <div className="card">
        <div className="card-header">
          <div>
            <h3>Site verwijderen</h3>
            <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
              Permanent. Geen undo.
            </div>
          </div>
        </div>
        <div className="card-body col" style={{ gap: 14 }}>
          <div
            style={{
              padding: 12,
              background: "rgba(220,38,38,0.06)",
              border: "1px solid rgba(220,38,38,0.25)",
              borderRadius: 6,
              fontSize: 13,
              color: "#374151",
            }}
          >
            <AlertCircle size={14} style={{ verticalAlign: "middle", marginRight: 6, color: "#b91c1c" }} />
            Dit verwijdert <strong>{site.name}</strong> inclusief alle topics,
            drafts en gepubliceerde posts. Pillars, team-leden en runs gaan ook
            weg.
          </div>
          <div>
            <button type="button" className="btn btn-danger" onClick={destroy}>
              <Trash2 size={14} /> Verwijder deze site permanent
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
