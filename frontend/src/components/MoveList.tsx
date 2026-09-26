import { Fragment, type ReactNode, useEffect, useRef } from 'react';
import type { MoveNode } from '../chess/tree';
import { type MoveTree, isWhiteMove, moveNumberLabel } from '../chess/tree';

interface Props {
  tree: MoveTree;
  currentId: string;
  onSelect: (nodeId: string) => void;
  onContextMenu: (nodeId: string, x: number, y: number) => void;
}

/**
 * Renders the main line as numbered rows and every side line as an indented
 * block under the move it replaces, recursively (chess.com / ChessBase style).
 */
export function MoveList({ tree, currentId, onSelect, onContextMenu }: Props) {
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    container.current?.querySelector('.move-current')?.scrollIntoView({ block: 'nearest' });
  }, [currentId, tree]);

  const root = tree.nodes[tree.rootId];
  if (!root.children.length) {
    return <p className="moves-empty">Make a move on the board or paste a PGN.</p>;
  }

  const moveButton = (id: string, label: ReactNode) => (
    <button
      key={id}
      type="button"
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

  /** A side line rendered inline: "5... Nc6 6. Bb5 a6". Nested lines go in parentheses. */
  const inlineLine = (startId: string): ReactNode[] => {
    const out: ReactNode[] = [];
    let id: string | undefined = startId;
    let needNumber = true;
    while (id) {
      const node: MoveNode = tree.nodes[id];
      const label =
        isWhiteMove(tree, node) || needNumber ? `${moveNumberLabel(tree, node)} ${node.san}` : node.san;
      out.push(moveButton(id, label));
      needNumber = false;
      const parent = tree.nodes[node.parentId!];
      if (parent.children[0] === id) {
        for (const alt of parent.children.slice(1)) {
          out.push(
            <span key={`p-${alt}`} className="variation-nested">
              ({inlineLine(alt)})
            </span>,
          );
          needNumber = true;
        }
      }
      id = node.children[0];
    }
    return out;
  };

  const variationBlock = (parentId: string, mainChildId: string) => {
    const alts = tree.nodes[parentId].children.filter((id) => id !== mainChildId);
    if (!alts.length) return null;
    return (
      <div key={`v-${parentId}`} className="variations">
        {alts.map((alt) => (
          <div key={alt} className="variation">
            {inlineLine(alt)}
          </div>
        ))}
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
    const parentId = node.parentId!;
    const white = isWhiteMove(tree, node);
    const number = moveNumberLabel(tree, node).replace(/\.+$/, '.');
    if (white) {
      flush();
      row = { number, white: moveButton(id, node.san) };
    } else {
      if (!row) row = { number };
      row.black = moveButton(id, node.san);
      flush();
    }
    const block = variationBlock(parentId, id);
    if (block) {
      flush();
      rows.push(<Fragment key={`b-${id}`}>{block}</Fragment>);
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
