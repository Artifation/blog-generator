import type { WordpressClient } from "./client.ts";

export interface RankMathMeta {
  rank_math_title: string;
  rank_math_description: string;
  rank_math_focus_keyword: string;
  rank_math_canonical_url?: string;
}

export async function setRankMathMeta(
  client: WordpressClient,
  postId: number,
  meta: RankMathMeta
): Promise<void> {
  await client.postJson(`/wp-json/rank-math-api/v1/update-meta`, {
    post_id: postId,
    rank_math_title: meta.rank_math_title,
    rank_math_description: meta.rank_math_description,
    rank_math_focus_keyword: meta.rank_math_focus_keyword,
    ...(meta.rank_math_canonical_url ? { rank_math_canonical_url: meta.rank_math_canonical_url } : {}),
  });
}
