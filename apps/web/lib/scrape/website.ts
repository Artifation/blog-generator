/**
 * Lightweight website scraper for onboarding auto-fill.
 *
 * Fetches the homepage (and an optional /about page) and extracts a clean
 * text representation small enough to send to an LLM. We do NOT use a
 * headless browser — only HTML the server renders.
 */

import { guardedFetch } from "../security/ssrf";

const USER_AGENT =
  "Mozilla/5.0 (compatible; ArtifationBlogBot/1.0; +https://artifation.nl)";

const MAX_CHARS_PER_PAGE = 8000;
const FETCH_TIMEOUT_MS = 8000;

const ABOUT_PATHS = [
  "/over-ons",
  "/over",
  "/about",
  "/about-us",
  "/team",
  "/who-we-are",
  "/wie-zijn-wij",
];

export interface ScrapedSite {
  homepageUrl: string;
  finalUrl: string;
  title: string;
  description: string;
  text: string;
  aboutText: string | null;
  hasErrors: boolean;
}

function normalizeUrl(input: string): string {
  let url = input.trim();
  if (!/^https?:\/\//i.test(url)) url = "https://" + url;
  // Strip trailing slash for predictability
  return url.replace(/\/+$/, "");
}

async function fetchWithTimeout(
  url: string,
  timeoutMs = FETCH_TIMEOUT_MS
): Promise<{ res: Response; finalUrl: string }> {
  // SSRF-guarded: rejects non-public targets and re-validates every redirect
  // hop (so an attacker can't 302 us into an internal service).
  return guardedFetch(url, {
    timeoutMs,
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "nl,en;q=0.8",
    },
  });
}

/**
 * Strip HTML to plain text. We keep paragraph breaks so the model can see
 * structure, but throw away script/style/nav/footer noise.
 */
function htmlToText(html: string): { title: string; description: string; text: string } {
  // Title + meta description (cheap regex — no need to parse the whole DOM).
  const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  const descMatch =
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i.exec(html) ??
    /<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i.exec(html);
  const ogDescMatch =
    /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']*)["']/i.exec(html);

  const title = (titleMatch?.[1] ?? "").trim();
  const description = (descMatch?.[1] ?? ogDescMatch?.[1] ?? "").trim();

  // Remove noisy regions
  let body = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<header[\s\S]*?<\/header>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ");

  // Convert blocks to newlines so paragraphs survive
  body = body.replace(/<\/(p|div|li|h[1-6]|br)>/gi, "\n");
  body = body.replace(/<[^>]+>/g, " ");
  body = body
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  body = body.replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n\n").trim();

  return {
    title,
    description,
    text: body.slice(0, MAX_CHARS_PER_PAGE),
  };
}

async function tryFetchOne(url: string): Promise<{ ok: true; html: string; finalUrl: string } | { ok: false }> {
  try {
    const { res, finalUrl } = await fetchWithTimeout(url);
    if (!res.ok) return { ok: false };
    const ct = res.headers.get("content-type") ?? "";
    if (!ct.includes("text/html") && !ct.includes("text/")) return { ok: false };
    const html = await res.text();
    return { ok: true, html, finalUrl: res.url || finalUrl };
  } catch {
    // Includes SsrfError for blocked targets — treated as an unreachable page.
    return { ok: false };
  }
}

export async function scrapeWebsite(input: string): Promise<ScrapedSite> {
  const homepageUrl = normalizeUrl(input);

  let homepageResult = await tryFetchOne(homepageUrl);
  // If https failed and user gave a bare domain, try http as fallback
  if (!homepageResult.ok && homepageUrl.startsWith("https://")) {
    homepageResult = await tryFetchOne(homepageUrl.replace(/^https:\/\//, "http://"));
  }

  if (!homepageResult.ok) {
    return {
      homepageUrl,
      finalUrl: homepageUrl,
      title: "",
      description: "",
      text: "",
      aboutText: null,
      hasErrors: true,
    };
  }

  const home = htmlToText(homepageResult.html);

  // Best-effort fetch of an "about" page from same origin.
  let aboutText: string | null = null;
  for (const path of ABOUT_PATHS) {
    const aboutUrl = homepageUrl + path;
    const aboutResult = await tryFetchOne(aboutUrl);
    if (aboutResult.ok) {
      const a = htmlToText(aboutResult.html);
      if (a.text.length > 200) {
        aboutText = a.text;
        break;
      }
    }
  }

  return {
    homepageUrl,
    finalUrl: homepageResult.finalUrl,
    title: home.title,
    description: home.description,
    text: home.text,
    aboutText,
    hasErrors: false,
  };
}
