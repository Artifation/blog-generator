/**
 * Parses fabricated-claim entries out of a rejected draft's `hardFails`
 * column for the writer retry-feedback loop.
 *
 * `hardFails` stores fact-checker entries in the form
 *   "fabricated claim: <claim> — <reason>"
 * where `<reason>` is the fact-checker's short meta-comment (optional,
 * separated by a space-em-dash-space).
 *
 * The UI badge shows the full string, but the writer's retry loop only
 * wants the claim itself — passing "47% — niet in key_facts" as if it
 * were the claim text would make the writer try to avoid the meta-comment
 * too. We strip both the prefix and the trailing reason.
 *
 * Non-fabricated hardFails entries are filtered out.
 */
export const FABRICATED_PREFIX = "fabricated claim: ";
export const REASON_SEPARATOR = " — ";
export const FIX_SUFFIX_MARKER = "\n→ FIX: ";

export function parsePreviousFabricatedClaims(hardFails: readonly string[]): string[] {
  return hardFails
    .filter((f) => f.startsWith(FABRICATED_PREFIX))
    .map((f) => f.slice(FABRICATED_PREFIX.length))
    .map((f) => {
      // Strip de optionele "\n→ FIX: <rewrite>" suffix (door factChecker-fixer
      // toegevoegd) voordat we de reason knippen — anders eindigt de FIX in
      // de claim-text en zou de writer hem proberen te vermijden.
      const fixIdx = f.indexOf(FIX_SUFFIX_MARKER);
      const withoutFix = fixIdx >= 0 ? f.slice(0, fixIdx) : f;
      const idx = withoutFix.lastIndexOf(REASON_SEPARATOR);
      return idx > 0 ? withoutFix.slice(0, idx) : withoutFix;
    });
}
