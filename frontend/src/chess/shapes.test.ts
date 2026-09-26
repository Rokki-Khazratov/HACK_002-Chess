import { describe, expect, it } from 'vitest';
import { formatShapes, parseShapes, shapeColor, toggleShape } from './shapes';
import { addMove, createTree, setShapes, toPgn } from './tree';
import { importPgn } from './pgn';

const none = { shiftKey: false, ctrlKey: false, altKey: false, metaKey: false };

describe('drawn shapes', () => {
  it('picks chess.com colours from the modifier keys', () => {
    expect(shapeColor(true, none)).toBe('Y');
    expect(shapeColor(false, none)).toBe('R');
    expect(shapeColor(true, { ...none, shiftKey: true })).toBe('G');
    expect(shapeColor(false, { ...none, metaKey: true })).toBe('B');
    expect(shapeColor(true, { ...none, altKey: true })).toBe('R');
  });

  it('toggles a mark off when drawn again and recolours it in another colour', () => {
    const one = toggleShape([], { from: 'e2', to: 'e4', color: 'Y' });
    expect(toggleShape(one, { from: 'e2', to: 'e4', color: 'Y' })).toEqual([]);
    expect(toggleShape(one, { from: 'e2', to: 'e4', color: 'G' })).toEqual([{ from: 'e2', to: 'e4', color: 'G' }]);
    // A square mark and an arrow from the same square are different marks.
    expect(toggleShape(one, { from: 'e2', color: 'R' })).toHaveLength(2);
  });

  it('writes and reads the PGN commands', () => {
    const shapes = [
      { from: 'c4', color: 'R' as const },
      { from: 'f2', to: 'f4', color: 'Y' as const },
      { from: 'b5', to: 'b7', color: 'B' as const },
    ];
    expect(formatShapes(shapes)).toBe('[%csl Rc4][%cal Yf2f4,Bb5b7]');
    expect(parseShapes('{ good move [%csl Rc4] [%cal Yf2f4,Bb5b7,Xa1a2] }')).toEqual(shapes);
  });

  it('round-trips marks through PGN export and import', () => {
    let tree = createTree();
    const e4 = addMove(tree, tree.rootId, { from: 'e2', to: 'e4' })!;
    const c5 = addMove(e4.tree, e4.nodeId, { from: 'c7', to: 'c5' })!;
    tree = setShapes(c5.tree, e4.nodeId, [{ from: 'g1', to: 'f3', color: 'G' }]);
    tree = setShapes(tree, tree.rootId, [{ from: 'd4', color: 'R' }]);

    const pgn = toPgn(tree);
    expect(pgn).toBe('{[%csl Rd4]} 1. e4 {[%cal Gg1f3]} 1... c5 *');

    const back = importPgn(pgn);
    if ('error' in back) throw new Error(back.error);
    const root = back.tree.nodes[back.tree.rootId];
    const first = back.tree.nodes[root.children[0]];
    expect(root.shapes).toEqual([{ from: 'd4', color: 'R' }]);
    expect(first.shapes).toEqual([{ from: 'g1', to: 'f3', color: 'G' }]);
    expect(back.tree.nodes[first.children[0]].shapes).toBeUndefined();
  });

  it('clears the field when the last mark is removed', () => {
    const tree = setShapes(createTree(), 'root', []);
    expect(tree.nodes.root.shapes).toBeUndefined();
  });
});
