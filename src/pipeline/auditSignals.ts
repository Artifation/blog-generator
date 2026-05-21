/**
 * Deterministic content analyzers used by the blog-audit feature. All pure
 * functions, all instant + free. Returned signals are surfaced in the audit
 * UI alongside the AI's qualitative scoring.
 */

// ---------------------------------------------------------------------------
// Heading structure
// ---------------------------------------------------------------------------

export interface HeadingAnalysis {
  counts: { h1: number; h2: number; h3: number; h4: number };
  /** Issues are human-readable strings; an empty array means the structure is sound. */
  issues: string[];
  /** Headings in document order, useful for hierarchy checks. */
  order: { level: number; text: string }[];
}

export function analyzeHeadings(html: string): HeadingAnalysis {
  const tagRe = /<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi;
  const order: { level: number; text: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(html)) !== null) {
    order.push({ level: Number(m[1]), text: stripInner(m[2] ?? "") });
  }

  const counts = { h1: 0, h2: 0, h3: 0, h4: 0 };
  for (const h of order) {
    if (h.level === 1) counts.h1++;
    else if (h.level === 2) counts.h2++;
    else if (h.level === 3) counts.h3++;
    else if (h.level === 4) counts.h4++;
  }

  const issues: string[] = [];
  if (counts.h1 === 0) issues.push("Geen H1 — elke blog hoort één H1 te hebben");
  if (counts.h1 > 1) issues.push("Meerdere H1's — er hoort maar één H1 per post te zijn");

  // Hierarchy jumps: any time we go from level N to level N+2 or deeper without
  // the intermediate level.
  for (let i = 1; i < order.length; i++) {
    const prev = order[i - 1]!;
    const cur = order[i]!;
    if (cur.level > prev.level + 1) {
      issues.push(
        `Heading-niveau gesprongen: H${prev.level} → H${cur.level} (H${prev.level + 1} overgeslagen)`
      );
      break; // one is enough; don't spam
    }
  }

  // Long posts with few H2 sections are hard to scan.
  const wordCount = stripHtml(html).split(/\s+/).filter(Boolean).length;
  if (wordCount > 1000 && counts.h2 < 3) {
    issues.push("Te weinig H2-secties voor de lengte — splits de tekst op in scanbare blokken");
  }

  return { counts, issues, order };
}

// ---------------------------------------------------------------------------
// Sentence stats
// ---------------------------------------------------------------------------

export interface SentenceAnalysis {
  count: number;
  avgWords: number;
  medianWords: number;
  maxWords: number;
  percentOver25Words: number;
  longSentences: { sentence: string; wordCount: number }[];
}

export function analyzeSentences(textOrHtml: string): SentenceAnalysis {
  const text = stripHtml(textOrHtml);
  if (!text.trim()) {
    return { count: 0, avgWords: 0, medianWords: 0, maxWords: 0, percentOver25Words: 0, longSentences: [] };
  }
  // Split on . ! ? (followed by space or end of string). Keep groups so common
  // abbreviations like "bv." don't fragment too much — we accept some noise.
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && /\w/.test(s));

  const counts = sentences.map((s) => s.split(/\s+/).filter(Boolean).length);
  const total = counts.reduce((a, b) => a + b, 0);
  const avg = sentences.length > 0 ? total / sentences.length : 0;
  const sorted = [...counts].sort((a, b) => a - b);
  const median =
    sorted.length === 0
      ? 0
      : sorted.length % 2 === 1
      ? sorted[(sorted.length - 1) / 2]!
      : Math.round((sorted[sorted.length / 2 - 1]! + sorted[sorted.length / 2]!) / 2);
  const max = counts.length > 0 ? Math.max(...counts) : 0;
  const longCount = counts.filter((c) => c > 25).length;
  const percentOver25 = sentences.length > 0 ? (longCount / sentences.length) * 100 : 0;
  const longSentences = sentences
    .map((s, i) => ({ sentence: s, wordCount: counts[i]! }))
    .filter((s) => s.wordCount > 25)
    .sort((a, b) => b.wordCount - a.wordCount)
    .slice(0, 10);

  return {
    count: sentences.length,
    avgWords: Math.round(avg * 10) / 10,
    medianWords: median,
    maxWords: max,
    percentOver25Words: Math.round(percentOver25 * 10) / 10,
    longSentences,
  };
}

// ---------------------------------------------------------------------------
// Passive voice (Dutch)
// ---------------------------------------------------------------------------

