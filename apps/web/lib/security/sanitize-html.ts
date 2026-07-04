/**
 * HTML sanitization for model/user-authored blog content.
 *
 * `contentHtml` is fully controlled by the model output, the raw-HTML editor
 * tab, and (transitively) scraped sources, then rendered with
 * dangerouslySetInnerHTML on the PUBLIC blog and re-published to WordPress.
 * Without sanitization that is a stored-XSS sink (script tags, event handlers,
 * javascript: URLs, iframes). We allowlist exactly the tags/attributes blog
 * content needs and drop everything else.
 *
 * Apply on WRITE (draft save) and on PUBLISH so stored data is clean, and again
 * on RENDER of the public blog as defense-in-depth for any legacy/unsanitized
 * rows.
 */

import sanitizeHtml from "sanitize-html";

const ALLOWED_TAGS = [
  "h1", "h2", "h3", "h4", "h5", "h6",
  "p", "br", "hr", "span", "div",
  "strong", "b", "em", "i", "u", "s", "sub", "sup", "mark", "small",
  "ul", "ol", "li",
  "blockquote", "q", "cite",
  "a", "img", "figure", "figcaption",
  "code", "pre", "kbd", "samp",
  "table", "thead", "tbody", "tfoot", "tr", "th", "td", "caption", "colgroup", "col",
  "dl", "dt", "dd",
  "abbr", "time",
];

const CONFIG: sanitizeHtml.IOptions = {
  allowedTags: ALLOWED_TAGS,
  allowedAttributes: {
    a: ["href", "name", "target", "rel", "title"],
    img: ["src", "alt", "title", "width", "height", "loading"],
    th: ["scope", "colspan", "rowspan"],
    td: ["colspan", "rowspan"],
    time: ["datetime"],
    abbr: ["title"],
    "*": ["class", "id"],
  },
  // Only safe URL schemes; this is what blocks javascript:/data: URLs.
  allowedSchemes: ["http", "https", "mailto", "tel"],
  allowedSchemesByTag: { img: ["http", "https"] },
  allowProtocolRelative: false,
  // Drop the contents of these entirely (don't leave inline script text behind).
  nonTextTags: ["style", "script", "textarea", "option", "noscript"],
  transformTags: {
    // Any link that opens a new tab must not leak window.opener.
    a: (tagName, attribs) => {
      const out: Record<string, string> = { ...attribs };
      if (out.target === "_blank") {
        out.rel = "noopener noreferrer";
      }
      return { tagName, attribs: out };
    },
  },
};

/** Sanitize blog/article HTML against the allowlist above. */
export function sanitizeContentHtml(html: string | null | undefined): string {
  if (!html) return "";
  return sanitizeHtml(html, CONFIG);
}
