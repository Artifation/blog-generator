export function computeFleschNL(text: string): number {
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  const words = text.toLowerCase().split(/\s+/).filter((w) => /[a-z]/.test(w));
  if (sentences.length === 0 || words.length === 0) return 0;
  const syllables = words.reduce((sum, w) => sum + countSyllablesNl(w), 0);
  return 206.835 - 0.93 * (words.length / sentences.length) - 77 * (syllables / words.length);
}

export function countSyllablesNl(word: string): number {
  const cleaned = word.replace(/[^a-z]/g, "");
  if (cleaned.length === 0) return 0;
  const clusters = cleaned.match(/[aeiouy]+/g);
  let count = clusters ? clusters.length : 1;
  // silent 'e' at end
  if (count > 1 && cleaned.endsWith("e")) count--;
  return Math.max(1, count);
}