/**
 * Counts passive constructions in Dutch text: a form of worden/zijn followed
 * (within a small window, same sentence) by a past participle. Best-effort —
 * flags the common forms reliably without trying to be a full Dutch parser.
 */
export function countPassiveVoiceNL(textOrHtml: string): number {
  const text = stripHtml(textOrHtml).toLowerCase();
  // Auxiliary forms of "worden" and "zijn". Order longer-first so the regex
  // doesn't truncate "worden" → "word".
  const aux = /\b(?:worden|wordt|word|werden|werd|geworden|waren|zijn|was|is)\b/g;
  // Past participle: ge-/be-/ver-/ont-/her- prefix, ≥2 letters, ending d/t/en.
  const participle = /\b(?:ge|be|ver|ont|her)[a-zà-ÿ]{2,}(?:d|t|en)\b/;
  let count = 0;
  let m: RegExpExecArray | null;
  while ((m = aux.exec(text)) !== null) {
    // Look ahead 80 chars but stop at the next sentence terminator so we
    // don't credit the next sentence's participle to this aux.
    const tail = text.slice(aux.lastIndex, aux.lastIndex + 80);
    const stop = tail.search(/[.!?\n]/);
    const window = stop >= 0 ? tail.slice(0, stop) : tail;
    if (participle.test(window)) count++;
  }
  return count;
}

// ---------------------------------------------------------------------------
// Reading time
// ---------------------------------------------------------------------------

/** NL average reading speed ~200 wpm. Round up; minimum 1 if there's any content. */
export function estimateReadingTimeMinutes(wordCount: number): number {
  if (wordCount <= 0) return 0;
  return Math.max(1, Math.ceil(wordCount / 200));
}

// ---------------------------------------------------------------------------
// Questions
// ---------------------------------------------------------------------------

export function countQuestions(textOrHtml: string): number {
  const text = stripHtml(textOrHtml);
  // Collapse consecutive ?? into one — "Waarom??" is one question.
  return (text.match(/\?+/g) ?? []).length;
}

// ---------------------------------------------------------------------------
// Paragraph length distribution
// ---------------------------------------------------------------------------

export interface ParagraphDistribution {
  count: number;
  short: number; // < 30 words — punchy
  medium: number; // 30-80 words — sweet spot
  long: number; // > 80 words — likely wall-of-text
  avgWords: number;
  lengths: number[]; // raw lengths in order, for sparkline rendering
}

