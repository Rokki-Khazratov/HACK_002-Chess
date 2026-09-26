import { Chess, validateFen } from 'chess.js';
import { parseShapes } from './shapes';
import { type MoveTree, addMove, createTree, setShapes } from './tree';

/**
 * Imports a single PGN game *with* nested variations into a MoveTree (chess.js
 * `loadPgn` keeps only the main line). A bare FEN is accepted as a start position.
 * Drawn squares and arrows (`[%csl]`, `[%cal]`) are kept; other comments, NAGs and
 * annotation glyphs are dropped.
 */
export function importPgn(text: string): { tree: MoveTree } | { error: string } {
  const input = text.trim();
  if (validateFen(input).ok) return { tree: createTree(input) };

  const fenHeader = /\[FEN\s+"([^"]+)"\]/.exec(input)?.[1];
  if (fenHeader && !validateFen(fenHeader).ok) return { error: `Invalid FEN header: ${fenHeader}` };

  const movetext = input
    .replace(/^\s*\[[^\]]*\]\s*$/gm, ' ') // header tags
    .replace(/;[^\n]*/g, ' ') // line comments
    .replace(/\$\d+/g, ' '); // NAGs

  const tokens = movetext.match(/\{[^}]*\}|\(|\)|[^\s(){]+/g) ?? [];
  let tree = createTree(fenHeader);
  // Each stack frame: the node the next move is played from, and the node before it
  // (where a variation starting at this point branches off).
  const stack: { current: string; previous: string }[] = [];
  let current = tree.rootId;
  let previous = tree.rootId;

  for (const raw of tokens) {
    if (raw.startsWith('{')) {
      // A comment describes the position after the move before it.
      const shapes = parseShapes(raw);
      if (shapes.length) tree = setShapes(tree, current, shapes);
      continue;
    }
    if (raw === '(') {
      stack.push({ current, previous });
      current = previous;
      continue;
    }
    if (raw === ')') {
      const frame = stack.pop();
      if (!frame) return { error: 'Unbalanced ")" in PGN' };
      ({ current, previous } = frame);
      continue;
    }
    if (/^(1-0|0-1|1\/2-1\/2|\*)$/.test(raw)) continue;

    const san = raw.replace(/^\d+\.+/, '').replace(/[!?]+$/, '');
    if (!san) continue;

    const legal = new Chess(tree.nodes[current].fen)
      .moves({ verbose: true })
      .find((move) => move.san === san || move.san.replace(/[+#]$/, '') === san.replace(/[+#]$/, ''));
    if (!legal) return { error: `Illegal or unreadable move "${raw}"` };

    const result = addMove(tree, current, { from: legal.from, to: legal.to, promotion: legal.promotion });
    if (!result) return { error: `Illegal move "${raw}"` };
    tree = result.tree;
    previous = current;
    current = result.nodeId;
  }

  if (stack.length) return { error: 'Unclosed "(" in PGN' };
  return { tree };
}
