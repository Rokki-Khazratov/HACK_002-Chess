const FIGURINES: Record<string, string> = {
  K: '♚',
  Q: '♛',
  R: '♜',
  B: '♝',
  N: '♞',
};

/**
 * Splits SAN into a figurine and the rest ("Qxa7" → ["♛", "xa7"], "e4" → ["", "e4"]).
 * The glyphs are the solid set for both colours, as on Chess.com; U+FE0E forces
 * text rather than emoji rendering.
 */
export function figurine(san: string): [piece: string, rest: string] {
  const glyph = FIGURINES[san[0]];
  return glyph ? [`${glyph}︎`, san.slice(1)] : ['', san];
}
