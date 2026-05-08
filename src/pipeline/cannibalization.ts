export interface CannibalizationInput {
  targetKeyword: string;
  existingSlugs: string[];
  existingTitles: string[];
}

export interface CannibalizationResult {
  isCannibalized: boolean;
  reason?: string;
}

const STOPWORDS = new Set([
  "de", "het", "een", "in", "op", "voor", "van", "en", "of", "te", "om",
  "the", "and", "a", "an", "to", "for",
]);

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 0)
    .join("-");
}

export function detectCannibalization(
  input: CannibalizationInput
): CannibalizationResult {
  const kwTokens = tokenize(input.targetKeyword);
  const kwSlug = slugify(input.targetKeyword);

  for (const slug of input.existingSlugs) {
    if (slug.includes(kwSlug)) {
      return {
        isCannibalized: true,
        reason: `keyword appears in existing slug: ${slug}`,
      };
    }
  }

  for (const title of input.existingTitles) {
    const tTokens = tokenize(title);
    const overlap = kwTokens.filter((t) => tTokens.includes(t)).length;
    const ratio = kwTokens.length > 0 ? overlap / kwTokens.length : 0;
    if (ratio > 0.5) {
      return {
        isCannibalized: true,
        reason: `>50% keyword-token overlap with title: ${title}`,
      };
    }
  }

  return { isCannibalized: false };
}
