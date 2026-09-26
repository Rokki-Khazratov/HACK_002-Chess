import { type Score, formatScore, whiteShare } from '../engine/stockfish';

interface Props {
  score: Score | undefined;
  flipped: boolean;
}

/** Vertical evaluation bar; White's share grows from White's side of the board. */
export function EvalBar({ score, flipped }: Props) {
  const share = whiteShare(score);
  const label = score ? formatScore(score).replace('+', '') : '';
  const whiteWinning = share >= 0.5;

  return (
    <div
      className={`eval-bar${flipped ? ' eval-bar-flipped' : ''}`}
      role="meter"
      aria-label="Evaluation from White's point of view"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(share * 100)}
      aria-valuetext={score ? formatScore(score) : 'No evaluation'}
    >
      <div className="eval-bar-white" style={{ height: `${share * 100}%` }} />
      <span className={`eval-bar-label ${whiteWinning ? 'eval-bar-label-white' : 'eval-bar-label-black'}`}>
        {label}
      </span>
    </div>
  );
}
