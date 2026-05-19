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
// Helpers
// ---------------------------------------------------------------------------

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function stripInner(s: string): string {
  return s.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}
