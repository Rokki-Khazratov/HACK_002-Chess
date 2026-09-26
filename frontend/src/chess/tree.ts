import { Chess, type Move } from 'chess.js';

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
export const ROOT_ID = 'root';

/** One position in the analysis tree. `children[0]` is the main continuation. */
export interface MoveNode {
  id: string;
  parentId: string | null;
  children: string[];
  fen: string;
  /** Half-move index from the root position; the root itself is ply 0. */
  ply: number;
  san: string | null;
  uci: string | null;
  from: string | null;
  to: string | null;
}

export interface MoveTree {
  nodes: Record<string, MoveNode>;
  rootId: string;
}

export interface MoveInput {
  from: string;
  to: string;
  promotion?: string;
}

let nextId = 0;
const newId = () => `n${++nextId}`;

export function createTree(fen: string = START_FEN): MoveTree {
  return {
    rootId: ROOT_ID,
    nodes: {
      [ROOT_ID]: {
        id: ROOT_ID,
        parentId: null,
        children: [],
        fen,
        ply: 0,
        san: null,
        uci: null,
        from: null,
        to: null,
      },
    },
  };
}

/** Returns the legal move for `input` from `fen`, or null when it is illegal. */
export function tryMove(fen: string, input: MoveInput): Move | null {
  try {
    return new Chess(fen).move(input);
  } catch {
    return null;
  }
}

/**
 * Plays `input` from `parentId`. Reuses an existing child with the same move,
 * otherwise appends a new child (a variation when a continuation already exists).
 * Returns the new tree and the id of the resulting node, or null when illegal.
 */
export function addMove(
  tree: MoveTree,
  parentId: string,
  input: MoveInput,
): { tree: MoveTree; nodeId: string } | null {
  const parent = tree.nodes[parentId];
  const move = tryMove(parent.fen, input);
  if (!move) return null;

  const uci = move.from + move.to + (move.promotion ?? '');
  const existing = parent.children.find((id) => tree.nodes[id].uci === uci);
  if (existing) return { tree, nodeId: existing };

  const node: MoveNode = {
    id: newId(),
    parentId,
    children: [],
    fen: move.after,
    ply: parent.ply + 1,
    san: move.san,
    uci,
    from: move.from,
    to: move.to,
  };
  return {
    nodeId: node.id,
    tree: {
      ...tree,
      nodes: {
        ...tree.nodes,
        [parentId]: { ...parent, children: [...parent.children, node.id] },
        [node.id]: node,
      },
    },
  };
}

/** Node ids from the root to `nodeId`, inclusive. */
export function pathTo(tree: MoveTree, nodeId: string): string[] {
  const path: string[] = [];
  for (let id: string | null = nodeId; id; id = tree.nodes[id].parentId) path.push(id);
  return path.reverse();
}

/** Follows the first child from `nodeId` to the end of its line. */
export function lineEnd(tree: MoveTree, nodeId: string): string {
  let id = nodeId;
  while (tree.nodes[id].children.length) id = tree.nodes[id].children[0];
  return id;
}

/** Removes `nodeId` and its whole subtree. Returns the tree and the parent id. */
export function deleteNode(tree: MoveTree, nodeId: string): { tree: MoveTree; parentId: string } {
  const target = tree.nodes[nodeId];
  if (!target.parentId) return { tree, parentId: nodeId };

  const nodes = { ...tree.nodes };
  const stack = [nodeId];
  while (stack.length) {
    const id = stack.pop()!;
    stack.push(...nodes[id].children);
    delete nodes[id];
  }
  const parent = nodes[target.parentId];
  nodes[parent.id] = { ...parent, children: parent.children.filter((id) => id !== nodeId) };
  return { tree: { ...tree, nodes }, parentId: parent.id };
}

/** Makes `nodeId` the main continuation of its parent. */
export function promoteNode(tree: MoveTree, nodeId: string): MoveTree {
  const parentId = tree.nodes[nodeId].parentId;
  if (!parentId) return tree;
  const parent = tree.nodes[parentId];
  const children = [nodeId, ...parent.children.filter((id) => id !== nodeId)];
  return { ...tree, nodes: { ...tree.nodes, [parentId]: { ...parent, children } } };
}

/** "12." for white moves, "12..." for black moves, derived from the FEN before the move. */
export function moveNumberLabel(tree: MoveTree, node: MoveNode): string {
  const before = tree.nodes[node.parentId!].fen.split(' ');
  const fullMove = Number(before[5]);
  return before[1] === 'w' ? `${fullMove}.` : `${fullMove}...`;
}

export function isWhiteMove(tree: MoveTree, node: MoveNode): boolean {
  return tree.nodes[node.parentId!].fen.split(' ')[1] === 'w';
}

/** Exports the tree as PGN movetext with nested variations in parentheses. */
export function toPgn(tree: MoveTree): string {
  const root = tree.nodes[tree.rootId];
  const headers =
    root.fen === START_FEN ? '' : `[SetUp "1"]\n[FEN "${root.fen}"]\n\n`;

  const line = (startId: string, forceNumber: boolean): string => {
    const parts: string[] = [];
    let id: string | undefined = startId;
    let needNumber = forceNumber;
    while (id) {
      const node: MoveNode = tree.nodes[id];
      const white = isWhiteMove(tree, node);
      if (white || needNumber) parts.push(`${moveNumberLabel(tree, node)} ${node.san}`);
      else parts.push(node.san!);
      needNumber = false;

      const parent = tree.nodes[node.parentId!];
      if (parent.children[0] === id) {
        for (const alt of parent.children.slice(1)) {
          parts.push(`(${line(alt, true)})`);
          needNumber = true;
        }
      }
      id = node.children[0];
    }
    return parts.join(' ');
  };

  const first = root.children[0];
  return headers + (first ? `${line(first, true)} *` : '*');
}
