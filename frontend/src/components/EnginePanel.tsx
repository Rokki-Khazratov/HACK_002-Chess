import { ENGINE_DETAILS, ENGINE_NAME, type EngineState, formatScore } from '../engine/stockfish';

interface Props {
  engine: EngineState;
  enabled: boolean;
  maxDepth: number;
  onToggle: () => void;
  onPlayLine: (uciMoves: string[]) => void;
}

/** Move-number prefix for the i-th move of a PV starting at `fen`, or '' when none is needed. */
function pvPrefix(fen: string, i: number): string {
  const [, side, , , , full] = fen.split(' ');
  const blackFirst = side === 'b';
  const whiteMove = blackFirst ? i % 2 === 1 : i % 2 === 0;
  const number = Number(full) + Math.floor((i + (blackFirst ? 1 : 0)) / 2);
  if (whiteMove) return `${number}. `;
  return i === 0 ? `${number}... ` : '';
}

const STATUS_LABEL: Record<EngineState['status'], string> = {
  loading: 'Loading engine…',
  ready: 'Ready',
  running: 'Analysing…',
  done: 'Complete',
  error: 'Engine failed to load',
};

/** Top engine lines. Scores are always shown from White's point of view. */
export function EnginePanel({
  engine,
  enabled,
  maxDepth,
  onToggle,
  onPlayLine,
}: Props) {
  return (
    <section className="engine" aria-label="Engine analysis">
      <header className="engine-header">
        <label className="switch">
          <input type="checkbox" checked={enabled} onChange={onToggle} />
          <span>Analysis</span>
        </label>
        <span className="engine-meta" title={ENGINE_DETAILS}>
          {enabled ? (
            <>
              {STATUS_LABEL[engine.status]} · depth {engine.depth}/{maxDepth} · {ENGINE_NAME}
            </>
          ) : (
            'Engine off'
          )}
        </span>
      </header>

      {enabled && (
        <ol className="engine-lines">
          {engine.lines.length === 0 && engine.status !== 'error' && (
            <li className="engine-line engine-line-pending">
              {engine.status === 'done' ? 'No legal moves — game over.' : 'Waiting for the first line…'}
            </li>
          )}
          {engine.lines.map((line) => {
            const positive =
              line.score.kind === 'mate' ? line.score.value > 0 : line.score.value >= 0;
            return (
              <li key={line.multipv} className="engine-line">
                <button
                  type="button"
                  className="engine-line-button"
                  title="Play this line on the board"
                  onClick={() => onPlayLine(line.pv)}
                >
                  <span className={`eval-badge ${positive ? 'eval-white' : 'eval-black'}`}>
                    {formatScore(line.score)}
                  </span>
                  <span className="engine-pv">
                    {line.san.slice(0, 12).map((san, i) => (
                      <span key={i}>
                        {pvPrefix(engine.fen!, i)}
                        {san}{' '}
                      </span>
                    ))}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
