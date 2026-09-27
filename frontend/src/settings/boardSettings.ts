import { useSyncExternalStore } from 'react';

/** Board look and behaviour the user can change, chess.com-style. Persisted per browser. */
export interface BoardSettings {
  pieceSet: string;
  boardTheme: string;
  /** Used when `boardTheme` is `custom`. */
  customLight: string;
  customDark: string;
  highlightMoves: boolean;
  highlightColor: string;
  showLegalMoves: boolean;
  coordinates: 'inside' | 'none';
  animation: 'none' | 'fast' | 'normal' | 'slow';
  showEvalBar: boolean;
  arrowColor: string;
}

export interface BoardTheme {
  id: string;
  name: string;
  light: string;
  dark: string;
  /** Optional texture laid over the square colour. */
  lightImage?: string;
  darkImage?: string;
}

const grain = (tint: string) =>
  `repeating-linear-gradient(100deg, ${tint} 0px, transparent 2px, transparent 7px), ` +
  `repeating-linear-gradient(95deg, rgba(0,0,0,0.05) 0px, transparent 1px, transparent 11px)`;

export const BOARD_THEMES: BoardTheme[] = [
  { id: 'green', name: 'Green', light: '#eeeed2', dark: '#769656' },
  { id: 'brown', name: 'Brown', light: '#e9d7b5', dark: '#b18968' },
  { id: 'blue', name: 'Blue', light: '#eae9d2', dark: '#4b7399' },
  { id: 'ice', name: 'Ice', light: '#dee3e6', dark: '#8ca2ad' },
  { id: 'purple', name: 'Purple', light: '#efefef', dark: '#8877b7' },
  { id: 'coral', name: 'Coral', light: '#b1e4b9', dark: '#70a2a3' },
  { id: 'sand', name: 'Sand', light: '#f3e4cf', dark: '#ce9e7c' },
  { id: 'graphite', name: 'Graphite', light: '#b8b8b8', dark: '#6d6d6d' },
  { id: 'night', name: 'Night', light: '#9ea8b8', dark: '#4a5468' },
  { id: 'pink', name: 'Pink', light: '#f5e1e5', dark: '#d9869b' },
  {
    id: 'walnut',
    name: 'Walnut',
    light: '#e8c99b',
    dark: '#a4703f',
    lightImage: grain('rgba(120,70,20,0.08)'),
    darkImage: grain('rgba(60,30,5,0.16)'),
  },
  {
    id: 'marble',
    name: 'Marble',
    light: '#ececea',
    dark: '#8f9396',
    lightImage: 'radial-gradient(ellipse at 20% 30%, rgba(0,0,0,0.05), transparent 60%), linear-gradient(135deg, transparent 45%, rgba(0,0,0,0.04) 50%, transparent 55%)',
    darkImage: 'radial-gradient(ellipse at 70% 60%, rgba(255,255,255,0.1), transparent 60%), linear-gradient(45deg, transparent 40%, rgba(255,255,255,0.08) 48%, transparent 56%)',
  },
];

export interface PieceSet {
  id: string;
  name: string;
  /** Folder under `public/pieces`; absent for the board library's built-in set. */
  dir?: string;
  /** Externally hosted PNG set. */
  imageBase?: string;
}

export const PIECE_SETS: PieceSet[] = [
  { id: 'shaded', name: 'Shaded', imageBase: 'https://images.chesscomfiles.com/chess-themes/pieces/glass/300' },
  { id: 'default', name: 'Standard' },
  { id: 'cburnett', name: 'Classic', dir: 'cburnett' },
  { id: 'merida', name: 'Merida', dir: 'merida' },
  { id: 'chessnut', name: 'Chessnut', dir: 'chessnut' },
  { id: 'mpchess', name: 'MPChess', dir: 'mpchess' },
  { id: 'papercut', name: 'Papercut', dir: 'papercut' },
  { id: 'fantasy', name: 'Fantasy', dir: 'fantasy' },
  { id: 'celtic', name: 'Celtic', dir: 'celtic' },
  { id: 'spatial', name: 'Spatial', dir: 'spatial' },
  { id: 'totoy', name: 'Totoy', dir: 'totoy' },
  { id: 'kiwen-suwi', name: 'Kiwen', dir: 'kiwen-suwi' },
  { id: 'shapes', name: 'Shapes', dir: 'shapes' },
  { id: 'rhosgfx', name: 'Pixels', dir: 'rhosgfx' },
];

