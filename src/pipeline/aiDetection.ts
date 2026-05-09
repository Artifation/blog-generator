export interface AiDetectionInput {
  text: string;
  apiKey: string;
  provider?: "gptzero" | "originality"; // default gptzero
  fetchImpl?: typeof fetch;
}

export interface AiDetectionResult {
  ai_score_pct: number; // 0-100
  human_score_pct: number;
  provider: "gptzero" | "originality";
  raw?: unknown; // debug
}

export async function detectAiContent(input: AiDetectionInput): Promise<AiDetectionResult> {
  const provider = input.provider ?? "gptzero";
  const fetchFn = input.fetchImpl ?? fetch;

  if (provider === "gptzero") {
    return detectWithGptzero(input.text, input.apiKey, fetchFn);
  } else {
    return detectWithOriginality(input.text, input.apiKey, fetchFn);
  }
}

async function detectWithGptzero(
  text: string,
  apiKey: string,
  fetchFn: typeof fetch
): Promise<AiDetectionResult> {
  const res = await fetchFn("https://api.gptzero.me/v2/predict/text", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify({ document: text }),
  });

  if (!res.ok) {
    throw new Error(`GPTZero returned status ${res.status}`);
  }

  const raw: unknown = await res.json();

  const aiProbability =
    (raw as any)?.documents?.[0]?.class_probabilities?.ai;

  if (typeof aiProbability !== "number") {
    throw new Error("GPTZero response malformed: missing documents[0].class_probabilities.ai");
  }

  const aiScorePct = Math.round(aiProbability * 100);

  return {
    ai_score_pct: aiScorePct,
    human_score_pct: 100 - aiScorePct,
    provider: "gptzero",
    raw,
  };
}

async function detectWithOriginality(
  text: string,
  apiKey: string,
  fetchFn: typeof fetch
): Promise<AiDetectionResult> {
  const res = await fetchFn("https://api.originality.ai/api/v1/scan/ai", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-OAI-API-KEY": apiKey,
    },
    body: JSON.stringify({ content: text }),
  });

  if (!res.ok) {
    throw new Error(`Originality.ai returned status ${res.status}`);
  }

  const raw: unknown = await res.json();

  const aiScore = (raw as any)?.score?.ai;

  if (typeof aiScore !== "number") {
    throw new Error("Originality.ai response malformed: missing score.ai");
  }

  const aiScorePct = Math.round(aiScore * 100);

  return {
    ai_score_pct: aiScorePct,
    human_score_pct: 100 - aiScorePct,
    provider: "originality",
    raw,
  };
}
