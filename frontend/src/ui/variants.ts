/** Section building blocks the layouts arrange into columns. */
export type Section = 'board' | 'title' | 'engine' | 'opening' | 'moves' | 'nav' | 'chat' | 'treeDock';

export interface UiVariant {
  id: string;
  name: string;
  pitch: string;
  /** Columns left to right, each a vertical stack of sections. */
  columns: Section[][];
  /** When true the tree graph has its own dock, so the move panel shows only the list. */
  splitTree: boolean;
}

export const UI_VARIANTS: UiVariant[] = [
  {
    id: 'workspace',
    name: 'Workspace',
    pitch: 'Resizable coach, board and analysis panels.',
    columns: [['chat'], ['board'], ['engine', 'opening', 'moves', 'nav']],
    splitTree: false,
  },
  {
    id: 'classic',
    name: 'Classic',
    pitch: 'Chess.com-style: board left, one analysis panel right, coach at the bottom of the panel.',
    columns: [['board'], ['title', 'engine', 'opening', 'moves', 'nav', 'chat']],
    splitTree: false,
  },
  {
    id: 'obsidian',
    name: 'Obsidian',
    pitch: 'Three panes: board, notation, and a permanent graph of lines above the coach.',
    columns: [['board'], ['engine', 'opening', 'moves', 'nav'], ['treeDock', 'chat']],
    splitTree: true,
  },
  {
    id: 'paper',
    name: 'Paper',
    pitch: 'Light study mode: coach sits under the board, notation and engine on the right.',
    columns: [['board', 'chat'], ['title', 'engine', 'opening', 'moves', 'nav']],
    splitTree: false,
  },
  {
    id: 'timeline',
    name: 'Timeline',
    pitch: 'The tree graph runs as a horizontal timeline under the board; list + coach on the right.',
    columns: [['board', 'treeDock'], ['engine', 'opening', 'moves', 'nav', 'chat']],
    splitTree: true,
  },
  {
    id: 'terminal',
    name: 'Pro',
    pitch: 'Dense preparation desk: board, engine + notation, and a full-height coach column.',
    columns: [['board'], ['engine', 'opening', 'moves', 'nav'], ['chat']],
    splitTree: false,
  },
];

const KEY = 'chessscope.ui';

export function initialVariant(): string {
  const fromUrl = new URLSearchParams(window.location.search).get('ui');
  if (fromUrl && UI_VARIANTS.some((v) => v.id === fromUrl)) return fromUrl;
  try {
    const stored = localStorage.getItem(KEY);
    if (stored && UI_VARIANTS.some((v) => v.id === stored)) return stored;
  } catch {
    // Storage unavailable: fall back to the default.
  }
  return UI_VARIANTS[0].id;
}

export function rememberVariant(id: string) {
  try {
    localStorage.setItem(KEY, id);
  } catch {
    // Not remembered in private mode; the URL still carries it.
  }
  const url = new URL(window.location.href);
  url.searchParams.set('ui', id);
  window.history.replaceState(null, '', url);
}
