import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type CSSProperties, type PointerEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { Arrow } from 'react-chessboard';
import { Chess } from 'chess.js';
import './App.css';
import './tree-and-tabs.css';
import { UiSwitcher } from './ui/UiSwitcher';
import { type Section, UI_VARIANTS, initialVariant, rememberVariant } from './ui/variants';
import './ui/variants.css';
import { AnalysisBoard } from './components/AnalysisBoard';
import { ChatPanel } from './components/ChatPanel';
import { EnginePanel } from './components/EnginePanel';
import { EvalBar } from './components/EvalBar';
import { BoardSettingsDialog } from './settings/BoardSettingsDialog';
import { useBoardSettings, withAlpha } from './settings/boardSettings';
import { LineChooser } from './components/LineChooser';
import { MoveList } from './components/MoveList';
import { PlayerAvatar } from './components/PlayerAvatar';
import { ShortcutHelp } from './components/ShortcutHelp';
import { TreeView } from './components/TreeView';
import { layoutTree } from './chess/layout';
import { classifyMove, type MoveQuality, type PositionReview } from './chess/moveQuality';
import { openingAt } from './chess/openings';
import { importPgn } from './chess/pgn';
import { MOCK_PGN } from './dev/mockGame';
import {
  type MoveInput,
  type MoveTree,
  START_FEN,
  addMove,
  createTree,
  deleteNode,
  forkAbove,
  lineEnd,
  nextFork,
  promoteNode,
  renameNode,
  setShapes,
  switchLine,
  toPgn,
} from './chess/tree';
import { type EngineState, StockfishEngine } from './engine/stockfish';
import type { GameDetail } from './library/api';

const ENGINE_OPTIONS = { multiPv: 3, maxDepth: 30 };
const MOCK_GAME = {
  white_id: 1503014, black_id: 4168119, white_name: 'Carlsen, Magnus', black_name: 'Nepomniachtchi, Ian',
  white_rating: 2855, black_rating: 2782, white_fed: 'NOR', black_fed: 'RUS', white_flag: '🇳🇴', black_flag: '🏳️',
  result: '1-0', played_on: '2021-12-03',
} as GameDetail;
type PanelTab = 'moves' | 'tree';

function PlayerStrip({ game, color, children }: { game?: GameDetail; color: 'white' | 'black'; children?: ReactNode }) {
  const id = color === 'white' ? game?.white_id : game?.black_id;
  const name = color === 'white' ? game?.white_name : game?.black_name;
  const federation = color === 'white' ? game?.white_fed : game?.black_fed;
  const flag = color === 'white' ? game?.white_flag : game?.black_flag;
  const rating = color === 'white' ? game?.white_rating : game?.black_rating;
  return <div className="player">
    <PlayerAvatar id={id} name={name} className={`player-avatar-${color}`} />
    <div className="player-identity">
      {id ? <a className="board-player-link" href={`/players/${id}`}>{name || (color === 'white' ? 'White' : 'Black')}</a>
        : <span>{name || (color === 'white' ? 'White' : 'Black')}</span>}
      {game && <span className="player-details"><span className="player-federation" aria-label={federation || 'Unknown federation'}><span className="player-flag" aria-hidden="true">{federation === 'RUS' ? '🏳️' : flag || '◇'}</span>{federation || 'Unknown federation'}</span><span>{rating ? `${rating} Elo` : 'Unrated'}</span></span>}
    </div>
    {children}
  </div>;
}

function storedTab(): PanelTab {
  try {
    return localStorage.getItem('chessscope.panelTab') === 'tree' ? 'tree' : 'moves';
  } catch {
    return 'moves';
  }
}

function storedWorkspace() {
  try {
    const saved = JSON.parse(localStorage.getItem('chessscope.workspace') || '{}');
    return { chat: Number(saved.chat) || 20, moves: Number(saved.moves) || 35, chatOpen: saved.chatOpen !== false };
  } catch { return { chat: 20, moves: 35, chatOpen: true }; }
}

function storedMoveIcons() {
  try { return localStorage.getItem('chessscope.moveIcons') !== 'false'; }
  catch { return true; }
}

