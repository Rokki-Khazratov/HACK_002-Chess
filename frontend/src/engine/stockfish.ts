import { Chess } from 'chess.js';

export const ENGINE_NAME = 'Stockfish 19 lite';
export const ENGINE_DETAILS = "Stockfish 19 lite · WASM in the browser · 1 thread · scores from White's point of view";
// Served from public/ so Vite does not rename it: the loader finds its .wasm by
// swapping the script's .js extension. A wrong MIME type or a 404 for the .wasm
// fails silently inside the worker, hence the load timeout below.
const ENGINE_URL = `${import.meta.env.BASE_URL}stockfish/stockfish-19-lite-single.js`;
const LOAD_TIMEOUT_MS = 15_000;

/** Evaluation from White's point of view. */
export type Score = { kind: 'cp'; value: number } | { kind: 'mate'; value: number };

export interface EngineLine {
  multipv: number;
  depth: number;
  score: Score;
  /** Principal variation in UCI notation. */
  pv: string[];
  /** The same PV converted to SAN from the analysed position. */
  san: string[];
}

export interface EngineState {
  fen: string | null;
  depth: number;
  lines: EngineLine[];
  status: 'loading' | 'ready' | 'running' | 'done' | 'error';
}

export interface EngineOptions {
  multiPv: number;
  maxDepth: number;
}

type Listener = (state: EngineState) => void;

/**
 * Wraps a Stockfish Web Worker. Only one search runs at a time: a new position
 * stops the current search and starts once the engine reports `bestmove`, so info
 * lines from a stale search are never attributed to the new position.
 */
export class StockfishEngine {
  private worker: Worker;
  private listener: Listener;
  private options: EngineOptions;
  private state: EngineState = { fen: null, depth: 0, lines: [], status: 'loading' };
  private searching = false;
  private pendingFen: string | null = null;
  private currentFen: string | null = null;
  private loadTimer: ReturnType<typeof setTimeout>;

  constructor(listener: Listener, options: EngineOptions) {
    this.listener = listener;
    this.options = options;
    this.worker = new Worker(ENGINE_URL);
    this.worker.onmessage = (event) => this.handle(String(event.data));
    this.worker.onerror = () => this.fail();
    this.loadTimer = setTimeout(() => this.fail(), LOAD_TIMEOUT_MS);
    this.send('uci');
  }

  private fail() {
    clearTimeout(this.loadTimer);
    this.emit({ ...this.state, status: 'error' });
  }

  analyse(fen: string) {
    this.pendingFen = fen;
    if (this.state.status === 'loading' || this.state.status === 'error') return;
    if (this.searching) this.send('stop');
    else this.startPending();
  }

  setOptions(options: EngineOptions) {
    this.options = options;
    if (this.currentFen) this.analyse(this.currentFen);
  }

  stop() {
    this.pendingFen = null;
    if (this.searching) this.send('stop');
  }

  destroy() {
    clearTimeout(this.loadTimer);
    this.worker.terminate();
  }

  private send(command: string) {
    this.worker.postMessage(command);
  }

  private emit(state: EngineState) {
    this.state = state;
    this.listener(state);
  }

  private startPending() {
    const fen = this.pendingFen;
    if (!fen) return;
    this.pendingFen = null;
    this.currentFen = fen;

    if (new Chess(fen).isGameOver()) {
      this.emit({ fen, depth: 0, lines: [], status: 'done' });
      return;
    }
    this.searching = true;
    this.emit({ fen, depth: 0, lines: [], status: 'running' });
    this.send(`setoption name MultiPV value ${this.options.multiPv}`);
    this.send(`position fen ${fen}`);
    this.send(`go depth ${this.options.maxDepth}`);
  }

  private handle(line: string) {
    if (line === 'uciok') {
      this.send('isready');
    } else if (line === 'readyok' && this.state.status === 'loading') {
      clearTimeout(this.loadTimer);
      this.emit({ ...this.state, status: 'ready' });
      this.startPending();
    } else if (line.startsWith('bestmove')) {
      this.searching = false;
      if (this.pendingFen) this.startPending();
      else this.emit({ ...this.state, status: 'done' });
    } else if (line.startsWith('info') && line.includes(' pv ') && this.currentFen) {
      const parsed = parseInfo(line, this.currentFen);
      if (!parsed || this.pendingFen) return;
      const lines = [...this.state.lines.filter((l) => l.multipv !== parsed.multipv), parsed]
        .sort((a, b) => a.multipv - b.multipv);
      this.emit({ ...this.state, depth: Math.max(this.state.depth, parsed.depth), lines });
    }
  }
}

/** Parses a UCI `info` line; converts the side-to-move score to White's view. */
export function parseInfo(line: string, fen: string): EngineLine | null {
  const tokens = line.split(' ');
  const get = (key: string) => tokens[tokens.indexOf(key) + 1];
  if (!tokens.includes('score') || tokens.includes('lowerbound') || tokens.includes('upperbound')) {
    return null;
  }

  const sign = fen.split(' ')[1] === 'w' ? 1 : -1;
  const rawScore = Number(tokens[tokens.indexOf('score') + 2]);
  const score: Score =
    tokens[tokens.indexOf('score') + 1] === 'mate'
      ? { kind: 'mate', value: rawScore * sign }
      : { kind: 'cp', value: rawScore * sign };

  const pv = tokens.slice(tokens.indexOf('pv') + 1);
  return {
    multipv: Number(tokens.includes('multipv') ? get('multipv') : 1),
    depth: Number(get('depth')),
    score,
    pv,
    san: uciToSan(fen, pv),
  };
}

export function uciToSan(fen: string, uciMoves: string[]): string[] {
  const chess = new Chess(fen);
  const san: string[] = [];
  for (const uci of uciMoves) {
    try {
      san.push(
        chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }).san,
      );
    } catch {
      break;
    }
  }
  return san;
}

/** "+0.27", "-1.40", "M3", "-M5" — always from White's point of view. */
export function formatScore(score: Score): string {
  if (score.kind === 'mate') return `${score.value < 0 ? '-' : ''}M${Math.abs(score.value)}`;
  const pawns = score.value / 100;
  return `${pawns > 0 ? '+' : ''}${pawns.toFixed(2)}`;
}

/** White's share of the eval bar, 0..1, using a logistic curve over centipawns. */
export function whiteShare(score: Score | undefined): number {
  if (!score) return 0.5;
  if (score.kind === 'mate') return score.value > 0 ? 1 : 0;
  return 1 / (1 + Math.exp(-0.004 * score.value));
}
