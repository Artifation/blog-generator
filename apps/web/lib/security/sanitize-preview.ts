/**
 * Lightweight browser-side sanitizer for the live draft PREVIEW only.
 *
 * The authoritative sanitizer is the server-side `sanitizeContentHtml`
 * (sanitize-html), applied on write, on publish, and on public render. This
 * helper exists solely so the editor's "preview" tab — which renders the
 * author's own unsaved client state via dangerouslySetInnerHTML — can't execute
 * script the author just typed into the raw-HTML tab (self-XSS). We keep it
 * dependency-free to avoid bundling the Node sanitizer into the client.
 *
 * Safe to parse untrusted HTML: assigning to a detached <template>'s innerHTML
 * neither runs scripts nor loads resources, so we can walk and clean it first.
 */

const FORBIDDEN_TAGS = new Set([
  "SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED", "FORM",
  "LINK", "META", "BASE", "NOSCRIPT", "TEMPLATE",
]);

export function sanitizePreviewHtml(html: string): string {
  if (typeof document === "undefined" || !html) return "";
  const tpl = document.createElement("template");
  tpl.innerHTML = html;
  for (const el of Array.from(tpl.content.querySelectorAll("*"))) {
    if (FORBIDDEN_TAGS.has(el.tagName)) {
      el.remove();
      continue;
    }
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      const value = attr.value.replace(/\s+/g, "").toLowerCase();
      if (name.startsWith("on")) {
        el.removeAttribute(attr.name);
      } else if (
        (name === "href" || name === "src" || name === "xlink:href") &&
        (value.startsWith("javascript:") || value.startsWith("data:text/html"))
      ) {
        el.removeAttribute(attr.name);
      } else if (name === "srcdoc") {
        el.removeAttribute(attr.name);
      }
    }
  }
  return tpl.innerHTML;
}
