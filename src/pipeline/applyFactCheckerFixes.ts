/**
 * Applies factChecker-fixer's suggested_rewrites op de edited_html van een
 * draft. Wordt aangeroepen door de pipeline wanneer de eerste fact-check een
 * "fail" verdict gaf maar wel rewrites bevatte — we proberen één bounded
 * auto-fix poging vóór we de draft rejectten.
 *
 * Niet alle fixes zijn auto-applicable:
 *  - "VERWIJDER DEZE ZIN/PARAGRAAF" → skip auto-apply, blijft een hard fail
 *  - claim niet exact in HTML (LLM kan paraphraseerd hebben) → skip, hard fail
 *  - meerdere overlapping fixes op zelfde sentence → niet-overlappend volgorde
 *
 * Returns: { patched_html, applied, skipped } zodat de pipeline weet of
 * her-checken nuttig is (alleen wanneer applied > 0).
 */

const SENTENCE_REMOVAL_MARKERS = [
  "VERWIJDER DEZE ZIN",
  "VERWIJDER DEZE PARAGRAAF",
];

export interface FactCheckerFix {
  claim: string;
  reason: string;
  suggested_rewrite?: string;
}

export interface ApplyFixesInput {
  html: string;
  fixes: FactCheckerFix[];
}

export interface ApplyFixesResult {
  patched_html: string;
  applied: AppliedFix[];
  skipped: SkippedFix[];
}

export interface AppliedFix {
  claim: string;
  rewrite: string;
}

export interface SkippedFix {
  claim: string;
  reason: "no_rewrite" | "removal_marker" | "claim_not_found";
}

export function applyFactCheckerFixes(input: ApplyFixesInput): ApplyFixesResult {
  let working = input.html;
  const applied: AppliedFix[] = [];
  const skipped: SkippedFix[] = [];

  // Sort fixes by claim-length descending: langste claims eerst zodat een
  // korte claim die als substring in een lange claim voorkomt niet eerst de
  // langere "kapot maakt". Voorbeeld: claim "47%" mag pas vervangen worden
  // nadat "47% van het MKB" is afgehandeld.
  const sorted = [...input.fixes].sort((a, b) => b.claim.length - a.claim.length);

  for (const fix of sorted) {
    if (!fix.suggested_rewrite) {
      skipped.push({ claim: fix.claim, reason: "no_rewrite" });
      continue;
    }
    if (SENTENCE_REMOVAL_MARKERS.some((m) => fix.suggested_rewrite!.toUpperCase().includes(m))) {
      skipped.push({ claim: fix.claim, reason: "removal_marker" });
      continue;
    }
    if (!working.includes(fix.claim)) {
      // Probeer whitespace-tolerant match: collapse multi-whitespace in beide
      // en zoek opnieuw. Komt voor als de LLM een quote uit HTML pakt waar
      // tags whitespace toevoegen.
      const normalized = (s: string) => s.replace(/\s+/g, " ");
      const haystackNorm = normalized(working);
      const claimNorm = normalized(fix.claim);
      const idx = haystackNorm.indexOf(claimNorm);
      if (idx < 0) {
        skipped.push({ claim: fix.claim, reason: "claim_not_found" });
        continue;
      }
      // Find originele substring positie in working die overeenkomt
      const origRange = findOriginalRange(working, claimNorm, idx);
      if (!origRange) {
        skipped.push({ claim: fix.claim, reason: "claim_not_found" });
        continue;
      }
      working = working.slice(0, origRange[0]) + fix.suggested_rewrite + working.slice(origRange[1]);
      applied.push({ claim: fix.claim, rewrite: fix.suggested_rewrite });
      continue;
    }
    working = working.replace(fix.claim, fix.suggested_rewrite);
    applied.push({ claim: fix.claim, rewrite: fix.suggested_rewrite });
  }

  return { patched_html: working, applied, skipped };
}

/**
 * Vind in `source` de [start, end] indices van de substring die — na
 * whitespace-collapse — gelijk is aan `targetNorm`. We weten dat hij op
 * positie `idxInNorm` in de genormaliseerde versie zit; we walken de
 * originele string en houden parallel een normalized-cursor bij.
 */
function findOriginalRange(
  source: string,
  targetNorm: string,
  idxInNorm: number
): [number, number] | null {
  let normCursor = 0;
  let lastCharWasWhitespace = false;
  let origStart = -1;
  let origEnd = -1;
  for (let i = 0; i < source.length; i++) {
    const c = source[i]!;
    const isWs = /\s/.test(c);

    // Bepaal of we voor het normalized-counten "iets" toevoegen
    if (isWs) {
      if (!lastCharWasWhitespace) {
        if (origStart === -1 && normCursor === idxInNorm) origStart = i;
        normCursor++;
      }
      lastCharWasWhitespace = true;
    } else {
      if (origStart === -1 && normCursor === idxInNorm) origStart = i;
      normCursor++;
      lastCharWasWhitespace = false;
    }

    if (origStart !== -1 && normCursor >= idxInNorm + targetNorm.length) {
      origEnd = i + 1;
      break;
    }
  }
  if (origStart === -1 || origEnd === -1) return null;
  return [origStart, origEnd];
}
