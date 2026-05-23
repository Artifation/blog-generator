/**
 * Wiki navigatie-helpers: flat ordering over categorieën, prev/next per
 * artikel, en "gerelateerde artikelen". Pure data — geen React.
 */
import {
  ARTICLES,
  ARTICLE_BY_SLUG,
  CATEGORY_ORDER,
  type WikiArticle,
  type WikiArticleMeta,
} from "./articles";

/** Flat lijst van artikelen in lees-volgorde (per categorie, in CATEGORY_ORDER). */
let _flat: WikiArticle[] | null = null;
export function flatArticleOrder(): WikiArticle[] {
  if (_flat) return _flat;
  const byCat = new Map<string, WikiArticle[]>();
  for (const a of ARTICLES) {
    const list = byCat.get(a.category) ?? [];
    list.push(a);
    byCat.set(a.category, list);
  }
  _flat = CATEGORY_ORDER.flatMap((c) => byCat.get(c) ?? []);
  return _flat;
}

export interface PrevNext {
  prev: WikiArticleMeta | null;
  next: WikiArticleMeta | null;
}

export function getPrevNext(slug: string): PrevNext {
  const order = flatArticleOrder();
  const i = order.findIndex((a) => a.slug === slug);
  if (i === -1) return { prev: null, next: null };
  return {
    prev: i > 0 ? metaOf(order[i - 1]) : null,
    next: i < order.length - 1 ? metaOf(order[i + 1]) : null,
  };
}

function metaOf(a: WikiArticle): WikiArticleMeta {
  return {
    slug: a.slug,
    title: a.title,
    category: a.category,
    summary: a.summary,
    readMinutes: a.readMinutes,
    tags: a.tags,
    related: a.related,
    updated: a.updated,
  };
}

/**
 * "Gerelateerde artikelen". Voorkeursvolgorde:
 *   1. expliciet `related: ["slug", ...]` in artikel-meta (overschrijft alles)
 *   2. anders: artikelen met overlappende tags, gesorteerd op aantal overlap
 *   3. anders / aanvullen tot `count`: andere artikelen uit zelfde categorie
 */
export function getRelated(slug: string, count = 3): WikiArticleMeta[] {
  const me = ARTICLE_BY_SLUG[slug];
  if (!me) return [];

  if (me.related && me.related.length) {
    return me.related
      .map((s) => ARTICLE_BY_SLUG[s])
      .filter((a): a is WikiArticle => Boolean(a))
      .slice(0, count)
      .map(metaOf);
  }

  const myTags = new Set(me.tags ?? []);
  const scored: Array<{ a: WikiArticle; score: number }> = [];
  for (const a of ARTICLES) {
    if (a.slug === slug) continue;
    let score = 0;
    if (myTags.size && a.tags) {
      for (const t of a.tags) if (myTags.has(t)) score += 2;
    }
    if (a.category === me.category) score += 1;
    if (score > 0) scored.push({ a, score });
  }
  scored.sort((x, y) => y.score - x.score);
  return scored.slice(0, count).map((s) => metaOf(s.a));
}
