import { describe, expect, it } from 'vitest';
import {
  addMove,
  createTree,
  deleteNode,
  forkAbove,
  lineEnd,
  nextFork,
  pathTo,
  promoteNode,
  renameNode,
  switchLine,
  toPgn,
} from './tree';
import { compactTreeLanes, layoutTree } from './layout';
import { MOCK_PGN } from '../dev/mockGame';
import { importPgn } from './pgn';
import { openingAt } from './openings';
import { formatScore, parseInfo, uciToSan } from '../engine/stockfish';

const play = (moves: string[]) => {
  let tree = createTree();
  let id = tree.rootId;
  for (const uci of moves) {
    const result = addMove(tree, id, { from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    if (!result) throw new Error(`illegal ${uci}`);
    ({ tree } = result);
    id = result.nodeId;
  }
  return { tree, id };
};

describe('move tree', () => {
  it('rejects illegal moves and reuses identical moves', () => {
    const { tree } = play(['e2e4']);
    expect(addMove(tree, tree.rootId, { from: 'e2', to: 'e5' })).toBeNull();
    const again = addMove(tree, tree.rootId, { from: 'e2', to: 'e4' })!;
    expect(again.tree).toBe(tree);
    expect(tree.nodes[tree.rootId].children).toHaveLength(1);
  });

  it('adds a side line when a continuation exists, and exports it as PGN', () => {
    const main = play(['e2e4', 'e7e5', 'g1f3']);
    const e4 = main.tree.nodes[main.tree.rootId].children[0];
    const side = addMove(main.tree, e4, { from: 'c7', to: 'c5' })!;
    expect(side.tree.nodes[e4].children).toHaveLength(2);
    expect(toPgn(side.tree)).toBe('1. e4 e5 (1... c5) 2. Nf3 *');
  });

  it('promotes and deletes variations', () => {
    const main = play(['e2e4', 'e7e5']);
    const e4 = main.tree.nodes[main.tree.rootId].children[0];
    const side = addMove(main.tree, e4, { from: 'c7', to: 'c5' })!;
    const promoted = promoteNode(side.tree, side.nodeId);
    expect(toPgn(promoted)).toBe('1. e4 c5 (1... e5) *');
    const { tree, parentId } = deleteNode(promoted, side.nodeId);
    expect(parentId).toBe(e4);
    expect(toPgn(tree)).toBe('1. e4 e5 *');
    expect(tree.nodes[side.nodeId]).toBeUndefined();
  });

  it('walks paths and line ends', () => {
    const { tree, id } = play(['d2d4', 'd7d5', 'c2c4']);
    expect(pathTo(tree, id)).toHaveLength(4);
    expect(lineEnd(tree, tree.rootId)).toBe(id);
  });

  it('handles promotion moves', () => {
    const tree = createTree('8/P7/8/8/8/8/8/k6K w - - 0 1');
    const result = addMove(tree, tree.rootId, { from: 'a7', to: 'a8', promotion: 'n' })!;
    expect(result.tree.nodes[result.nodeId].san).toBe('a8=N');
    expect(addMove(tree, tree.rootId, { from: 'a7', to: 'a8' })).toBeNull();
  });
});

describe('branch navigation and layout', () => {
  // 1. e4 e5 (1... c5 2. Nf3 (2. c3) d6) (1... e6 2. d4) 2. Nf3 Nc6
  const build = () => {
    const result = importPgn('1. e4 e5 (1... c5 2. Nf3 (2. c3) 2... d6) (1... e6 2. d4) 2. Nf3 Nc6 *');
    if ('error' in result) throw new Error(result.error);
    return result.tree;
  };
  const find = (tree: ReturnType<typeof build>, sanPath: string[]) => {
    let id = tree.rootId;
    for (const san of sanPath) id = tree.nodes[id].children.find((c) => tree.nodes[c].san === san)!;
    return id;
  };

  it('finds forks above and below', () => {
    const tree = build();
    const nf3 = find(tree, ['e4', 'e5', 'Nf3']);
    const e4 = find(tree, ['e4']);
    expect(forkAbove(tree, nf3)).toEqual({ forkId: e4, childId: find(tree, ['e4', 'e5']) });
    expect(nextFork(tree, tree.rootId)).toBe(e4);
    expect(nextFork(tree, nf3)).toBeNull();
    expect(forkAbove(tree, e4)).toBeNull();
  });

  it('switches to the neighbouring line keeping depth below the fork', () => {
    const tree = build();
    const nf3 = find(tree, ['e4', 'e5', 'Nf3']);
    expect(switchLine(tree, nf3, 1)).toBe(find(tree, ['e4', 'c5', 'Nf3']));
    expect(switchLine(tree, nf3, -1)).toBe(find(tree, ['e4', 'e6', 'd4']));
    const c3 = find(tree, ['e4', 'c5', 'c3']);
    expect(switchLine(tree, c3, 1)).toBe(find(tree, ['e4', 'c5', 'Nf3']));
    const e4 = find(tree, ['e4']);
    expect(switchLine(tree, e4, 1)).toBe(find(tree, ['e4', 'c5']));
    expect(switchLine(tree, e4, -1)).toBe(find(tree, ['e4', 'e6']));
  });

  it('lays out lines depth-first with the main line on lane 0', () => {
    const tree = build();
    const layout = layoutTree(tree);
    expect(layout.lanes[find(tree, ['e4', 'e5', 'Nf3', 'Nc6'])]).toBe(0);
    expect(layout.lanes[find(tree, ['e4', 'c5', 'Nf3', 'd6'])]).toBe(1);
    expect(layout.lanes[find(tree, ['e4', 'c5', 'c3'])]).toBe(2);
    expect(layout.lanes[find(tree, ['e4', 'e6', 'd4'])]).toBe(3);
    expect(layout.lines.map((l) => l.label)).toEqual(['Main line', 'Line A', 'Line C', 'Line B']);
    expect(layout.maxPly).toBe(4);
    const named = layoutTree(renameNode(tree, find(tree, ['e4', 'e6']), 'French try'));
    expect(named.lines[3].label).toBe('French try');
  });

  it('reuses a graph row for variations at separate moves', () => {
    const result = importPgn('1. e4 e5 (1... c5) 2. Nf3 Nc6 3. Bb5 a6 (3... Nf6) *');
    if ('error' in result) throw new Error(result.error);
    const tree = result.tree;
    const compact = compactTreeLanes(tree, layoutTree(tree));
    const early = tree.nodes[find(tree, ['e4'])].children.find((id) => tree.nodes[id].san === 'c5')!;
    const late = tree.nodes[find(tree, ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5'])].children.find((id) => tree.nodes[id].san === 'Nf6')!;
    expect(compact.lanes[early]).toBe(1);
    expect(compact.lanes[late]).toBe(1);
    expect(compact.maxLane).toBe(1);
  });
});

describe('PGN import', () => {
  it('keeps nested variations that chess.js loadPgn would drop', () => {
    const pgn = '[Event "Test"]\n\n1. e4 e5 (1... c5 2. Nf3 (2. c3 d5) 2... d6) 2. Nf3 {main} Nc6 $1 3. Bb5 a6!? *';
    const result = importPgn(pgn);
    if ('error' in result) throw new Error(result.error);
    expect(toPgn(result.tree)).toBe('1. e4 e5 (1... c5 2. Nf3 (2. c3 d5) 2... d6) 2. Nf3 Nc6 3. Bb5 a6 *');
  });

  it('loads the 136-move study with its nested variations', () => {
    const result = importPgn(MOCK_PGN);
    if ('error' in result) throw new Error(result.error);
    const layout = layoutTree(result.tree);
    expect(layout.lines.length).toBe(57);
    expect(Object.keys(result.tree.nodes).length).toBe(575);
    expect(compactTreeLanes(result.tree, layout).maxLane).toBeLessThan(20);
    expect(result.tree.nodes[lineEnd(result.tree, result.tree.rootId)].ply).toBe(271);
    const roundtrip = importPgn(toPgn(result.tree));
    if ('error' in roundtrip) throw new Error(roundtrip.error);
    expect(Object.keys(roundtrip.tree.nodes).length).toBe(Object.keys(result.tree.nodes).length);
  });

  it('accepts a FEN and FEN header, and reports errors', () => {
    const fen = 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3';
    const bare = importPgn(fen);
    expect('tree' in bare && bare.tree.nodes[bare.tree.rootId].fen).toBe(fen);
    const withHeader = importPgn(`[SetUp "1"]\n[FEN "${fen}"]\n\n3. Bb5 a6 *`);
    if ('error' in withHeader) throw new Error(withHeader.error);
    expect(toPgn(withHeader.tree)).toBe(`[SetUp "1"]\n[FEN "${fen}"]\n\n3. Bb5 a6 *`);
    expect(importPgn('1. e4 e4')).toEqual({ error: 'Illegal or unreadable move "e4"' });
    expect(importPgn('1. e4 (1. d4')).toEqual({ error: 'Unclosed "(" in PGN' });
  });
});

describe('openings', () => {
  it('names the deepest known position, including transpositions', () => {
    const { tree, id } = play(['e2e4', 'c7c5', 'g1f3', 'd7d6', 'd2d4', 'c5d4', 'f3d4', 'g8f6', 'b1c3', 'a7a6']);
    expect(openingAt(tree, id)).toEqual({ eco: 'B90', name: 'Sicilian Defense: Najdorf Variation' });
    expect(openingAt(tree, tree.rootId)).toBeNull();
  });
});

describe('engine parsing', () => {
  it('converts side-to-move scores to White perspective and PVs to SAN', () => {
    const blackToMove = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
    const line = parseInfo('info depth 12 seldepth 19 multipv 2 score cp 33 nodes 1 nps 1 time 1 pv c7c5 g1f3', blackToMove)!;
    expect(line).toMatchObject({ multipv: 2, depth: 12, score: { kind: 'cp', value: -33 }, san: ['c5', 'Nf3'] });
    const mate = parseInfo('info depth 6 multipv 1 score mate -4 pv e7e5', blackToMove)!;
    expect(mate.score).toEqual({ kind: 'mate', value: 4 });
    expect(parseInfo('info depth 6 score cp 10 lowerbound pv e7e5', blackToMove)).toBeNull();
    expect(formatScore({ kind: 'cp', value: 27 })).toBe('+0.27');
    expect(formatScore({ kind: 'mate', value: -3 })).toBe('-M3');
    expect(uciToSan(blackToMove, ['e7e5', 'zzzz', 'g1f3'])).toEqual(['e5']);
  });
});
