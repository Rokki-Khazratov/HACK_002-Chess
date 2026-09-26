import { Chess } from 'chess.js';
import type { Score } from '../engine/stockfish';
import { whiteShare } from '../engine/stockfish';
import type { MoveTree } from './tree';

export type MoveQuality = 'brilliant' | 'best' | 'excellent' | 'good' | 'inaccuracy' | 'mistake' | 'blunder';

export interface PositionReview {
  score: Score;
  depth: number;
  bestUci: string;
  pv: string[];
}

const pieceValue: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

function material(fen: string, color: 'w' | 'b'): number {
  const board = new Chess(fen).board();
  return board.flat().reduce((sum, piece) => sum + (piece?.color === color ? pieceValue[piece.type] : 0), 0);
}

/** A deliberately strict local test for a sound, accepted piece sacrifice. */
function isSoundPieceSacrifice(tree: MoveTree, nodeId: string, parent: PositionReview, after: PositionReview): boolean {
  const node = tree.nodes[nodeId];
  const before = tree.nodes[node.parentId!];
  const side = before.fen.split(' ')[1] as 'w' | 'b';
  const beforeChance = side === 'w' ? whiteShare(parent.score) : 1 - whiteShare(parent.score);
  const afterChance = side === 'w' ? whiteShare(after.score) : 1 - whiteShare(after.score);
  if (parent.depth < 22 || after.depth < 22 || beforeChance >= 0.85 || afterChance < 0.38) return false;

  const chess = new Chess(node.fen);
  const response = after.pv[0];
  if (!response || !node.to || response.slice(2, 4) !== node.to) return false;
  const offered = chess.get(node.to as Parameters<Chess['get']>[0]);
  if (!offered || offered.color !== side || pieceValue[offered.type] < 3) return false;
  try {
    const capture = chess.move({ from: response.slice(0, 2), to: response.slice(2, 4), promotion: response[4] });
    if (!capture.captured) return false;
  } catch { return false; }

  const initialNet = material(before.fen, side) - material(before.fen, side === 'w' ? 'b' : 'w');
  const capturedNet = material(chess.fen(), side) - material(chess.fen(), side === 'w' ? 'b' : 'w');
  if (capturedNet > initialNet - 2) return false;
  // A forced immediate recovery is a tactic, not an enduring piece sacrifice.
  for (const uci of after.pv.slice(1, 5)) {
    try { chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }); }
    catch { break; }
  }
  const laterNet = material(chess.fen(), side) - material(chess.fen(), side === 'w' ? 'b' : 'w');
  return laterNet <= initialNet - 2;
}

/** Classify only when both sides of the move have actual Stockfish evaluations. */
export function classifyMove(tree: MoveTree, nodeId: string, reviews: Record<string, PositionReview>): MoveQuality | null {
  const node = tree.nodes[nodeId];
  if (!node?.parentId || !node.uci) return null;
  const before = tree.nodes[node.parentId];
  const parent = reviews[before.fen];
  const after = reviews[node.fen];
  if (!parent || !after || parent.depth < 16 || after.depth < 16) return null;
  const white = before.fen.split(' ')[1] === 'w';
  const bestChance = white ? whiteShare(parent.score) : 1 - whiteShare(parent.score);
  const playedChance = white ? whiteShare(after.score) : 1 - whiteShare(after.score);
  const loss = Math.max(0, bestChance - playedChance);
  if (loss < 0.02 && isSoundPieceSacrifice(tree, nodeId, parent, after)) return 'brilliant';
  if (node.uci === parent.bestUci) return 'best';
  if (loss < 0.02) return 'excellent';
  if (loss < 0.05) return 'good';
  if (loss < 0.10) return 'inaccuracy';
  if (loss < 0.20) return 'mistake';
  return 'blunder';
}
