import { type PointerEvent, type WheelEvent, useEffect, useMemo, useRef, useState } from 'react';
import { type TreeLayout, compactTreeLanes, lineColor } from '../chess/layout';
import { figurine } from '../chess/notation';
import { type MoveTree, pathTo } from '../chess/tree';
import type { MoveQuality } from '../chess/moveQuality';

interface Props {
  tree: MoveTree;
  layout: TreeLayout;
  currentId: string;
  qualities?: Record<string, MoveQuality>;
  onSelect: (nodeId: string) => void;
  onContextMenu: (nodeId: string, x: number, y: number) => void;
}

const COL = 64;
const ROW = 46;
const PAD_X = 36;
const PAD_Y = 44;
const NODE_W = 50;
const NODE_H = 24;
const MIN_ZOOM = 0.45;
const MAX_ZOOM = 2.5;

const nodeX = (ply: number) => PAD_X + ply * COL;
const nodeY = (lane: number) => PAD_Y + lane * ROW;

/**
 * Pannable, zoomable graph of the move tree: columns are plies, rows are lines.
 * Drag to pan, wheel to zoom around the cursor, click a node to jump there.
 */
export function TreeView({ tree, layout, currentId, qualities = {}, onSelect, onContextMenu }: Props) {
  const viewport = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const [size, setSize] = useState({ w: 400, h: 300 });
  const drag = useRef<{ x: number; y: number; vx: number; vy: number; moved: boolean } | null>(null);

  const activePath = useMemo(() => new Set(pathTo(tree, currentId)), [tree, currentId]);
  const compact = useMemo(() => compactTreeLanes(tree, layout), [tree, layout]);
  const nodes = Object.values(tree.nodes);
  const contentH = nodeY(compact.maxLane) + NODE_H + PAD_Y;

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
  const cy = nodeY(compact.lanes[currentId] ?? 0);
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

  const focus = () => {
    // Keep about ten plies legible instead of shrinking 136 moves to a strip.
    const k = Math.min(1, Math.max(0.65, size.w / (10 * COL)));
    setView({ k, x: size.w / 2 - (cx + 2 * COL) * k, y: Math.max(16, (size.h - contentH * k) / 2) });
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
          <defs>
            <pattern id="tree-dots" width="16" height="16" patternUnits="userSpaceOnUse"
              patternTransform={`translate(${view.x % (16 * view.k)} ${view.y % (16 * view.k)}) scale(${view.k})`}>
              <circle cx="1" cy="1" r="0.9" className="tree-dot" />
            </pattern>
            <filter id="tree-glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <rect width="100%" height="100%" fill="url(#tree-dots)" />
          <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
            {ticks.map((ply) => (
              <text key={ply} x={nodeX(ply)} y={16} className="tree-tick" textAnchor="middle">
                {moveNo(ply)}
              </text>
            ))}

            {nodes.map((node) => {
              if (!node.parentId) return null;
              const parent = tree.nodes[node.parentId];
              const lane = compact.lanes[node.id];
              const x1 = nodeX(parent.ply) + (parent.parentId ? NODE_W / 2 : 8);
              const y1 = nodeY(compact.lanes[parent.id]);
              const x2 = nodeX(node.ply) - NODE_W / 2;
              const y2 = nodeY(lane);
              const mid = (x1 + x2) / 2;
              const active = activePath.has(node.id);
              return (
                <path
                  key={`e-${node.id}`}
                  d={`M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`}
                  className={`tree-edge${active ? ' tree-edge-active' : ''}`}
                  stroke={lineColor(layout, node.id)}
                />
              );
            })}

            {layout.lines.slice(1).map((line) => {
              const start = tree.nodes[line.startId];
              return (
                <text
                  key={`l-${line.startId}`}
                  x={nodeX(start.ply) - NODE_W / 2 + 2}
                  y={nodeY(compact.lanes[line.startId]) - NODE_H / 2 - 5}
                  className="tree-line-label"
                  fill={line.color}
                >
                  {line.label}
                </text>
              );
            })}

            <circle
              data-node={tree.rootId}
              cx={nodeX(0)}
              cy={nodeY(0)}
              r={7}
              className={`tree-root${currentId === tree.rootId ? ' tree-node-current' : ''}`}
            />

            {nodes.map((node) => {
              if (!node.parentId) return null;
              const lane = compact.lanes[node.id];
              const x = nodeX(node.ply);
              const y = nodeY(lane);
              const isCurrent = node.id === currentId;
              const active = activePath.has(node.id);
              const [piece, rest] = figurine(node.san!);
              return (
                <g
                  key={node.id}
                  data-node={node.id}
                  className={`tree-node${active ? ' tree-node-active' : ''}${isCurrent ? ' tree-node-current' : ''}`}
                  style={{ ['--line-color' as string]: lineColor(layout, node.id) }}
                  filter={isCurrent ? 'url(#tree-glow)' : undefined}
                >
                  <title>{`${node.san}${node.name ? ` — ${node.name}` : ''}${qualities[node.id] ? ` · ${qualities[node.id]}` : ''}`}</title>
                  <rect x={x - NODE_W / 2} y={y - NODE_H / 2} width={NODE_W} height={NODE_H} rx={NODE_H / 2} />
                  <text x={x} y={y + 4} textAnchor="middle">
                    {piece}
                    {rest}
                  </text>
                  {qualities[node.id] && <text className={`tree-quality tree-quality-${qualities[node.id]}`} x={x + NODE_W / 2 - 1} y={y - NODE_H / 2 + 3} textAnchor="middle">{qualities[node.id] === 'brilliant' ? '!!' : qualities[node.id] === 'blunder' ? '??' : qualities[node.id] === 'mistake' ? '?' : qualities[node.id] === 'inaccuracy' ? '?!' : qualities[node.id] === 'best' ? '★' : qualities[node.id] === 'excellent' ? '!' : '✓'}</text>}
                </g>
              );
            })}
          </g>
        </svg>
      </div>
      <div className="tree-controls">
        <button type="button" onClick={() => zoomAt(1.25, size.w / 2, size.h / 2)} title="Zoom in">+</button>
        <button type="button" onClick={() => zoomAt(0.8, size.w / 2, size.h / 2)} title="Zoom out">−</button>
        <button type="button" onClick={() => setView({ k: 1, x: size.w / 2 - cx, y: size.h / 2 - cy })} title="Readable scale, center current move">1:1</button>
        <button type="button" onClick={focus} title="Show nearby moves and branches at a readable scale">Focus</button>
        <button type="button" onClick={center} title="Center on current move">◎</button>
      </div>
    </div>
  );
}
