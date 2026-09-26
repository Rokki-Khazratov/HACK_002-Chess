import { describe, expect, it } from 'vitest';
import { addMove, createTree } from './tree';
import { classifyMove, type PositionReview } from './moveQuality';

const review = (cp: number, bestUci: string, depth = 22, pv = [bestUci]): PositionReview =>
  ({ score: { kind: 'cp', value: cp }, depth, bestUci, pv });

describe('move quality', () => {
  it('waits for evaluations of both positions', () => {
    const tree = createTree();
    const played = addMove(tree, tree.rootId, { from: 'e2', to: 'e4' })!;
    expect(classifyMove(played.tree, played.nodeId, {})).toBeNull();
    expect(classifyMove(played.tree, played.nodeId, {
      [tree.nodes[tree.rootId].fen]: review(0, 'e2e4'),
      [played.tree.nodes[played.nodeId].fen]: review(0, 'e7e5', 10),
    })).toBeNull();
  });

  it('marks a large loss and preserves the engine best move', () => {
    const tree = createTree();
    const e4 = addMove(tree, tree.rootId, { from: 'e2', to: 'e4' })!;
    const d4 = addMove(e4.tree, e4.tree.rootId, { from: 'd2', to: 'd4' })!;
    const reviews = {
      [tree.nodes[tree.rootId].fen]: review(0, 'e2e4'),
      [d4.tree.nodes[e4.nodeId].fen]: review(0, 'e7e5'),
      [d4.tree.nodes[d4.nodeId].fen]: review(-300, 'e7e5'),
    };
    expect(classifyMove(d4.tree, e4.nodeId, reviews)).toBe('best');
    expect(classifyMove(d4.tree, d4.nodeId, reviews)).toBe('blunder');
  });

  it('requires a deep, accepted piece sacrifice for Brilliant', () => {
    const tree = createTree('4k2r/7p/8/8/8/3B4/8/4K3 w - - 0 1');
    const played = addMove(tree, tree.rootId, { from: 'd3', to: 'h7' })!;
    const parentFen = tree.nodes[tree.rootId].fen;
    const childFen = played.tree.nodes[played.nodeId].fen;
    expect(classifyMove(played.tree, played.nodeId, {
      [parentFen]: review(0, 'd3h7'),
      [childFen]: review(0, 'h8h7', 22, ['h8h7']),
    })).toBe('brilliant');
    expect(classifyMove(played.tree, played.nodeId, {
      [parentFen]: review(0, 'd3h7', 18),
      [childFen]: review(0, 'h8h7', 18, ['h8h7']),
    })).toBe('best');
  });
});