export function analyzeParagraphs(html: string): ParagraphDistribution {
  const lengths = [...html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((m) => stripHtml(m[1] ?? "").split(/\s+/).filter(Boolean).length)
    .filter((n) => n > 0);
  if (lengths.length === 0) {
    return { count: 0, short: 0, medium: 0, long: 0, avgWords: 0, lengths: [] };
  }
  const short = lengths.filter((n) => n < 30).length;
  const medium = lengths.filter((n) => n >= 30 && n <= 80).length;
  const long = lengths.filter((n) => n > 80).length;
  const avg = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  return {
    count: lengths.length,
    short,
    medium,
    long,
    avgWords: Math.round(avg * 10) / 10,
    lengths,
  };
}

// ---------------------------------------------------------------------------
// Keyword distribution — where does the target keyword land?
// ---------------------------------------------------------------------------

export interface KeywordDistribution {
  /** Total occurrences in the full body text. */
  total: number;
  /** Appears in the title / H1 of the post. */
  inTitle: boolean;
  /** Appears anywhere in the first 200 words (intro). */
  inIntro: boolean;
  /** Appears in at least one H2/H3 subheading. */
  inSubheading: boolean;
  /** Appears in the last 200 words (conclusion-ish). */
  inConclusion: boolean;
  /** Headings (text only) that mention the keyword. */
  headingsWithKeyword: string[];
}

export function analyzeKeywordDistribution(html: string, keyword: string): KeywordDistribution {
  const kw = keyword.trim().toLowerCase();
  if (!kw) {
    return { total: 0, inTitle: false, inIntro: false, inSubheading: false, inConclusion: false, headingsWithKeyword: [] };
  }
  const fullText = stripHtml(html).toLowerCase();
  const words = fullText.split(/\s+/).filter(Boolean);
  const total = countOccurrences(fullText, kw);

  // Title = first H1, else first H2.
  const h1Match = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
  const h2Match = /<h2[^>]*>([\s\S]*?)<\/h2>/i.exec(html);
  const title = stripInner((h1Match?.[1] ?? h2Match?.[1]) ?? "").toLowerCase();
  const inTitle = title.includes(kw);

  // Intro = first 200 words of the body (heuristic; close enough).
  const intro = words.slice(0, 200).join(" ");
  const inIntro = intro.includes(kw);

  // Conclusion = last 200 words.
  const conclusion = words.slice(Math.max(0, words.length - 200)).join(" ");
  const inConclusion = conclusion.includes(kw);

  // Subheadings.
  const subRe = /<h([2-3])[^>]*>([\s\S]*?)<\/h\1>/gi;
  const headingsWithKeyword: string[] = [];
  let sm: RegExpExecArray | null;
  while ((sm = subRe.exec(html)) !== null) {
    const txt = stripInner(sm[2] ?? "");
    if (txt.toLowerCase().includes(kw)) headingsWithKeyword.push(txt);
  }

  return {
    total,
    inTitle,
    inIntro,
    inSubheading: headingsWithKeyword.length > 0,
    inConclusion,
    headingsWithKeyword,
  };
}

// ---------------------------------------------------------------------------
// Phrase hits with surrounding context — for ban-list + cliché lists.
// ---------------------------------------------------------------------------

export interface PhraseHit {
  term: string;
  context: string; // ~80 chars surrounding the hit, with the term centered
}

const DEFAULT_AI_CLICHES = [
  "delve",
  "leverage",
  "harness the power of",
  "moreover",
  "furthermore",
  "additionally",
  "notably",
  "it's worth noting",
  "in conclusion",
  "to sum up",
  "tot slot",
  "samenvattend",
  "in een wereld waar",
  "in de steeds veranderende wereld",
  "cruciaal",
  "essentieel",
  "het is belangrijk om te begrijpen",
];

export function findPhraseHits(html: string, terms: string[], maxHits = 5): PhraseHit[] {
  const text = stripHtml(html);
  const lower = text.toLowerCase();
  const out: PhraseHit[] = [];
  const seen = new Set<string>();
  for (const term of terms) {
    if (!term) continue;
    const t = term.toLowerCase();
    const idx = lower.indexOf(t);
    if (idx === -1) continue;
    const start = Math.max(0, idx - 40);
    const end = Math.min(text.length, idx + t.length + 40);
    const prefix = start === 0 ? "" : "…";
    const suffix = end === text.length ? "" : "…";
    const context = `${prefix}${text.slice(start, end)}${suffix}`;
    const key = `${term}|${context}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ term, context });
    if (out.length >= maxHits) break;
  }
  return out;
}

export function getDefaultAiCliches(): string[] {
  return [...DEFAULT_AI_CLICHES];
}

// ---------------------------------------------------------------------------
// First-paragraph (hook) analysis
// ---------------------------------------------------------------------------

export interface IntroAnalysis {
  text: string;
  wordCount: number;
  /** Target keyword appears in the first paragraph. */
  hasKeyword: boolean;
  /** Opens with or contains a question — a common hook tactic. */
  hasQuestion: boolean;
  /** Addresses the reader (je/jij/jouw/u/uw) — increases engagement. */
  addressesReader: boolean;
  /** Opens with a number, statistic, or "wist je dat" — strong hook signal. */
  hasNumberHook: boolean;
  /** 0-3 score summarizing the hook quality. */
  hookScore: number;
}

export function analyzeIntro(html: string, keyword: string): IntroAnalysis {
  const firstP = /<p[^>]*>([\s\S]*?)<\/p>/i.exec(html);
  let text = firstP ? stripInner(firstP[1] ?? "") : "";
  // Fallback: first 60 words of body if no <p>.
  if (!text) {
    text = stripHtml(html).split(/\s+/).slice(0, 60).join(" ");
  }
  const lower = text.toLowerCase();
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  const hasKeyword = !!keyword && lower.includes(keyword.toLowerCase());
  const hasQuestion = /\?/.test(text);
  const addressesReader = /\b(je|jij|jouw|jullie|u|uw)\b/i.test(text);
  const hasNumberHook = /\b\d{1,3}([.,]\d+)?\s?(%|procent|miljoen|miljard|uur|min|seconden)?/.test(text);

  let hookScore = 0;
  if (hasKeyword) hookScore++;
  if (hasQuestion || hasNumberHook) hookScore++;
  if (addressesReader) hookScore++;

  return { text, wordCount, hasKeyword, hasQuestion, addressesReader, hasNumberHook, hookScore };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function stripInner(s: string): string {
  return s.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let i = 0;
  let count = 0;
  while (true) {
    const idx = haystack.indexOf(needle, i);
    if (idx === -1) return count;
    count++;
    i = idx + needle.length;
  }
}
