import type { MoveTree } from './tree';

/** Lane colours for side lines; lane 0 (the main line) uses the neutral text colour. */
export const LINE_COLORS = ['#a78bfa', '#2dd4bf', '#fbbf24', '#f472b6', '#60a5fa', '#fb923c', '#a3e635'];

export interface LineInfo {
  /** Row in the tree graph. 0 is the main line. */
  lane: number;
  /** Node where this line starts (a child of the fork), or the root for the main line. */
  startId: string;
  label: string;
  color: string;
}

export interface TreeLayout {
  /** nodeId → lane index. Ply gives the column. */
  lanes: Record<string, number>;
  /** One entry per lane, indexed by lane. */
  lines: LineInfo[];
  maxPly: number;
}

function laneLabel(lane: number): string {
  if (lane === 0) return 'Main line';
  let n = lane;
  let label = '';
  while (n > 0) {
    n -= 1;
    label = String.fromCharCode(65 + (n % 26)) + label;
    n = Math.floor(n / 26);
  }
  return `Line ${label}`;
}

function colorFor(order: number): string {
  return order === 0 ? 'var(--color-text-secondary)' : LINE_COLORS[(order - 1) % LINE_COLORS.length];
}

/** Colour of the line a node belongs to. */
export function lineColor(layout: TreeLayout, nodeId: string): string {
  return layout.lines[layout.lanes[nodeId]]?.color ?? colorFor(0);
}

/**
 * Assigns every node a lane: a continuation (`children[0]`) stays in its parent's
 * lane and each side line opens the next free lane. Depth-first, main line first,
 * so a side line's connector never crosses a lane that is already occupied at
 * that column.
 */
export function layoutTree(tree: MoveTree): TreeLayout {
  const lanes: Record<string, number> = {};
  const lines: LineInfo[] = [];
  let nextLane = 0;
  let maxPly = 0;

  const openLine = (startId: string) => {
    const lane = nextLane++;
    lines.push({ lane, startId, label: '', color: '' });
    return lane;
  };

  // Iterative DFS (safe on very long games). A side line is pushed with lane
  // null and gets its lane only when popped, i.e. after the whole continuation
  // subtree above it on the stack has been laid out.
  const stack: { id: string; lane: number | null }[] = [{ id: tree.rootId, lane: null }];
  while (stack.length) {
    const item = stack.pop()!;
    const lane = item.lane ?? openLine(item.id);
    lanes[item.id] = lane;
    const node = tree.nodes[item.id];
    maxPly = Math.max(maxPly, node.ply);
    for (let i = node.children.length - 1; i >= 1; i--) stack.push({ id: node.children[i], lane: null });
    if (node.children.length) stack.push({ id: node.children[0], lane });
  }

  // Lanes follow depth-first order (for a clean graph); letters and colours
  // follow reading order: earlier forks first, then sibling order.
  const reading = [...lines].sort((a, b) => {
    const pa = tree.nodes[a.startId].ply;
    const pb = tree.nodes[b.startId].ply;
    if (a.lane === 0 || b.lane === 0) return a.lane - b.lane;
    if (pa !== pb) return pa - pb;
    const pathA = tree.nodes[a.startId].parentId!;
    const pathB = tree.nodes[b.startId].parentId!;
    if (pathA === pathB) {
      const siblings = tree.nodes[pathA].children;
      return siblings.indexOf(a.startId) - siblings.indexOf(b.startId);
    }
    return a.lane - b.lane;
  });
  reading.forEach((line, order) => {
    line.label = tree.nodes[line.startId].name ?? laneLabel(order);
    line.color = colorFor(order);
  });
  return { lanes, lines, maxPly };
}
