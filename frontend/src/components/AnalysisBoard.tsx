import {
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  type Arrow,
  Chessboard,
  type ChessboardOptions,
  type PieceDropHandlerArgs,
  type SquareHandlerArgs,
} from 'react-chessboard';
import { Chess, type Square } from 'chess.js';
import { ARROW_COLORS, SQUARE_COLORS, type Shape, shapeColor, toggleShape } from '../chess/shapes';
import type { MoveInput } from '../chess/tree';
import { boardLook, pieceUrl } from '../settings/boardLook';
import { PIECE_SETS, useBoardSettings } from '../settings/boardSettings';

interface Props {
  fen: string;
  lastMove: { from: string; to: string } | null;
  orientation: 'white' | 'black';
  arrows: Arrow[];
  /** The user's squares and arrows on this position. */
  shapes: Shape[];
  onShapesChange: (shapes: Shape[]) => void;
  onMove: (move: MoveInput) => boolean;
}

const PROMOTION_PIECES = [
  { piece: 'q', white: '♕', black: '♛', label: 'Queen' },
  { piece: 'r', white: '♖', black: '♜', label: 'Rook' },
  { piece: 'b', white: '♗', black: '♝', label: 'Bishop' },
  { piece: 'n', white: '♘', black: '♞', label: 'Knight' },
];

const KEYBOARD_DRAG_KEYS = new Set(['Space', 'Enter', 'NumpadEnter']);

function blockKeyboardDrag(event: KeyboardEvent<HTMLDivElement>) {
  const target = event.target as HTMLElement;
  if (KEYBOARD_DRAG_KEYS.has(event.code) && target.getAttribute('aria-roledescription') === 'draggable') {
    event.preventDefault();
    event.stopPropagation();
  }
}

function isPromotion(fen: string, from: string, to: string): boolean {
  return new Chess(fen)
    .moves({ square: from as Square, verbose: true })
    .some((move) => move.to === to && move.isPromotion());
}

const NO_KEYS = { shiftKey: false, ctrlKey: false, altKey: false, metaKey: false };

/** Puts `layer` (a legal-move dot) over a marked square instead of replacing its colour. */
const over = (layer: string, base?: string) => (base ? `${layer}, ${base}` : layer);

/**
 * The interactive board: drag or click-click to move, legal-target dots, last-move
 * and check highlights, engine arrows, a promotion picker, and chess.com-style marks:
 * right-click a square to colour it, right-drag to draw an arrow, left-click to clear.
 */
