import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { GamesPage, TournamentsPage, TournamentPage, PlayerPage } from './library/Catalog';
import { RatingsPage } from './library/RatingsPage';
import './library/library.css';
import { PreparePage } from './prepare/PreparePage';
import { clearAnalysisChanges, confirmDiscardAnalysis, hasUnsavedAnalysis } from './chess/unsavedAnalysis';
import { initialVariant } from './ui/variants';
import { ChatsPage } from './library/ChatsPage';
import './ui/variants.css';
import './library/nav-theme.css';

const App = lazy(() => import('./App'));
const GamePage = lazy(() => import('./library/GamePage').then((module) => ({ default:module.GamePage })));

export type Navigate = (path: string) => void;

export default function Root() {
  const [path, setPath] = useState(window.location.pathname);
  const [profileOpen, setProfileOpen] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>(() => { try { return localStorage.getItem('chessscope.siteTheme') === 'light' ? 'light' : 'dark'; } catch { return 'dark'; } });
  const pathRef = useRef(path);
  useEffect(() => { document.documentElement.dataset.uiPalette = initialVariant(); }, []);
  useEffect(() => { document.documentElement.dataset.theme = theme; try { localStorage.setItem('chessscope.siteTheme', theme); } catch { /* Theme still works for this visit. */ } }, [theme]);
  useEffect(() => {
    const close = (event: PointerEvent) => { if (!(event.target as HTMLElement).closest('.site-account')) setProfileOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setProfileOpen(false); };
    document.addEventListener('pointerdown', close); document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', escape); };
  }, []);
  useEffect(() => {
    const onPop = () => {
      const next = window.location.pathname;
      if (next === pathRef.current) return;
      if (!confirmDiscardAnalysis()) {
        window.history.pushState({}, '', pathRef.current);
        return;
      }
      clearAnalysisChanges();
      pathRef.current = next;
      setPath(next);
    };
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasUnsavedAnalysis()) return;
      event.preventDefault();
      event.returnValue = 'Your current moves and analysis will be lost.';
    };
    window.addEventListener('popstate', onPop);
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => { window.removeEventListener('popstate', onPop); window.removeEventListener('beforeunload', onBeforeUnload); };
  }, []);

  const navigate: Navigate = (next) => {
    if (next === pathRef.current || !confirmDiscardAnalysis()) return;
    clearAnalysisChanges();
    window.history.pushState({}, '', next);
    pathRef.current = next;
    setPath(next);
    setProfileOpen(false);
    window.scrollTo(0, 0);
  };
  const link = (next: string, label: string) => (
    <a href={next} className={(path === next || (next === '/tournaments' && path.startsWith('/tournaments/')) || (next === '/' && (path.startsWith('/games/') || path.startsWith('/players/')))) ? 'site-link active' : 'site-link'} onClick={(event) => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault(); navigate(next);
    }}>{label}</a>
  );

  let page;
  const game = /^\/games\/(\d+)\/?$/.exec(path);
  const tournament = /^\/tournaments\/(\d+)\/?$/.exec(path);
  const player = /^\/players\/(\d+)\/?$/.exec(path);
  if (game) page = <GamePage key={game[1]} id={Number(game[1])} navigate={navigate} />;
  else if (tournament) page = <TournamentPage key={tournament[1]} id={Number(tournament[1])} navigate={navigate} />;
  else if (player) page = <PlayerPage key={player[1]} id={Number(player[1])} navigate={navigate} />;
  else if (path === '/tournaments') page = <TournamentsPage navigate={navigate} />;
  else if (path === '/ratings') page = <RatingsPage navigate={navigate} />;
  else if (path === '/chats') page = <ChatsPage navigate={navigate} />;
  else if (path === '/analysis') page = <App />;
  else if (path === '/profile' || path === '/profile/') page = <UserProfile navigate={navigate} />;
  else if (path === '/settings') page = <main className="catalog-page"><div className="catalog-intro"><div><h1>Settings</h1><p>Choose how ChessScope looks on this device.</p></div></div><section className="site-settings-card"><h2>Appearance</h2><div className="site-theme-options"><button className={theme === 'dark' ? 'active' : ''} onClick={() => setTheme('dark')}>Dark</button><button className={theme === 'light' ? 'active' : ''} onClick={() => setTheme('light')}>Light</button></div></section></main>;
  else if (path === '/prepare' || path === '/prepare/') page = <PreparePage navigate={navigate} />;
  else page = <GamesPage navigate={navigate} />;

  return <div className="site-shell">
    <header className="site-header">
      <a href="/" className="site-brand" aria-label="ChessScope home" title="ChessScope" onClick={(event) => { event.preventDefault(); navigate('/'); }}>
        <span className="site-mark" aria-hidden="true">♞</span><span>ChessScope</span>
      </a>
      <nav className="site-nav" aria-label="Main navigation">
        {link('/', 'Games')}{link('/tournaments', 'Tournaments')}{link('/ratings', 'Ratings')}{link('/analysis', 'Board')}
        {link('/prepare/', 'Prepare')}
      </nav>
      <div className="site-header-actions"><button className="site-theme-toggle" type="button" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}>{theme === 'dark' ? '☼' : '☾'}</button>
        <div className="site-account"><button type="button" className="site-account-trigger" aria-expanded={profileOpen} aria-haspopup="menu" onClick={() => setProfileOpen(!profileOpen)}><span className="site-account-avatar">♟</span><span>Profile</span><span aria-hidden="true">⌄</span></button>
          {profileOpen && <div className="site-account-menu" role="menu"><button role="menuitem" onClick={() => navigate('/profile')}>Profile</button><button role="menuitem" onClick={() => navigate('/settings')}>Settings</button><button role="menuitem" onClick={() => navigate('/chats')}>Chats</button><button role="menuitem" disabled title="Account sign-out will be available with sign-in support">Sign out</button></div>}</div>
      </div>
    </header>
    <Suspense fallback={<main className="catalog-page"><div className="catalog-empty">Loading board…</div></main>}>{page}</Suspense>
  </div>;
}

function UserProfile({navigate}:{navigate:Navigate}) {
  const [items,setItems]=useState<{id:string;title:string;updatedAt:string;tree:import('./chess/tree').MoveTree}[]>([]);
  useEffect(()=>{try{const saved=JSON.parse(localStorage.getItem('chessscope.savedAnalyses')||'[]');setItems(Array.isArray(saved)?saved:[])}catch{setItems([])}},[]);
  return <main className="catalog-page"><div className="catalog-intro"><div><h1>My profile</h1><p>Your saved chess analyses.</p></div></div>{items.length?<div className="chat-list">{items.map(item=><button key={item.id} onClick={()=>{try{sessionStorage.setItem('chessscope.openAnalysis',JSON.stringify(item.tree))}catch{}navigate('/analysis')}}><span className="chat-list-icon">♟</span><span><strong>{item.title}</strong><small>Saved {new Date(item.updatedAt).toLocaleString()} · {Object.keys(item.tree.nodes).length} positions</small></span><span>↗</span></button>)}</div>:<div className="catalog-empty">No saved analyses yet. Use “Save analysis” on the board.</div>}</main>
}
