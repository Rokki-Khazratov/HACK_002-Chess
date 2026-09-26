import { type PointerEvent, type WheelEvent, useEffect, useMemo, useRef, useState } from 'react';
import { type TreeLayout, lineColor } from '../chess/layout';
import { figurine } from '../chess/notation';
import { type MoveTree, lineEnd, pathTo } from '../chess/tree';

interface Props {
  tree: MoveTree;
  layout: TreeLayout;
  currentId: string;
  onSelect: (nodeId: string) => void;
  onContextMenu: (nodeId: string, x: number, y: number) => void;
}

const COL = 60;
const ROW = 44;
const PAD_X = 36;
const PAD_Y = 50;
/** Radius of the elbow where a side line turns onto its lane. */
const BEND = 20;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 2.5;

const nodeX = (ply: number) => PAD_X + ply * COL;
const nodeY = (lane: number) => PAD_Y + lane * ROW;

/**
 * Git-graph connector: a continuation runs straight along its lane; a side line
 * drops straight down from the fork and turns onto its lane with a rounded elbow.
 */
function branchPath(x1: number, y1: number, x2: number, y2: number): string {
  if (y1 === y2) return `M ${x1} ${y1} H ${x2}`;
  const dir = y2 > y1 ? 1 : -1;
  const r = Math.min(BEND, Math.abs(y2 - y1), x2 - x1);
  return `M ${x1} ${y1} V ${y2 - dir * r} Q ${x1} ${y2} ${x1 + r} ${y2} H ${x2}`;
}

/**
 * Pannable, zoomable graph of the move tree drawn like a git graph: columns are
 * plies, rows are lines, every move is a commit dot on its line.
 * Drag to pan, wheel to zoom around the cursor, click a node to jump there.
 */
