/** One Obsidian workspace and one interface colour. */
export type Section = 'board' | 'engine' | 'opening' | 'moves' | 'nav' | 'chat' | 'treeDock';

export interface UiVariant {
  id: 'obsidian';
  /** Columns left to right, each a vertical stack of sections. */
  columns: Section[][];
  /** When true the tree graph has its own dock, so the move panel shows only the list. */
  splitTree: true;
}

export const UI_VARIANTS: UiVariant[] = [
  { id: 'obsidian', columns: [['board'], ['engine', 'opening', 'moves', 'treeDock', 'nav'], ['chat']], splitTree: true },
];

export function initialVariant(): 'obsidian' { return 'obsidian'; }