export const HIGHLIGHT_COLORS = [
  { id: 'yellow', name: 'Yellow', value: '#f8f463' },
  { id: 'green', name: 'Green', value: '#9bc700' },
  { id: 'blue', name: 'Blue', value: '#5fa8e8' },
  { id: 'orange', name: 'Orange', value: '#f7a64a' },
  { id: 'pink', name: 'Pink', value: '#ec6fa0' },
];

export const ARROW_COLORS = [
  { id: 'yellow', name: 'Yellow', value: '#efca48' },
  { id: 'blue', name: 'Blue', value: '#5096e6' },
  { id: 'green', name: 'Green', value: '#15781b' },
  { id: 'orange', name: 'Orange', value: '#f29b30' },
  { id: 'red', name: 'Red', value: '#d93f3f' },
];

export const ANIMATION_MS: Record<BoardSettings['animation'], number> = {
  none: 0,
  fast: 110,
  normal: 180,
  slow: 320,
};

export const DEFAULT_SETTINGS: BoardSettings = {
  pieceSet: 'shaded',
  boardTheme: 'brown',
  customLight: '#e9d7b5',
  customDark: '#b18968',
  highlightMoves: true,
  highlightColor: '#f8f463',
  showLegalMoves: true,
  coordinates: 'inside',
  animation: 'normal',
  showEvalBar: true,
  arrowColor: '#efca48',
};

const KEY = 'chessscope.board';
/** Bump when a new default should reach people who already saved settings. */
const VERSION = 5;

function load(): BoardSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const saved = JSON.parse(raw) as Partial<BoardSettings> & { v?: number };
      const previousVersion = saved.v ?? 1;
      delete saved.v;
      // Apply the reference look to browsers that still have the old default.
      if (previousVersion < VERSION && (!saved.pieceSet || saved.pieceSet === 'default' || saved.pieceSet === 'glass')) {
        saved.pieceSet = DEFAULT_SETTINGS.pieceSet;
      }
      if (previousVersion < VERSION && saved.highlightColor === '#f6f669') {
        saved.highlightColor = DEFAULT_SETTINGS.highlightColor;
      }
      if (previousVersion < VERSION && saved.arrowColor === '#5096e6') {
        saved.arrowColor = DEFAULT_SETTINGS.arrowColor;
      }
      return { ...DEFAULT_SETTINGS, ...saved };
    }
  } catch {
    // Storage unavailable or corrupted: defaults.
  }
  return DEFAULT_SETTINGS;
}

let current = load();
const listeners = new Set<() => void>();

export function updateBoardSettings(patch: Partial<BoardSettings>) {
  current = { ...current, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...current, v: VERSION }));
  } catch {
    // Not persisted in private mode; still applies for this visit.
  }
  listeners.forEach((listener) => listener());
}

export function resetBoardSettings() {
  updateBoardSettings(DEFAULT_SETTINGS);
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** Current settings; re-renders the caller whenever they change. */
export function useBoardSettings(): BoardSettings {
  return useSyncExternalStore(subscribe, () => current);
}

/** Resolved square colours for the selected theme, including the custom one. */
export function themeColors(settings: BoardSettings): BoardTheme {
  if (settings.boardTheme === 'custom') {
    return { id: 'custom', name: 'Custom', light: settings.customLight, dark: settings.customDark };
  }
  return BOARD_THEMES.find((t) => t.id === settings.boardTheme) ?? BOARD_THEMES[1];
}

/** `#rrggbb` + alpha → `rgba()`. */
export function withAlpha(hex: string, alpha: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}
