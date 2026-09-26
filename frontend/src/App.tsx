import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Arrow } from 'react-chessboard';
import { Chess } from 'chess.js';
import './App.css';
import './tree-and-tabs.css';
import { AnalysisBoard } from './components/AnalysisBoard';
import { ChatPanel } from './components/ChatPanel';
import { EnginePanel } from './components/EnginePanel';
import { EvalBar } from './components/EvalBar';
import { LineChooser } from './components/LineChooser';
import { MoveList } from './components/MoveList';
import { ShortcutHelp } from './components/ShortcutHelp';
import { TreeView } from './components/TreeView';
import { layoutTree } from './chess/layout';
import { openingAt } from './chess/openings';
import { importPgn } from './chess/pgn';
import { MOCK_PGN } from './dev/mockGame';
import {
  type MoveInput,
  type MoveTree,
  addMove,
  createTree,
  deleteNode,
  forkAbove,
  lineEnd,
  nextFork,
  promoteNode,
  renameNode,
  switchLine,
  toPgn,
} from './chess/tree';
import { type EngineState, StockfishEngine } from './engine/stockfish';
import type { GameDetail } from './library/api';

const ENGINE_OPTIONS = { multiPv: 3, maxDepth: 22 };
type PanelTab = 'moves' | 'tree';

function storedTab(): PanelTab {
  try {
    return localStorage.getItem('chessscope.panelTab') === 'tree' ? 'tree' : 'moves';
  } catch {
    return 'moves';
  }
}

