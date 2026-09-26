import { lazy, Suspense, useEffect, useState } from 'react';
import { GamesPage, TournamentsPage, TournamentPage, PlayerPage } from './library/Catalog';
import { RatingsPage } from './library/RatingsPage';
import './library/library.css';
import { PreparePage } from './prepare/PreparePage';

const App = lazy(() => import('./App'));
const GamePage = lazy(() => import('./library/GamePage').then((module) => ({ default:module.GamePage })));

export type Navigate = (path: string) => void;

export default function Root() {
  const [path, setPath] = useState(window.location.pathname);
  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const navigate: Navigate = (next) => {
    if (next === path) return;
    window.history.pushState({}, '', next);
    setPath(next);
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
  else if (path === '/analysis') page = <App />;
  else if (path === '/prepare' || path === '/prepare/') page = <PreparePage navigate={navigate} />;
  else page = <GamesPage navigate={navigate} />;

  return <div className="site-shell">
    <header className="site-header">
      <a href="/" className="site-brand" onClick={(event) => { event.preventDefault(); navigate('/'); }}>
        <span className="site-mark" aria-hidden="true">♞</span><span>ChessScope</span>
      </a>
      <nav className="site-nav" aria-label="Main navigation">
        {link('/', 'Games')}{link('/tournaments', 'Tournaments')}{link('/ratings', 'Ratings')}{link('/analysis', 'Board')}
        {link('/prepare/', 'Prepare')}
      </nav>
      <span className="site-edition">Local library</span>
    </header>
    <Suspense fallback={<main className="catalog-page"><div className="catalog-empty">Loading board…</div></main>}>{page}</Suspense>
  </div>;
}