export function TreeView({ tree, layout, currentId, onSelect, onContextMenu }: Props) {
  const viewport = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const [size, setSize] = useState({ w: 400, h: 300 });
  const drag = useRef<{ x: number; y: number; vx: number; vy: number; moved: boolean } | null>(null);

  const activePath = useMemo(() => new Set(pathTo(tree, currentId)), [tree, currentId]);
  const nodes = Object.values(tree.nodes);
  const lanesCount = layout.lines.length;
  // Room on the right for the branch name at the longest tip.
  const contentW = nodeX(layout.maxPly) + PAD_X + 60;
  const contentH = nodeY(lanesCount - 1) + PAD_Y;

  useEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) =>
      setSize({ w: entry.contentRect.width, h: entry.contentRect.height }),
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Keep the current node in view: pan only when it drifts outside a margin.
  const current = tree.nodes[currentId];
  const cx = nodeX(current.ply);
  const cy = nodeY(layout.lanes[currentId] ?? 0);
  // Adjusted during render (not in an effect) whenever the target or viewport changes.
  const followKey = `${cx}:${cy}:${size.w}:${size.h}`;
  const [followed, setFollowed] = useState('');
  if (followed !== followKey) {
    setFollowed(followKey);
    const sx = cx * view.k + view.x;
    const sy = cy * view.k + view.y;
    const margin = 60;
    const visible = sx > margin && sx < size.w - margin && sy > margin / 2 && sy < size.h - margin / 2;
    if (!visible) setView({ ...view, x: size.w / 2 - cx * view.k, y: size.h / 2 - cy * view.k });
  }

  const zoomAt = (factor: number, px: number, py: number) =>
    setView((v) => {
      const k = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.k * factor));
      return { k, x: px - ((px - v.x) * k) / v.k, y: py - ((py - v.y) * k) / v.k };
    });

  const onWheel = (event: WheelEvent) => {
    const rect = viewport.current!.getBoundingClientRect();
    zoomAt(Math.exp(-event.deltaY * 0.0015), event.clientX - rect.left, event.clientY - rect.top);
  };

  const onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0) return;
    drag.current = { x: event.clientX, y: event.clientY, vx: view.x, vy: view.y, moved: false };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = event.clientX - d.x;
    const dy = event.clientY - d.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
    if (d.moved) setView((v) => ({ ...v, x: d.vx + dx, y: d.vy + dy }));
  };
  const onPointerUp = (event: PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (d && !d.moved) {
      // A click, not a pan: find the node under the pointer.
      const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-node]');
      const id = target?.getAttribute('data-node');
      if (id) onSelect(id);
    }
  };

  const fit = () => {
    const k = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.min(size.w / contentW, size.h / contentH)));
    setView({ k, x: (size.w - contentW * k) / 2, y: Math.max(0, (size.h - contentH * k) / 2) });
  };
  const center = () => setView((v) => ({ ...v, x: size.w / 2 - cx * v.k, y: size.h / 2 - cy * v.k }));

  // Full-move numbers along the top.
  const ticks: number[] = [];
  const rootFen = tree.nodes[tree.rootId].fen.split(' ');
  const firstWhitePly = rootFen[1] === 'w' ? 1 : 2;
  for (let ply = firstWhitePly; ply <= layout.maxPly; ply += 2) ticks.push(ply);
  const moveNo = (ply: number) => Number(rootFen[5]) + Math.floor((ply - firstWhitePly) / 2);

  return (
    <div className="tree-view">
      <div
        ref={viewport}
        className="tree-viewport"
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => (drag.current = null)}
        onContextMenu={(event) => {
          const id = (event.target as Element).closest('[data-node]')?.getAttribute('data-node');
          if (!id || id === tree.rootId) return;
          event.preventDefault();
          onContextMenu(id, event.clientX, event.clientY);
        }}
      >
        <svg width="100%" height="100%" role="tree" aria-label="Move tree graph">
          <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
            {ticks.map((ply) => (
              <text key={ply} x={nodeX(ply)} y={18} className="tree-tick" textAnchor="middle">
                {moveNo(ply)}
              </text>
            ))}

            {/* Inactive lines first so the path to the current move draws on top. */}
            {[false, true].map((onPath) =>
              nodes.map((node) => {
                if (!node.parentId || activePath.has(node.id) !== onPath) return null;
                const parent = tree.nodes[node.parentId];
                return (
                  <path
                    key={`e-${node.id}`}
                    d={branchPath(nodeX(parent.ply), nodeY(layout.lanes[parent.id]), nodeX(node.ply), nodeY(layout.lanes[node.id]))}
                    className={`tree-edge${onPath ? ' tree-edge-active' : ''}`}
                    style={{ stroke: lineColor(layout, node.id) }}
                  />
                );
              }),
            )}

            {/* Branch name at the tip of each side line, like a git ref. */}
            {layout.lines.slice(1).map((line) => {
              const tip = tree.nodes[lineEnd(tree, line.startId)];
              return (
                <text
                  key={`l-${line.lane}`}
                  x={nodeX(tip.ply) + 12}
                  y={nodeY(line.lane) + 3.5}
                  className="tree-line-label"
                  style={{ fill: line.color }}
                >
                  {line.label}
                </text>
              );
            })}

            {nodes.map((node) => {
              const x = nodeX(node.ply);
              const y = nodeY(layout.lanes[node.id]);
              const isCurrent = node.id === currentId;
              const isFork = node.children.length > 1;
              const active = activePath.has(node.id);
              const [piece, rest] = node.san ? figurine(node.san) : ['', ''];
              return (
                <g
                  key={node.id}
                  data-node={node.id}
                  className={`tree-node${active ? ' tree-node-active' : ''}${isCurrent ? ' tree-node-current' : ''}${isFork ? ' tree-node-fork' : ''}`}
                  style={{ ['--line-color' as string]: lineColor(layout, node.id) }}
                >
                  <title>{node.san ? `${node.san}${node.name ? ` — ${node.name}` : ''}` : 'Start'}</title>
                  <circle cx={x} cy={y} r={16} className="tree-hit" />
                  <circle cx={x} cy={y} r={isCurrent ? 7.5 : isFork ? 5.5 : 4.5} className="tree-dot" />
                  {node.san && (
                    <text x={x} y={y - 12} textAnchor="middle" className="tree-san">
                      {piece}
                      {rest}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        </svg>
      </div>
      <div className="tree-controls">
        <button type="button" onClick={() => zoomAt(1.25, size.w / 2, size.h / 2)} title="Zoom in">+</button>
        <button type="button" onClick={() => zoomAt(0.8, size.w / 2, size.h / 2)} title="Zoom out">−</button>
        <button type="button" onClick={fit} title="Fit whole tree">Fit</button>
        <button type="button" onClick={center} title="Center on current move">◎</button>
      </div>
    </div>
  );
}