export function AnalysisBoard({ fen, lastMove, orientation, arrows, shapes, onShapesChange, onMove }: Props) {
  // Selection and a pending promotion belong to one position; a new FEN clears them.
  const [selection, setSelection] = useState<{ fen: string; square: Square } | null>(null);
  const [pending, setPending] = useState<{ fen: string; from: string; to: string } | null>(null);
  const selected = selection?.fen === fen ? selection.square : null;
  const promotion = pending?.fen === fen ? pending : null;
  const setSelected = (square: Square | null) => setSelection(square ? { fen, square } : null);

  // react-chessboard keeps the drop handler from the render where a drag started,
  // so handlers read the latest props through a ref.
  const latest = useRef({ fen, onMove });
  useEffect(() => {
    latest.current = { fen, onMove };
  });

  // A right-drag in progress: where it started and the square under the pointer.
  const [drawing, setDrawing] = useState<{ from: string; over: string; keys: typeof NO_KEYS } | null>(null);

  // Releasing the button off the board drops the unfinished arrow.
  useEffect(() => {
    if (!drawing) return;
    const cancel = (event: MouseEvent) => {
      if (event.button === 2) setDrawing(null);
    };
    window.addEventListener('mouseup', cancel);
    return () => window.removeEventListener('mouseup', cancel);
  }, [drawing]);

  const keysOf = (event: { shiftKey: boolean; ctrlKey: boolean; altKey: boolean; metaKey: boolean }) => ({
    shiftKey: event.shiftKey,
    ctrlKey: event.ctrlKey,
    altKey: event.altKey,
    metaKey: event.metaKey,
  });

  const onSquareMouseDown = ({ square }: SquareHandlerArgs, event: ReactMouseEvent) => {
    if (event.button === 2) {
      setDrawing({ from: square, over: square, keys: keysOf(event) });
    } else if (event.button === 0 && shapes.length) {
      onShapesChange([]);
    }
  };

  const onSquareMouseUp = ({ square }: SquareHandlerArgs, event: ReactMouseEvent) => {
    if (event.button !== 2 || !drawing) return;
    const isArrow = square !== drawing.from;
    // A modifier held at either end of the drag picks the colour.
    const now = keysOf(event);
    const keys = {
      shiftKey: drawing.keys.shiftKey || now.shiftKey,
      ctrlKey: drawing.keys.ctrlKey || now.ctrlKey,
      altKey: drawing.keys.altKey || now.altKey,
      metaKey: drawing.keys.metaKey || now.metaKey,
    };
    onShapesChange(toggleShape(shapes, { from: drawing.from, to: isArrow ? square : undefined, color: shapeColor(isArrow, keys) }));
    setDrawing(null);
  };

  const onMouseOverSquare = ({ square }: SquareHandlerArgs) => {
    if (drawing && drawing.over !== square) setDrawing({ ...drawing, over: square });
  };

  useEffect(() => {
    if (!promotion) return;
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') setPending(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [promotion]);

  const attempt = (from: string, to: string): boolean => {
    const { fen: currentFen, onMove: play } = latest.current;
    if (isPromotion(currentFen, from, to)) {
      setPending({ fen: currentFen, from, to });
      // Cancelling the picker should leave nothing selected, so the next click starts fresh.
      setSelection(null);
      return false;
    }
    const ok = play({ from, to });
    if (ok) setSelected(null);
    return ok;
  };

  const onPieceDrop = ({ sourceSquare, targetSquare }: PieceDropHandlerArgs): boolean =>
    targetSquare ? attempt(sourceSquare, targetSquare) : false;

  const onSquareClick = ({ square, piece }: SquareHandlerArgs) => {
    const turn = new Chess(latest.current.fen).turn();
    if (selected && selected !== square) {
      const legal = new Chess(latest.current.fen)
        .moves({ square: selected, verbose: true })
        .some((move) => move.to === square);
      if (legal) {
        attempt(selected, square);
        return;
      }
    }
    setSelected(piece && piece.pieceType[0] === turn && selected !== square ? (square as Square) : null);
  };

  const settings = useBoardSettings();
  const look = boardLook(settings);
  const pieceDir = PIECE_SETS.find((set) => set.id === settings.pieceSet)?.dir;

  const squareStyles: Record<string, CSSProperties> = {};
  if (lastMove && settings.highlightMoves) {
    squareStyles[lastMove.from] = { background: 'var(--board-lastMove-from)' };
    squareStyles[lastMove.to] = { background: 'var(--board-lastMove)' };
  }
  const position = new Chess(fen);
  if (position.isCheck()) {
    const king = position
      .board()
      .flat()
      .find((cell) => cell?.type === 'k' && cell.color === position.turn());
    if (king) squareStyles[king.square] = { background: 'var(--board-check)' };
  }
  const marked: Record<string, string> = {};
  for (const shape of shapes) {
    if (shape.to) continue;
    marked[shape.from] = SQUARE_COLORS[shape.color];
    squareStyles[shape.from] = { background: marked[shape.from] };
  }
  if (selected) {
    squareStyles[selected] = {
      background: 'var(--board-selected)',
      boxShadow: 'inset 0 0 0 3px var(--board-selected-ring)',
    };
    for (const move of settings.showLegalMoves ? position.moves({ square: selected, verbose: true }) : []) {
      squareStyles[move.to] = move.isCapture()
        ? { background: over('radial-gradient(circle, transparent 58%, var(--board-legalMove) 60%)', marked[move.to]) }
        : { background: over('radial-gradient(circle, var(--board-legalMove) 22%, transparent 24%)', marked[move.to]) };
    }
  }

  // The user's arrows, then the parent's (engine, line preview), then the arrow being
  // drawn. The board keys arrows by their squares, so a later one replaces an earlier.
  const byPair = new Map<string, Arrow>();
  const add = (arrow: Arrow) => {
    const key = `${arrow.startSquare}${arrow.endSquare}`;
    byPair.delete(key);
    byPair.set(key, arrow);
  };
  for (const arrow of arrows) add(arrow);
  for (const shape of shapes) {
    if (shape.to) add({ startSquare: shape.from, endSquare: shape.to, color: ARROW_COLORS[shape.color] });
  }
  if (drawing && drawing.over !== drawing.from) {
    const color = ARROW_COLORS[shapeColor(true, drawing.keys)];
    add({ startSquare: drawing.from, endSquare: drawing.over, color });
  }
  const boardArrows = [...byPair.values()];

  const options: ChessboardOptions = {
    id: 'analysis-board',
    position: fen,
    boardOrientation: orientation,
    onPieceDrop,
    onSquareClick,
    // Show the active piece and its targets while it is being dragged too.
    onPieceDrag: ({ square }) => {
      if (square) setSelected(square as Square);
    },
    squareStyles,
    arrows: boardArrows,
    // Marks are drawn by the handlers above so they can live on the move-tree node;
    // the board's own arrows are internal state that a new position wipes.
    allowDrawingArrows: false,
    onSquareMouseDown,
    onSquareMouseUp,
    onMouseOverSquare,
    ...look.options,
    allowDragging: true,
    // Keep a dragged piece within half a square of the board edge.
    allowDragOffBoard: false,
  };

  const whiteToMove = position.turn() === 'w';

  return (
    // A clicked piece keeps focus, and dnd-kit would pick it up on Space/Enter and
    // then steer it with the arrow keys the app uses for navigation. Stop those keys
    // before they reach the piece; the app's own shortcuts listen in the capture phase.
    <div className="board" style={look.vars} onKeyDownCapture={blockKeyboardDrag}>
      <Chessboard options={options} />
      {promotion && (
        <div className="dialog-backdrop" onClick={() => setPending(null)}>
          <div className="dialog" role="dialog" aria-label="Choose promotion piece" onClick={(e) => e.stopPropagation()}>
            <h2>Promote to</h2>
            <div className="promotion">
              {PROMOTION_PIECES.map(({ piece, white, black, label }) => (
                <button
                  key={piece}
                  type="button"
                  aria-label={label}
                  onClick={() => {
                    latest.current.onMove({ from: promotion.from, to: promotion.to, promotion: piece });
                    setPending(null);
                  }}
                >
                  {pieceDir ? (
                    <img className="promotion-piece" src={pieceUrl(pieceDir, `${whiteToMove ? 'w' : 'b'}${piece.toUpperCase()}`)} alt="" />
                  ) : whiteToMove ? white : black}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