export default function App({ initialTree, game }: { initialTree?: MoveTree; game?: GameDetail }) {
  const [tree, setTree] = useState<MoveTree>(() => initialTree ?? createTree());
  const [currentId, setCurrentId] = useState(tree.rootId);
  const [orientation, setOrientation] = useState<'white' | 'black'>('white');
  const [engineEnabled, setEngineEnabled] = useState(true);
  const [engine, setEngine] = useState<EngineState>({ fen: null, depth: 0, lines: [], status: 'loading' });
  const [menu, setMenu] = useState<{ nodeId: string; x: number; y: number } | null>(null);
  const [pgnOpen, setPgnOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [tab, setTab] = useState<PanelTab>(storedTab);
  const [chooser, setChooser] = useState<{ forkId: string; index: number; x: number; y: number } | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);

  const current = tree.nodes[currentId];
  const layout = useMemo(() => layoutTree(tree), [tree]);
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
    try {
      localStorage.setItem('chessscope.panelTab', tab);
    } catch {
      // Storage may be unavailable (private mode); the tab just isn't remembered.
    }
  }, [tab]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 1800);
    return () => clearTimeout(timer);
  }, [toast]);

  const select = (nodeId: string) => {
    setChooser(null);
    setCurrentId(nodeId);
  };

  const play = useCallback(
    (move: MoveInput): boolean => {
      const result = addMove(tree, currentId, move);
      if (!result) return false;
      setTree(result.tree);
      setChooser(null);
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
    const first = nextTree.nodes[currentId].children.find((id) => nextTree.nodes[id].uci === uciMoves[0]);
    if (first) select(first);
  };

  const goBack = () => current.parentId && select(current.parentId);
  const goStart = () => select(tree.rootId);
  const goEnd = () => select(lineEnd(tree, currentId));
  const flip = () => setOrientation((o) => (o === 'white' ? 'black' : 'white'));
  const toggleTab = () => setTab((t) => (t === 'moves' ? 'tree' : 'moves'));

  /** Opens the line chooser under the current move (list or graph). */
  const openChooser = () => {
    const anchorEl =
      document.querySelector('.move-current') ??
      document.querySelector('.tree-node-current') ??
      document.querySelector('.moves-scroll');
    const rect = anchorEl?.getBoundingClientRect();
    setChooser({
      forkId: currentId,
      index: 0,
      x: rect ? Math.min(rect.left, window.innerWidth - 280) : window.innerWidth / 2,
      y: rect ? Math.min(rect.bottom + 6, window.innerHeight - 200) : window.innerHeight / 2,
    });
  };

  const goForward = () => {
    if (chooser) select(tree.nodes[chooser.forkId].children[chooser.index]);
    else if (current.children.length > 1) openChooser();
    else if (current.children[0]) select(current.children[0]);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest('input, textarea') || pgnOpen || renaming) return;
      if (helpOpen) {
        if (event.key === 'Escape' || event.key === '?') setHelpOpen(false);
        return;
      }
      const ctrl = event.ctrlKey || event.metaKey;
      let action: (() => void) | undefined;

      if (chooser && !ctrl && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
        const count = tree.nodes[chooser.forkId].children.length;
        const step = event.key === 'ArrowDown' ? 1 : -1;
        action = () => setChooser({ ...chooser, index: (chooser.index + step + count) % count });
      } else if (ctrl) {
        const ctrlActions: Record<string, () => void> = {
          ArrowUp: () => select(switchLine(tree, currentId, -1)),
          ArrowDown: () => select(switchLine(tree, currentId, 1)),
          ArrowLeft: () => select(forkAbove(tree, currentId)?.forkId ?? tree.rootId),
          ArrowRight: () => select(nextFork(tree, currentId) ?? lineEnd(tree, currentId)),
        };
        action = ctrlActions[event.key];
      } else if (!event.altKey) {
        const actions: Record<string, () => void> = {
          ArrowLeft: () => (chooser ? setChooser(null) : goBack()),
          ArrowRight: goForward,
          Escape: () => {
            setChooser(null);
            setMenu(null);
          },
          Home: goStart,
          End: goEnd,
          f: flip,
          F: flip,
          t: toggleTab,
          T: toggleTab,
          '?': () => setHelpOpen(true),
        };
        if (chooser) actions.Enter = goForward;
        action = actions[event.key];
      }

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
  const arrows: Arrow[] = [];
  if (engineCurrent && engine.lines[0]?.pv[0]) {
    const best = engine.lines[0].pv[0];
    arrows.push({ startSquare: best.slice(0, 2), endSquare: best.slice(2, 4), color: 'rgba(80, 150, 230, 0.8)' });
  }
  // Preview the move the chooser is pointing at.
  if (chooser) {
    const preview = tree.nodes[tree.nodes[chooser.forkId].children[chooser.index]];
    if (preview?.from && preview.to) {
      arrows.push({ startSquare: preview.from, endSquare: preview.to, color: 'rgba(250, 190, 40, 0.9)' });
    }
  }

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
    select(fresh.rootId);
  };

  /** Dev helper: replace the analysis with the mock game and jump to its last move. */
  const loadMock = () => {
    const result = importPgn(MOCK_PGN);
    if ('error' in result) {
      setToast(`Mock PGN failed: ${result.error}`);
      return;
    }
    setTree(result.tree);
    select(lineEnd(result.tree, result.tree.rootId));
    setToast('Mock game loaded');
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
  const sideLines = layout.lines.length - 1;
  const openMenu = (nodeId: string, x: number, y: number) => setMenu({ nodeId, x, y });

  return (
    <div
      className="app"
      onClick={() => {
        setMenu(null);
        setChooser(null);
      }}
    >
      <ChatPanel fen={current.fen} />
      <main className="board-column">
        <div className="board-frame">
          <div className="player">
            <span className={`player-avatar player-avatar-${topColor}`} />
            {game && (topColor === 'white' ? game.white_id : game.black_id)
              ? <a className="board-player-link" href={`/players/${topColor === 'white' ? game.white_id : game.black_id}`}>{topColor === 'white' ? game.white_name : game.black_name}</a>
              : topColor === 'white' ? (game?.white_name || 'Белые') : (game?.black_name || 'Чёрные')}
            {game && <span className="player-rating">{topColor === 'white' ? game.white_rating : game.black_rating}</span>}
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
            {game && (bottomColor === 'white' ? game.white_id : game.black_id)
              ? <a className="board-player-link" href={`/players/${bottomColor === 'white' ? game.white_id : game.black_id}`}>{bottomColor === 'white' ? game.white_name : game.black_name}</a>
              : bottomColor === 'white' ? (game?.white_name || 'Белые') : (game?.black_name || 'Чёрные')}
            {game && <span className="player-rating">{bottomColor === 'white' ? game.white_rating : game.black_rating}</span>}
          </div>
        </div>
      </main>

      <aside className="panel">
        <h2 className="panel-title">{game ? `${game.result} · ${game.played_on || 'Дата неизвестна'}` : 'Анализ'}</h2>
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

        <div className="tabs" role="tablist" aria-label="Move view">
          {(['moves', 'tree'] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={tab === value}
              className={`tab${tab === value ? ' tab-active' : ''}`}
              onClick={() => setTab(value)}
            >
              {value === 'moves' ? 'Ходы' : 'Дерево'}
            </button>
          ))}
          <span className="tabs-meta">{sideLines > 0 ? `${sideLines} side line${sideLines > 1 ? 's' : ''}` : ''}</span>
          <button type="button" className="tabs-mock" onClick={loadMock} title="Загрузить пример партии с вариантами">Mock data</button>
          <button type="button" className="tabs-help" onClick={() => setHelpOpen(true)} title="Keyboard shortcuts (?)">
            ?
          </button>
        </div>
        <div className={`moves-scroll${tab === 'tree' ? ' moves-scroll-tree' : ''}`}>
          {tab === 'moves' ? (
            <MoveList tree={tree} layout={layout} currentId={currentId} onSelect={select} onContextMenu={openMenu} />
          ) : (
            <TreeView tree={tree} layout={layout} currentId={currentId} onSelect={select} onContextMenu={openMenu} />
          )}
        </div>

        <nav className="nav" aria-label="Move navigation">
          <button type="button" className="nav-button" onClick={goStart} disabled={!current.parentId} title="First move (Home)">
            ⏮
          </button>
          <button type="button" className="nav-button" onClick={goBack} disabled={!current.parentId} title="Previous move (←)">
            ◀
          </button>
          <button
            type="button"
            className="nav-button"
            onClick={(event) => {
              event.stopPropagation();
              goForward();
            }}
            disabled={!current.children.length}
            title="Next move (→)"
          >
            ▶
          </button>
          <button type="button" className="nav-button" onClick={goEnd} disabled={!current.children.length} title="End of line (End)">
            ⏭
          </button>
        </nav>
        <div className="toolbar">
          <button type="button" className="btn" onClick={reset}>Новая</button>
          <button type="button" className="btn" onClick={flip} title="Перевернуть доску (F)">Повернуть</button>
          <button type="button" className="btn" onClick={() => setPgnOpen(true)}>Импорт PGN</button>
          <button type="button" className="btn" onClick={() => copy(toPgn(tree), 'PGN')}>Копировать PGN</button>
          <button type="button" className="btn" onClick={() => copy(current.fen, 'FEN')}>Копировать FEN</button>
        </div>
      </aside>

      {menu && (
        <div className="context-menu" style={{ left: menu.x, top: menu.y }} onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={() => {
              setRenaming(menu.nodeId);
              setMenu(null);
            }}
          >
            Name this line…
          </button>
          <button
            type="button"
            onClick={() => {
              setTree(promoteNode(tree, menu.nodeId));
              setMenu(null);
            }}
          >
            Make main continuation
          </button>
          <button
            type="button"
            className="danger"
            onClick={() => {
              const result = deleteNode(tree, menu.nodeId);
              setTree(result.tree);
              if (!result.tree.nodes[currentId]) select(result.parentId);
              setMenu(null);
            }}
          >
            Delete from here
          </button>
        </div>
      )}

      {chooser && (
        <LineChooser
          tree={tree}
          layout={layout}
          forkId={chooser.forkId}
          selected={chooser.index}
          anchor={chooser}
          onPick={(index) => select(tree.nodes[chooser.forkId].children[index])}
        />
      )}

      {pgnOpen && (
        <PgnDialog
          onClose={() => setPgnOpen(false)}
          onImport={(imported) => {
            setTree(imported);
            select(imported.rootId);
            setPgnOpen(false);
          }}
        />
      )}

      {renaming && tree.nodes[renaming] && (
        <RenameDialog
          initial={tree.nodes[renaming].name ?? ''}
          san={tree.nodes[renaming].san ?? ''}
          onClose={() => setRenaming(null)}
          onSave={(name) => {
            setTree(renameNode(tree, renaming, name));
            setRenaming(null);
          }}
        />
      )}

      {helpOpen && <ShortcutHelp onClose={() => setHelpOpen(false)} />}

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

function RenameDialog({
  initial,
  san,
  onClose,
  onSave,
}: {
  initial: string;
  san: string;
  onClose: () => void;
  onSave: (name: string) => void;
}) {
  const [name, setName] = useState(initial);
  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <form
        className="dialog"
        role="dialog"
        aria-label="Name this line"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          onSave(name);
        }}
      >
        <h2>Name the line starting with {san}</h2>
        <input
          className="dialog-input"
          autoFocus
          value={name}
          maxLength={40}
          placeholder="e.g. Queen sac, Main prep, Safe line"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && onClose()}
        />
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn">Save</button>
        </div>
      </form>
    </div>
  );
}
