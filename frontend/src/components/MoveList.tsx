import { Fragment, type ReactNode, useEffect, useRef, useState } from 'react';
import type { TreeLayout } from '../chess/layout';
import { lineColor } from '../chess/layout';
import { type MoveNode, type MoveTree, isWhiteMove, moveNumberLabel } from '../chess/tree';
import { San } from './San';

interface Props {
  tree: MoveTree;
  layout: TreeLayout;
  currentId: string;
  onSelect: (nodeId: string) => void;
  onContextMenu: (nodeId: string, x: number, y: number) => void;
}

/**
 * Main line as numbered rows; every side line as a collapsible block under the
 * move it replaces, with a coloured rail and label matching the tree graph.
 */
export function MoveList({ tree, layout, currentId, onSelect, onContextMenu }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    container.current?.querySelector('.move-current')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [currentId, tree]);

  const root = tree.nodes[tree.rootId];
  if (!root.children.length) {
    return <p className="moves-empty">Make a move on the board or paste a PGN.</p>;
  }

  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const moveButton = (id: string, label: ReactNode) => (
    <button
      key={id}
      type="button"
      data-node={id}
      className={`move${id === currentId ? ' move-current' : ''}`}
      aria-current={id === currentId ? 'step' : undefined}
      onClick={() => onSelect(id)}
      onContextMenu={(event) => {
        event.preventDefault();
        onContextMenu(id, event.clientX, event.clientY);
      }}
    >
      {label}
    </button>
  );

  const lineOf = (id: string) => layout.lines.find((line) => line.startId === id);

  /** A side line rendered inline: "5... Nc6 6. Bb5 a6", nested side lines as sub-blocks. */
  const sideLine = (startId: string): ReactNode => {
    const line = lineOf(startId);
    const isCollapsed = collapsed.has(startId);
    // Segments of inline moves, interrupted by nested side-line blocks at forks.
    const content: ReactNode[] = [];
    let items: ReactNode[] = [];
    let moveCount = 0;
    const flushItems = () => {
      if (items.length) content.push(<div key={`m-${content.length}`} className="variation-moves">{items}</div>);
      items = [];
    };
    let id: string | undefined = startId;
    let needNumber = true;
    while (id) {
      const node: MoveNode = tree.nodes[id];
      const number = isWhiteMove(tree, node) || needNumber ? `${moveNumberLabel(tree, node)} ` : '';
      items.push(
        moveButton(
          id,
          <>
            {number && <span className="move-inline-number">{number}</span>}
            <San san={node.san!} />
          </>,
        ),
      );
      moveCount++;
      needNumber = false;
      const parent = tree.nodes[node.parentId!];
      if (parent.children[0] === id && parent.children.length > 1 && id !== startId) {
        flushItems();
        content.push(
          <div key={`n-${id}`} className="variation-children">
            {parent.children.slice(1).map((alt) => sideLine(alt))}
          </div>,
        );
        needNumber = true;
      }
      id = node.children[0];
    }
    flushItems();

    return (
      <div
        key={startId}
        className={`variation${isCollapsed ? ' variation-collapsed' : ''}`}
        style={{ ['--line-color' as string]: lineColor(layout, startId) }}
      >
        <div className="variation-head">
          <button
            type="button"
            className="variation-toggle"
            aria-expanded={!isCollapsed}
            aria-label={isCollapsed ? 'Expand line' : 'Collapse line'}
            onClick={() => toggle(startId)}
          >
            {isCollapsed ? '▸' : '▾'}
          </button>
          <span className="variation-label">{line?.label}</span>
          {isCollapsed && <span className="variation-count">{moveCount} moves</span>}
        </div>
        {!isCollapsed && content}
      </div>
    );
  };

  // Main line: rows of "N. white black"; a side line forces the row to break.
  const rows: ReactNode[] = [];
  let id: string | undefined = root.children[0];
  let row: { number: string; white?: ReactNode; black?: ReactNode } | null = null;
  const flush = () => {
    if (!row) return;
    rows.push(
      <div key={`r-${rows.length}`} className="move-row">
        <span className="move-number">{row.number}</span>
        <span className="move-cell">{row.white ?? <span className="move-gap">…</span>}</span>
        <span className="move-cell">{row.black}</span>
      </div>,
    );
    row = null;
  };

  while (id) {
    const node: MoveNode = tree.nodes[id];
    const parent = tree.nodes[node.parentId!];
    const number = moveNumberLabel(tree, node).replace(/\.+$/, '.');
    if (isWhiteMove(tree, node)) {
      flush();
      row = { number, white: moveButton(id, <San san={node.san!} />) };
    } else {
      if (!row) row = { number };
      row.black = moveButton(id, <San san={node.san!} />);
      flush();
    }
    if (parent.children.length > 1) {
      flush();
      rows.push(
        <Fragment key={`b-${id}`}>
          <div className="variations">{parent.children.slice(1).map((alt) => sideLine(alt))}</div>
        </Fragment>,
      );
    }
    id = node.children[0];
  }
  flush();

  return (
    <div className="moves" ref={container}>
      {rows}
    </div>
  );
}