export default function App({ initialTree, game, onMockChange }: { initialTree?: MoveTree; game?: GameDetail; onMockChange?: (loaded: boolean) => void }) {
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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const boardSettings = useBoardSettings();
  const [mockLoaded, setMockLoaded] = useState(false);
  const [variantId, setVariantId] = useState(initialVariant);
  const variant = UI_VARIANTS.find((item) => item.id === variantId) ?? UI_VARIANTS[0];
  const changeVariant = (id: string) => { setVariantId(id); rememberVariant(id); };
  const [workspace, setWorkspace] = useState(storedWorkspace);
  const [moveIcons, setMoveIcons] = useState(storedMoveIcons);
  const [reviews, setReviews] = useState<Record<string, PositionReview>>({});
  const appRef = useRef<HTMLDivElement>(null);
  const resizing = useRef<'chat' | 'moves' | null>(null);

  const current = tree.nodes[currentId];
  const layout = useMemo(() => layoutTree(tree), [tree]);
  const engineRef = useRef<StockfishEngine | null>(null);

  useEffect(() => {
    const instance = new StockfishEngine((next) => {
      setEngine(next);
      const line = next.lines[0];
      if (!next.fen || !line || line.depth < 16 || !line.pv[0]) return;
      setReviews((previous) => {
        if ((previous[next.fen!]?.depth ?? 0) >= line.depth) return previous;
        return { ...previous, [next.fen!]: { score: line.score, depth: line.depth, bestUci: line.pv[0], pv: line.pv } };
      });
    }, ENGINE_OPTIONS);
    engineRef.current = instance;
    return () => instance.destroy();
  }, []);

  useEffect(() => {
    if (engineEnabled) engineRef.current?.analyse(current.fen);
    else engineRef.current?.stop();
  }, [current.fen, engineEnabled]);

  useEffect(() => {
    try { localStorage.setItem('chessscope.workspace', JSON.stringify(workspace)); }
    catch { /* Storage is optional. */ }
  }, [workspace]);

  useEffect(() => {
    try { localStorage.setItem('chessscope.moveIcons', String(moveIcons)); }
    catch { /* Storage is optional. */ }
  }, [moveIcons]);

  useEffect(() => {
    const move = (event: globalThis.PointerEvent) => {
      if (!resizing.current || !appRef.current) return;
      const rect = appRef.current.getBoundingClientRect();
      const position = 100 * (event.clientX - rect.left) / rect.width;
      const chatMin = 190 / rect.width * 100;
      const movesMin = 320 / rect.width * 100;
      const boardMin = 340 / rect.width * 100;
      setWorkspace((previous) => resizing.current === 'chat'
        ? { ...previous, chat: Math.max(chatMin, Math.min(position, 100 - previous.moves - boardMin)) }
        : { ...previous, moves: Math.max(movesMin, Math.min(100 - position, 100 - (previous.chatOpen ? previous.chat : 0) - boardMin)) });
    };
    const stop = () => { resizing.current = null; document.body.classList.remove('workspace-resizing'); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
    window.addEventListener('blur', stop);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', stop); window.removeEventListener('pointercancel', stop); window.removeEventListener('blur', stop); };
  }, []);

  const beginResize = (side: 'chat' | 'moves', event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    resizing.current = side;
    document.body.classList.add('workspace-resizing');
  };

  const resizeWithKeyboard = (side: 'chat' | 'moves', event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    event.stopPropagation();
    const width = appRef.current?.getBoundingClientRect().width || window.innerWidth;
    const step = 160 / width * 100 * (event.key === 'ArrowRight' ? 1 : -1);
    setWorkspace((previous) => side === 'chat'
      ? { ...previous, chat: Math.max(190 / width * 100, Math.min(previous.chat + step, 100 - previous.moves - 340 / width * 100)) }
      : { ...previous, moves: Math.max(320 / width * 100, Math.min(previous.moves - step, 100 - (previous.chatOpen ? previous.chat : 0) - 340 / width * 100)) });
  };

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
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('input, textarea, select, [contenteditable], [role="separator"]') || pgnOpen || renaming || settingsOpen) return;
      // Changing the position mid-drag would pull the square out from under the piece.
      if (document.querySelector('#analysis-board-board [aria-pressed="true"]')) return;
      // The promotion picker owns the keyboard until a piece is chosen or it is closed.
      if (document.querySelector('[aria-label="Choose promotion piece"]')) return;
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
          c: () => setWorkspace((previous) => ({ ...previous, chatOpen: !previous.chatOpen })),
          C: () => setWorkspace((previous) => ({ ...previous, chatOpen: !previous.chatOpen })),
          q: () => setMoveIcons((previous) => !previous),
          Q: () => setMoveIcons((previous) => !previous),
          '[': () => select(forkAbove(tree, currentId)?.forkId ?? tree.rootId),
          ']': () => select(nextFork(tree, currentId) ?? lineEnd(tree, currentId)),
          '?': () => setHelpOpen(true),
        };
        if ((tab === 'tree' || variant.splitTree) && !chooser) {
          actions.ArrowUp = () => select(switchLine(tree, currentId, -1));
          actions.ArrowDown = () => select(switchLine(tree, currentId, 1));
        }
        if (chooser) actions.Enter = goForward;
        action = actions[event.key];
      }

      if (action) {
        event.preventDefault();
        action();
      }
    };
    // Capture phase: the board swallows Space/Enter on its pieces, and the chooser's
    // Enter must still work while a clicked piece holds focus.
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  const opening = useMemo(() => openingAt(tree, currentId), [tree, currentId]);

  const engineCurrent = engineEnabled && engine.fen === current.fen;
  const bestScore = engineCurrent ? engine.lines[0]?.score : undefined;
  const arrows: Arrow[] = [];
  if (engineCurrent && engine.lines[0]?.pv[0]) {
    const best = engine.lines[0].pv[0];
    arrows.push({ startSquare: best.slice(0, 2), endSquare: best.slice(2, 4), color: withAlpha(boardSettings.arrowColor, 0.8) });
  }
  // Preview the move the chooser is pointing at.
  if (chooser) {
    const preview = tree.nodes[tree.nodes[chooser.forkId].children[chooser.index]];
    if (preview?.from && preview.to) {
      // One arrow per square pair: the board keys arrows by squares, and the preview wins.
      const same = arrows.findIndex((a) => a.startSquare === preview.from && a.endSquare === preview.to);
      if (same >= 0) arrows.splice(same, 1);
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
    setMockLoaded(false);
    onMockChange?.(false);
  };

  /** Dev helper: load every variation and start at the first branch. */
  const loadMock = () => {
    const result = importPgn(MOCK_PGN);
    if ('error' in result) {
      setToast(`Mock PGN failed: ${result.error}`);
      return;
    }
    setTree(result.tree);
    select(nextFork(result.tree, result.tree.rootId) ?? result.tree.rootId);
    setTab('tree');
    setMockLoaded(true);
    onMockChange?.(true);
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
  const activeGame = game ?? (mockLoaded ? MOCK_GAME : undefined);
  const sideLines = layout.lines.length - 1;
  const positionCount = Object.keys(tree.nodes).length;
  const qualities = useMemo(() => {
    if (!moveIcons) return {};
    const values: Record<string, MoveQuality> = {};
    for (const id of Object.keys(tree.nodes)) {
      const quality = classifyMove(tree, id, reviews);
      if (quality) values[id] = quality;
    }
    return values;
  }, [tree, reviews, moveIcons]);
  const openMenu = (nodeId: string, x: number, y: number) => setMenu({ nodeId, x, y });

  const workspaceStyle = {
    gridTemplateColumns: workspace.chatOpen
      ? `${workspace.chat}% 6px minmax(0, 1fr) 6px ${workspace.moves}%`
      : `minmax(0, 1fr) 6px ${workspace.moves}%`,
  } satisfies CSSProperties;

  const moveView = variant.splitTree ? 'moves' : tab;
  const sections: Record<Section, ReactNode> = {
    board: (<main className="board-column">
        {!workspace.chatOpen && <button type="button" className="show-chat" onClick={() => setWorkspace((previous) => ({ ...previous, chatOpen: true }))}>Open coach</button>}
        <div className={`board-frame${boardSettings.showEvalBar ? '' : ' board-frame-no-eval'}`}>
          <PlayerStrip game={activeGame} color={topColor} />
          {boardSettings.showEvalBar && <EvalBar score={bestScore} flipped={orientation === 'black'} />}
          <AnalysisBoard
            fen={current.fen}
            lastMove={current.from && current.to ? { from: current.from, to: current.to } : null}
            orientation={orientation}
            arrows={arrows}
            shapes={current.shapes ?? []}
            onShapesChange={(shapes) => setTree((t) => setShapes(t, currentId, shapes))}
            onMove={play}
          />
          <PlayerStrip game={activeGame} color={bottomColor}>
              <button
                type="button"
                className="board-settings-button"
                onClick={(event) => {
                  event.stopPropagation();
                  setSettingsOpen(true);
                }}
                title="Доска и фигуры"
                aria-label="Настройки доски и фигур"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
              </button>
          </PlayerStrip>
        </div>
      </main>),
    title: <h1 className="panel-title">Analysis</h1>,
    engine: (<EnginePanel
          engine={engineCurrent || !engineEnabled ? engine : { ...engine, lines: [], depth: 0 }}
          enabled={engineEnabled}
          maxDepth={ENGINE_OPTIONS.maxDepth}
          onToggle={() => setEngineEnabled((on) => !on)}
          onPlayLine={playLine}
        />),
    opening: (<div className="opening" aria-live="polite">
          {status ? (
            <strong>{status}</strong>
          ) : opening ? (
            <>
              <span className="opening-eco">{opening.eco}</span>
              <span>{opening.name}</span>
            </>
          ) : (
            <span>{tree.nodes[tree.rootId].fen !== START_FEN ? 'Custom position' : current.ply === 0 ? 'Starting position' : 'Out of opening book'}</span>
          )}
        </div>),
    moves: (<div className="moves-section"><div className="tabs" role="tablist" aria-label="Move view">
          {(variant.splitTree ? (['moves'] as const) : (['moves', 'tree'] as const)).map((value) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={tab === value}
              className={`tab${tab === value ? ' tab-active' : ''}`}
              onClick={() => setTab(value)}
            >
              {value === 'moves' ? 'Moves' : 'Tree'}
            </button>
          ))}
          <span className="tabs-meta" title="All imported positions, including variations">{positionCount} nodes · {sideLines} lines</span>
          <button type="button" className={`tabs-icons${moveIcons ? ' tabs-icons-on' : ''}`} onClick={() => setMoveIcons((value) => !value)} title="Toggle local move quality estimates (Q); labels appear after both positions reach depth 16, Brilliant after depth 22" aria-pressed={moveIcons}>!?</button>
          <button type="button" className="tabs-mock" onClick={loadMock} title="Load a sample game with variations">Mock data</button>
          <button type="button" className="tabs-help" onClick={() => setHelpOpen(true)} title="Keyboard shortcuts (?)">
            ?
          </button>
        </div>
        <div className={`moves-scroll${moveView === 'tree' ? ' moves-scroll-tree' : ''}`}>
          {moveView === 'moves' ? (
            <MoveList tree={tree} layout={layout} currentId={currentId} qualities={qualities} onSelect={select} onContextMenu={openMenu} />
          ) : (
            <TreeView key={mockLoaded ? 'mock' : 'game'} tree={tree} layout={layout} currentId={currentId} qualities={qualities} onSelect={select} onContextMenu={openMenu} />
          )}
        </div></div>),
    nav: (<div className="nav-section"><nav className="nav" aria-label="Move navigation">
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
          <label className="layout-picker">Layout <select aria-label="Workspace layout" value={variant.id} onChange={(event) => changeVariant(event.target.value)}>{UI_VARIANTS.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <button type="button" className="btn" onClick={reset}>New</button>
          <button type="button" className="btn" onClick={flip} title="Flip board (F)">Flip</button>
          <button type="button" className="btn" onClick={() => setPgnOpen(true)}>Import PGN</button>
          <button type="button" className="btn" onClick={() => copy(toPgn(tree), 'PGN')}>Copy PGN</button>
          <button type="button" className="btn" onClick={() => copy(current.fen, 'FEN')}>Copy FEN</button>
        </div></div>),
    chat: workspace.chatOpen ? <ChatPanel fen={current.fen} onClose={() => setWorkspace((previous) => ({ ...previous, chatOpen: false }))} /> : null,
    treeDock: <section className="tree-dock" aria-label="Tree of lines">
      <header className="tree-dock-header"><span>Lines</span><span className="tabs-meta">{positionCount} nodes · {sideLines} lines</span></header>
      <TreeView key={mockLoaded ? 'mock' : 'game'} tree={tree} layout={layout} currentId={currentId} qualities={qualities} onSelect={select} onContextMenu={openMenu} />
    </section>,
  };

  return (
    <div
      className={`app${import.meta.env.DEV ? ' app-with-switcher' : ''}`}
      data-ui={variant.id}
      ref={appRef}
      style={variant.id === 'workspace' ? workspaceStyle : undefined}
      onClick={() => {
        setMenu(null);
        setChooser(null);
      }}
    >
      {variant.id === 'workspace' ? <>
        {workspace.chatOpen && <>
          {sections.chat}
          <div className="workspace-resizer" role="separator" aria-label="Resize coach and board" aria-orientation="vertical" aria-valuenow={Math.round(workspace.chat)} tabIndex={0} onPointerDown={(event) => beginResize('chat', event)} onKeyDown={(event) => resizeWithKeyboard('chat', event)} />
        </>}
        {sections.board}
        <div className="workspace-resizer" role="separator" aria-label="Resize board and moves" aria-orientation="vertical" aria-valuenow={Math.round(workspace.moves)} tabIndex={0} onPointerDown={(event) => beginResize('moves', event)} onKeyDown={(event) => resizeWithKeyboard('moves', event)} />
        <aside className="panel">{sections.engine}{sections.opening}{sections.moves}{sections.nav}</aside>
      </> : variant.columns.map((column, index) => (
        <div key={`${variant.id}-${index}`} className={`ui-column ui-column-${index}${column.includes('board') ? ' ui-column-board' : ' panel'}`}>
          {column.map((section) => <Fragment key={section}>{sections[section]}</Fragment>)}
        </div>
      ))}

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
            setMockLoaded(false);
            onMockChange?.(false);
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

      {settingsOpen && <BoardSettingsDialog onClose={() => setSettingsOpen(false)} />}

      {import.meta.env.DEV && <UiSwitcher current={variant.id} onChange={changeVariant} />}

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
