import { Chess } from 'chess.js';
import { addMove, type MoveTree } from './tree';
import type { CoachEngineLine, CoachTurn } from '../ai/types';

/** Validate the saved path and variation before inserting either into the tree. */
export function applyChatLine(tree: MoveTree, turn: CoachTurn, line: CoachEngineLine): { tree: MoveTree; nodeId: string; nodeIds: string[] } | { error: string } {
  const anchor = turn.context.board;
  if (!anchor || !line.uci.length || !turn.engineLines?.some((item) => item.id === line.id && item.notation === line.notation && item.uci.join(' ') === line.uci.join(' '))) {
    return { error: 'This response has no saved engine variation.' };
  }
  try {
    const normalize = (fen: string) => new Chess(fen).fen();
    if (normalize(tree.nodes[tree.rootId].fen) !== normalize(anchor.rootFen) || normalize(anchor.fen) !== normalize(line.fen)) {
      return { error: 'Open the original board for this response before adding its variation.' };
    }
    const pathReplay = new Chess(anchor.rootFen);
    for (const uci of anchor.line) {
      if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) throw new Error('Invalid UCI');
      pathReplay.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    }
    if (normalize(pathReplay.fen()) !== normalize(line.fen)) return { error: 'The saved engine position does not match this tree.' };
    const replay = new Chess(line.fen);
    for (const uci of line.uci) {
      if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) throw new Error('Invalid UCI');
      replay.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    }
    let nextTree = tree;
    let parentId = tree.rootId;
    for (const uci of anchor.line) {
      const restored = addMove(nextTree, parentId, { from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
      if (!restored) return { error: 'Could not restore the original position. No moves were added.' };
      nextTree = restored.tree;
      parentId = restored.nodeId;
    }
    let nodeId = parentId;
    const nodeIds: string[] = [];
    let firstCreated = true;
    const source = { turnId: turn.id, lineId: line.id, depth: line.depth, anchorFen: line.fen };
    for (const [index, uci] of line.uci.entries()) {
      const result = addMove(nextTree, nodeId, { from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
      if (!result) return { error: 'Could not apply the complete engine line. No moves were added.' };
      const created = !nextTree.nodes[result.nodeId];
      nextTree = result.tree; nodeId = result.nodeId;
      nodeIds.push(nodeId);
      const node = nextTree.nodes[nodeId];
      const sources = node.chatSources ?? [];
      if (created || index === 0 || index === line.uci.length - 1) {
        nextTree = { ...nextTree, nodes: { ...nextTree.nodes, [nodeId]: { ...node,
          ...(created && firstCreated ? { name: `Chat · Stockfish ${line.rank}` } : {}),
          chatSources: sources.some((item) => item.turnId === turn.id && item.lineId === line.id) ? sources : [...sources, source],
        } } };
      }
      if (created) firstCreated = false;
    }
    return { tree: nextTree, nodeId, nodeIds };
  } catch { return { error: 'This variation failed the legal-move check. No moves were added.' }; }
}
