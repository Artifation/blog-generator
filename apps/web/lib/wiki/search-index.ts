/**
 * Wiki search-index. Genereert een platte text-snapshot van elk artikel
 * door de React-element-tree te walkten — zonder daadwerkelijke render.
 * Next.js verbiedt `react-dom/server` in server components, dus we doen
 * de extractie zelf met een recursieve walker die ook bekende text-props
 * van onze UI-componenten meeneemt (label, value, why, title, intro, …).
 */
import * as React from "react";
import { ARTICLES, type WikiCategory } from "./articles";

export interface WikiSearchEntry {
  slug: string;
  title: string;
  category: WikiCategory;
  summary: string;
  /** Lowercase plain-text van de body, voor includes()-matching. */
  text: string;
}

/** Props die door onze wiki-UI-componenten als tekst-content gebruikt worden. */
const TEXT_PROPS = new Set([
  "title",
  "intro",
  "label",
  "value",
  "hint",
  "caption",
  "sub",
  "why",
  "term",
  "short",
  "text",
  "by",
  "placeholder",
  "n",
]);

/** Props die we nooit als tekst willen indexeren (visuele/structurele meta). */
const SKIP_PROPS = new Set([
  "style",
  "className",
  "id",
  "href",
  "src",
  "target",
  "rel",
  "type",
  "tone",
  "key",
  "role",
  "tag",
  "size",
  "variant",
]);

function collect(node: unknown, out: string[]): void {
  if (node == null || typeof node === "boolean") return;
  if (typeof node === "string" || typeof node === "number") {
    out.push(String(node));
    return;
  }
  if (Array.isArray(node)) {
    for (const item of node) collect(item, out);
    return;
  }
  if (typeof node === "object") {
    // React element
    if (React.isValidElement(node)) {
      const props = (node.props ?? {}) as Record<string, unknown>;
      for (const [k, v] of Object.entries(props)) {
        if (SKIP_PROPS.has(k) || k.startsWith("aria-") || k.startsWith("data-")) continue;
        if (k === "children" || TEXT_PROPS.has(k)) {
          collect(v, out);
        } else if (Array.isArray(v)) {
          // e.g. rows={[{ label, value, why }]}, items={[{ href, label }]}
          collect(v, out);
        } else if (React.isValidElement(v)) {
          collect(v, out);
        }
      }
      return;
    }
    // Plain object (e.g. { label, value, why } row, or { href, label } toc item)
    for (const v of Object.values(node as Record<string, unknown>)) {
      collect(v, out);
    }
  }
}

function flatten(node: React.ReactNode): string {
  const parts: string[] = [];
  collect(node, parts);
  return parts
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

let cached: WikiSearchEntry[] | null = null;

export function getWikiSearchIndex(): WikiSearchEntry[] {
  if (cached) return cached;
  cached = ARTICLES.map((a) => ({
    slug: a.slug,
    title: a.title,
    category: a.category,
    summary: a.summary,
    text: flatten(a.body),
  }));
  return cached;
}
