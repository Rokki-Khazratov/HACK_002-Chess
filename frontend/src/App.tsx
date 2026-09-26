import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Arrow } from 'react-chessboard';
import { Chess } from 'chess.js';
import './App.css';
import { AnalysisBoard } from './components/AnalysisBoard';
import { ChatPanel } from './components/ChatPanel';
import { EnginePanel } from './components/EnginePanel';
import { EvalBar } from './components/EvalBar';
import { MoveList } from './components/MoveList';
import { openingAt } from './chess/openings';
import { importPgn } from './chess/pgn';
import {
  type MoveInput,
  type MoveTree,
  addMove,
  createTree,
  deleteNode,
  lineEnd,
  promoteNode,
  toPgn,
} from './chess/tree';
import { type EngineState, StockfishEngine } from './engine/stockfish';

const ENGINE_OPTIONS = { multiPv: 3, maxDepth: 22 };

export default function App() {
  const [tree, setTree] = useState<MoveTree>(() => createTree());
  const [currentId, setCurrentId] = useState(tree.rootId);
  const [orientation, setOrientation] = useState<'white' | 'black'>('white');
  const [engineEnabled, setEngineEnabled] = useState(true);
  const [engine, setEngine] = useState<EngineState>({ fen: null, depth: 0, lines: [], status: 'loading' });
  const [menu, setMenu] = useState<{ nodeId: string; x: number; y: number } | null>(null);
  const [pgnOpen, setPgnOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const current = tree.nodes[currentId];
  const engineRef = useRef<StockfishEngine | null>(null);

  useEffect(() => {
    const instance = new StockfishEngine(setEngine, ENGINE_OPTIONS);
    engineRef.current = instance;
    return () => instance.destroy();
  }, []);

  useEffect(() => {
    if (engineEnabled) engineRef.current?.analyse(current.fen);
    else engineRef.current?.stop();
  }, [current.fen, engineEnabled]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 1800);
    return () => clearTimeout(timer);
  }, [toast]);

  const play = useCallback(
    (move: MoveInput): boolean => {
      const result = addMove(tree, currentId, move);
      if (!result) return false;
      setTree(result.tree);
      setCurrentId(result.nodeId);
      return true;
    },
    [tree, currentId],
  );

  const playLine = (uciMoves: string[]) => {
    let nextTree = tree;
    let nodeId = currentId;
    for (const uci of uciMoves) {
      const result = addMove(nextTree, nodeId, { from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
      if (!result) break;
      nextTree = result.tree;
      nodeId = result.nodeId;
    }
    setTree(nextTree);
    // Stay on the first move of the line so the user can step through it.
    const first = nextTree.nodes[currentId].children.find(
      (id) => nextTree.nodes[id].uci === uciMoves[0],
    );
    if (first) setCurrentId(first);
  };

  const goBack = () => current.parentId && setCurrentId(current.parentId);
  const goForward = () => current.children[0] && setCurrentId(current.children[0]);
  const goStart = () => setCurrentId(tree.rootId);
  const goEnd = () => setCurrentId(lineEnd(tree, currentId));

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest('input, textarea') || pgnOpen) return;
      const actions: Record<string, () => void> = {
        ArrowLeft: goBack,
        ArrowRight: goForward,
        ArrowUp: goStart,
        Home: goStart,
        ArrowDown: goEnd,
        End: goEnd,
        f: () => setOrientation((o) => (o === 'white' ? 'black' : 'white')),
      };
      const action = actions[event.key];
      if (action) {
        event.preventDefault();
        action();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const opening = useMemo(() => openingAt(tree, currentId), [tree, currentId]);

  const engineCurrent = engineEnabled && engine.fen === current.fen;
  const bestScore = engineCurrent ? engine.lines[0]?.score : undefined;
  const arrows: Arrow[] =
    engineCurrent && engine.lines[0]?.pv[0]
      ? [
          {
            startSquare: engine.lines[0].pv[0].slice(0, 2),
            endSquare: engine.lines[0].pv[0].slice(2, 4),
            color: 'rgba(80, 150, 230, 0.8)',
          },
        ]
      : [];

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setToast(`${label} copied`);
    } catch {
      setToast(`Could not copy ${label}`);
    }
  };

  const reset = () => {
    const fresh = createTree();
    setTree(fresh);
    setCurrentId(fresh.rootId);
  };

  const status = (() => {
    const chess = new Chess(current.fen);
    if (chess.isCheckmate()) return chess.turn() === 'w' ? 'Checkmate — Black wins' : 'Checkmate — White wins';
    if (chess.isStalemate()) return 'Stalemate';
    if (chess.isDraw()) return 'Draw';
    return null;
  })();

  const topColor = orientation === 'white' ? 'black' : 'white';
  const bottomColor = orientation;

  return (
    <div className="app" onClick={() => setMenu(null)}>
      <main className="board-column">
        <div className="board-frame">
          <div className="player">
            <span className={`player-avatar player-avatar-${topColor}`} />
            {topColor === 'white' ? 'White' : 'Black'}
          </div>
          <EvalBar score={bestScore} flipped={orientation === 'black'} />
          <AnalysisBoard
            fen={current.fen}
            lastMove={current.from && current.to ? { from: current.from, to: current.to } : null}
            orientation={orientation}
            arrows={arrows}
            onMove={play}
          />
          <div className="player">
            <span className={`player-avatar player-avatar-${bottomColor}`} />
            {bottomColor === 'white' ? 'White' : 'Black'}
          </div>
        </div>
      </main>

      <aside className="panel">
        <h1 className="panel-title">Analysis</h1>
        <EnginePanel
          engine={engineCurrent || !engineEnabled ? engine : { ...engine, lines: [], depth: 0 }}
          enabled={engineEnabled}
          maxDepth={ENGINE_OPTIONS.maxDepth}
          onToggle={() => setEngineEnabled((on) => !on)}
          onPlayLine={playLine}
        />
        <div className="opening" aria-live="polite">
          {status ? (
            <strong>{status}</strong>
          ) : opening ? (
            <>
              <span className="opening-eco">{opening.eco}</span>
              <span>{opening.name}</span>
            </>
          ) : (
            <span>{current.ply === 0 ? 'Starting position' : 'Out of opening book'}</span>
          )}
        </div>
        <div className="moves-scroll">
          <MoveList
            tree={tree}
            currentId={currentId}
            onSelect={setCurrentId}
            onContextMenu={(nodeId, x, y) => setMenu({ nodeId, x, y })}
          />
        </div>
        <nav className="nav" aria-label="Move navigation">
          <button type="button" className="nav-button" onClick={goStart} disabled={!current.parentId} title="First move (↑)">
            ⏮
          </button>
          <button type="button" className="nav-button" onClick={goBack} disabled={!current.parentId} title="Previous move (←)">
            ◀
          </button>
          <button type="button" className="nav-button" onClick={goForward} disabled={!current.children.length} title="Next move (→)">
            ▶
          </button>
          <button type="button" className="nav-button" onClick={goEnd} disabled={!current.children.length} title="Last move (↓)">
            ⏭
          </button>
        </nav>
        <div className="toolbar">
          <button type="button" className="btn" onClick={reset}>New</button>
          <button type="button" className="btn" onClick={() => setOrientation((o) => (o === 'white' ? 'black' : 'white'))} title="Flip board (F)">
            Flip
          </button>
          <button type="button" className="btn" onClick={() => setPgnOpen(true)}>Import PGN</button>
          <button type="button" className="btn" onClick={() => copy(toPgn(tree), 'PGN')}>Copy PGN</button>
          <button type="button" className="btn" onClick={() => copy(current.fen, 'FEN')}>Copy FEN</button>
        </div>
        <ChatPanel fen={current.fen} />
      </aside>

      {menu && (
        <div className="context-menu" style={{ left: menu.x, top: menu.y }} onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={() => {
              setTree(promoteNode(tree, menu.nodeId));
              setMenu(null);
            }}
          >
            Promote variation
          </button>
          <button
            type="button"
            className="danger"
            onClick={() => {
              const result = deleteNode(tree, menu.nodeId);
              setTree(result.tree);
              if (!result.tree.nodes[currentId]) setCurrentId(result.parentId);
              setMenu(null);
            }}
          >
            Delete from here
          </button>
        </div>
      )}

      {pgnOpen && (
        <PgnDialog
          onClose={() => setPgnOpen(false)}
          onImport={(imported) => {
            setTree(imported);
            setCurrentId(imported.rootId);
            setPgnOpen(false);
          }}
        />
      )}

      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}

function PgnDialog({ onClose, onImport }: { onClose: () => void; onImport: (tree: MoveTree) => void }) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    const result = importPgn(text);
    if ('error' in result) setError(result.error);
    else onImport(result.tree);
  };

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog" role="dialog" aria-label="Import PGN" onClick={(e) => e.stopPropagation()}>
        <h2>Import PGN or FEN</h2>
        <textarea
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={'1. e4 e5 2. Nf3 (2. f4 exf4) 2... Nc6 3. Bb5 *'}
        />
        {error && <p className="dialog-error">{error}</p>}
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="button" className="btn" onClick={submit} disabled={!text.trim()}>Import</button>
        </div>
      </div>
    </div>
  );
}
