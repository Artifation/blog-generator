/**
 * Strip dead external links from a draft HTML body. Used as a final pre-save
 * step to ensure no Wolters-Kluwer-style soft-404 pages slip into published
 * posts even if the writer or strategist added them after the research-time
 * filter ran.
 *
 * The strategy is conservative: instead of removing the entire anchor (which
 * would leave the prose with weird gaps), we keep the anchor's INNER text /
 * HTML and just drop the surrounding `<a href=...>...</a>` tags. The reader
 * still sees the phrase the writer chose; they just can't click through to a
 * dead destination.
 */

const ANCHOR_RE = /<a\s+[^>]*href=(?:"([^"]+)"|'([^']+)')[^>]*>([\s\S]*?)<\/a>/gi;

/**
 * Extract every absolute http(s) href found inside an anchor tag. Relative,
 * fragment, mailto and tel links are ignored — only the URLs that could be
 * dead-checked. Output is deduplicated.
 */
export function extractExternalHrefs(html: string): string[] {
  const out = new Set<string>();
  let m: RegExpExecArray | null;
  ANCHOR_RE.lastIndex = 0;
  while ((m = ANCHOR_RE.exec(html)) !== null) {
    const href = (m[1] ?? m[2] ?? "").trim();
    if (!href) continue;
    if (!/^https?:\/\//i.test(href)) continue;
    out.add(href);
  }
  return [...out];
}

/**
 * From a list of {url, reason} pairs returned by checkCitations, keep only
 * the URLs whose reason marks them as DEFINITIVELY dead. Soft signals
 * (timeout, 403/429 WAF blocks, 5xx, transient network) are excluded so we
 * don't strip valid citations to authoritative bot-hostile sites (RVO, AP,
 * gov.nl, Wolters Kluwer often 403 Node-style user-agents while the page
 * is fine for human visitors).
 *
 * Mirrors the policy in researchUrlFilter — kept here as a tiny pure helper
 * so it's unit-testable independent of the pipeline orchestration.
 */
const DEFINITIVELY_DEAD_REASON = /^status:(404|410|soft404)$/;

export function filterDefinitivelyDead(
  dead: { url: string; reason: string }[]
): { url: string; reason: string }[] {
  return dead.filter((d) => DEFINITIVELY_DEAD_REASON.test(d.reason));
}

/**
 * Replace every <a href=DEAD_URL>body</a> with just `body`. Anchors whose
 * href is NOT in `deadSet` are left untouched. Inner HTML (strong/em/etc.)
 * is preserved.
 */
export function stripDeadLinks(html: string, deadSet: Set<string>): string {
  if (deadSet.size === 0) return html;
  return html.replace(ANCHOR_RE, (full, dq?: string, sq?: string, inner?: string) => {
    const href = (dq ?? sq ?? "").trim();
    if (deadSet.has(href)) return inner ?? "";
    return full;
  });
}
