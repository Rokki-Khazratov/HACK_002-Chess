import type { MoveTree } from '../chess/tree';
import type { TreeLayout } from '../chess/layout';
import { lineColor } from '../chess/layout';
import { San } from './San';

interface Props {
  tree: MoveTree;
  layout: TreeLayout;
  forkId: string;
  selected: number;
  anchor: { x: number; y: number };
  onPick: (index: number) => void;
}

/**
 * Chess.com-style popup shown when stepping forward from a fork: ↑/↓ choose,
 * → or Enter follows the line, ← or Esc closes.
 */
export function LineChooser({ tree, layout, forkId, selected, anchor, onPick }: Props) {
  const children = tree.nodes[forkId].children;
  return (
    <div
      className="line-chooser"
      role="listbox"
      aria-label="Choose a line"
      style={{ left: anchor.x, top: anchor.y }}
      onClick={(event) => event.stopPropagation()}
    >
      {children.map((id, index) => {
        const line = layout.lines.find((l) => l.startId === id);
        return (
          <button
            key={id}
            type="button"
            role="option"
            aria-selected={index === selected}
            className={`line-chooser-item${index === selected ? ' line-chooser-item-selected' : ''}`}
            style={{ ['--line-color' as string]: lineColor(layout, id) }}
            onClick={() => onPick(index)}
          >
            <span className="line-chooser-arrow">{index === selected ? '→' : ''}</span>
            <San san={tree.nodes[id].san!} />
            <span className="line-chooser-label">{index === 0 ? 'continuation' : line?.label}</span>
          </button>
        );
      })}
    </div>
  );
}
