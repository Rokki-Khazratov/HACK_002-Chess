import { type MoveTree, pathTo } from './tree';
import openings from '../data/openings.json';

const byEpd = openings as unknown as Record<string, [eco: string, name: string]>;

export interface Opening {
  eco: string;
  name: string;
}

/**
 * The deepest named opening along the path to `nodeId`. Positions are matched by
 * EPD (board, side to move, castling, en passant), so transpositions resolve too.
 */
export function openingAt(tree: MoveTree, nodeId: string): Opening | null {
  const path = pathTo(tree, nodeId);
  for (let i = path.length - 1; i >= 0; i--) {
    const epd = tree.nodes[path[i]].fen.split(' ').slice(0, 4).join(' ');
    const hit = byEpd[epd];
    if (hit) return { eco: hit[0], name: hit[1] };
  }
  return null;
}
