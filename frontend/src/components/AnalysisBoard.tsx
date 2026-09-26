import { type CSSProperties, useEffect, useRef, useState } from 'react';
import {
  type Arrow,
  Chessboard,
  type ChessboardOptions,
  type PieceDropHandlerArgs,
  type SquareHandlerArgs,
} from 'react-chessboard';
import { Chess, type Square } from 'chess.js';
import type { MoveInput } from '../chess/tree';

interface Props {
  fen: string;
  lastMove: { from: string; to: string } | null;
  orientation: 'white' | 'black';
  arrows: Arrow[];
  onMove: (move: MoveInput) => boolean;
}

const PROMOTION_PIECES = [
  { piece: 'q', white: '♕', black: '♛', label: 'Queen' },
  { piece: 'r', white: '♖', black: '♜', label: 'Rook' },
  { piece: 'b', white: '♗', black: '♝', label: 'Bishop' },
  { piece: 'n', white: '♘', black: '♞', label: 'Knight' },
];

function isPromotion(fen: string, from: string, to: string): boolean {
  return new Chess(fen)
    .moves({ square: from as Square, verbose: true })
    .some((move) => move.to === to && move.isPromotion());
}

/**
 * The interactive board: drag or click-click to move, legal-target dots, last-move
 * and check highlights, engine arrows, and a promotion picker.
 */
export function AnalysisBoard({ fen, lastMove, orientation, arrows, onMove }: Props) {
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

  const attempt = (from: string, to: string): boolean => {
    const { fen: currentFen, onMove: play } = latest.current;
    if (isPromotion(currentFen, from, to)) {
      setPending({ fen: currentFen, from, to });
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

  const squareStyles: Record<string, CSSProperties> = {};
  if (lastMove) {
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
  if (selected) {
    squareStyles[selected] = {
      background: 'var(--board-selected)',
      boxShadow: 'inset 0 0 0 3px var(--board-selected-ring)',
    };
    for (const move of position.moves({ square: selected, verbose: true })) {
      squareStyles[move.to] = move.isCapture()
        ? { background: 'radial-gradient(circle, transparent 58%, var(--board-legalMove) 60%)' }
        : { background: 'radial-gradient(circle, var(--board-legalMove) 22%, transparent 24%)' };
    }
  }

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
    arrows,
    animationDurationInMs: 180,
    showNotation: true,
    allowDragging: true,
    lightSquareStyle: { backgroundColor: 'var(--board-light)' },
    darkSquareStyle: { backgroundColor: 'var(--board-dark)' },
  };

  const whiteToMove = position.turn() === 'w';

  return (
    <div className="board">
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
                  {whiteToMove ? white : black}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
