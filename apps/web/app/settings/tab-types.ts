// Pure (non-client) type + parser for the settings tabs. Lives in a separate
// file from settings-shell.tsx so the server component (page.tsx) can call
// parseTab without crossing the "use client" boundary.

export type TabKey = "brand" | "publish" | "integrations" | "team" | "danger";

const VALID_TABS: TabKey[] = ["brand", "publish", "integrations", "team", "danger"];

export function parseTab(raw: string | undefined): TabKey {
  if (raw && (VALID_TABS as string[]).includes(raw)) return raw as TabKey;
  return "brand";
}
