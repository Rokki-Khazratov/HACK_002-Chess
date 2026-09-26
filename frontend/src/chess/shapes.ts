/**
 * User-drawn analysis marks: coloured squares and arrows, chess.com / lichess style.
 * Colours use the PGN letters both sites read and write in `[%csl …]` / `[%cal …]`.
 */
export type ShapeColor = 'R' | 'G' | 'B' | 'Y';

/** A square mark when `to` is absent, otherwise an arrow from `from` to `to`. */
export interface Shape {
  from: string;
  to?: string;
  color: ShapeColor;
}

export interface ShapeModifiers {
  shiftKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;
}

/** Arrows are orange and squares red by default; Shift is green, Ctrl/⌘ blue, Alt swaps. */
export function shapeColor(isArrow: boolean, keys: ShapeModifiers): ShapeColor {
  if (keys.shiftKey) return 'G';
  if (keys.ctrlKey || keys.metaKey) return 'B';
  if (keys.altKey) return isArrow ? 'R' : 'Y';
  return isArrow ? 'Y' : 'R';
}

export const ARROW_COLORS: Record<ShapeColor, string> = {
  R: '#e8483a',
  G: '#3fa34d',
  B: '#2f80ed',
  Y: '#ffaa00',
};

export const SQUARE_COLORS: Record<ShapeColor, string> = {
  R: 'rgba(235, 97, 80, 0.85)',
  G: 'rgba(120, 190, 70, 0.8)',
  B: 'rgba(70, 150, 230, 0.8)',
  Y: 'rgba(245, 190, 50, 0.85)',
};

const sameSpot = (a: Shape, b: Shape) => a.from === b.from && (a.to ?? null) === (b.to ?? null);

/**
 * Drawing a mark again removes it; drawing it in another colour recolours it.
 * Returns a new list and never mutates `shapes`.
 */
export function toggleShape(shapes: readonly Shape[], shape: Shape): Shape[] {
  const existing = shapes.find((s) => sameSpot(s, shape));
  const rest = shapes.filter((s) => !sameSpot(s, shape));
  return existing?.color === shape.color ? rest : [...rest, shape];
}

/** The `[%csl …][%cal …]` command pair for a PGN comment, or '' when there are no marks. */
export function formatShapes(shapes: readonly Shape[] | undefined): string {
  if (!shapes?.length) return '';
  const squares = shapes.filter((s) => !s.to).map((s) => `${s.color}${s.from}`);
  const arrows = shapes.filter((s) => s.to).map((s) => `${s.color}${s.from}${s.to}`);
  return (squares.length ? `[%csl ${squares.join(',')}]` : '') + (arrows.length ? `[%cal ${arrows.join(',')}]` : '');
}

/** Reads `[%csl …]` and `[%cal …]` commands out of a PGN comment body. */
export function parseShapes(comment: string): Shape[] {
  let shapes: Shape[] = [];
  for (const [, kind, list] of comment.matchAll(/\[%(csl|cal)\s+([^\]]*)\]/g)) {
    for (const item of list.split(',')) {
      const match = /^([RGBY])([a-h][1-8])([a-h][1-8])?$/.exec(item.trim());
      if (!match) continue;
      const [, color, from, to] = match;
      if ((kind === 'cal') !== Boolean(to)) continue;
      const shape: Shape = { from, to, color: color as ShapeColor };
      shapes = [...shapes.filter((s) => !sameSpot(s, shape)), shape];
    }
  }
  return shapes;
}
