import type { CSSProperties } from 'react';
import type { ChessboardOptions, PieceRenderObject } from 'react-chessboard';
import { ANIMATION_MS, type BoardSettings, type PieceSet, PIECE_SETS, themeColors, withAlpha } from './boardSettings';

const PIECE_CODES = ['wP', 'wN', 'wB', 'wR', 'wQ', 'wK', 'bP', 'bN', 'bB', 'bR', 'bQ', 'bK'];
const pieceCache = new Map<string, PieceRenderObject>();

export function pieceUrl(set: PieceSet, code: string): string {
  if (set.imageBase) return `${set.imageBase}/${code.toLowerCase()}.png`;
  return `${import.meta.env.BASE_URL}pieces/${set.dir}/${code}.svg`;
}

/** Renderers for an image piece set, or undefined for the board's built-in pieces. */
export function pieceRenderers(setId: string): PieceRenderObject | undefined {
  const set = PIECE_SETS.find((candidate) => candidate.id === setId);
  if (!set?.dir && !set?.imageBase) return undefined;
  let renderers = pieceCache.get(set.id);
  if (!renderers) {
    renderers = {};
    for (const code of PIECE_CODES) {
      renderers[code] = (props) => (
        <img
          src={pieceUrl(set, code)}
          alt=""
          draggable={false}
          onError={set.imageBase ? (event) => {
            const fallback = `${import.meta.env.BASE_URL}pieces/cburnett/${code}.svg`;
            if (event.currentTarget.src !== new URL(fallback, window.location.href).href) event.currentTarget.src = fallback;
          } : undefined}
          style={{ width: '100%', height: '100%', display: 'block', ...props?.svgStyle }}
        />
      );
    }
    pieceCache.set(set.id, renderers);
  }
  return renderers;
}

/**
 * Everything the settings change on a board: chessboard options plus CSS
 * variables the square highlights read (`--board-lastMove`, legal-move dots…).
 */
export function boardLook(settings: BoardSettings): { options: ChessboardOptions; vars: CSSProperties } {
  const theme = themeColors(settings);
  const square = (color: string, image?: string): CSSProperties => ({
    backgroundColor: color,
    ...(image ? { backgroundImage: image } : {}),
  });
  const notation = { fontSize: '11px', fontWeight: 700 };
  return {
    options: {
      pieces: pieceRenderers(settings.pieceSet),
      lightSquareStyle: square(theme.light, theme.lightImage),
      darkSquareStyle: square(theme.dark, theme.darkImage),
      // chess.com colours each coordinate with the opposite square's colour.
      lightSquareNotationStyle: { ...notation, color: theme.dark },
      darkSquareNotationStyle: { ...notation, color: theme.light },
      showNotation: settings.coordinates === 'inside',
      animationDurationInMs: ANIMATION_MS[settings.animation],
      showAnimations: settings.animation !== 'none',
    },
    vars: {
      ['--board-lastMove' as string]: withAlpha(settings.highlightColor, 0.55),
      ['--board-lastMove-from' as string]: withAlpha(settings.highlightColor, 0.55),
      ['--board-selected' as string]: withAlpha(settings.highlightColor, 0.55),
      ['--board-selected-ring' as string]: withAlpha(settings.highlightColor, 0.95),
    },
  };
}
