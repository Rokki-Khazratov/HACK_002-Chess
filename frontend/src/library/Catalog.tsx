import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import type { Navigate } from '../Root';
import { PlayerAvatar } from '../components/PlayerAvatar';
import { formatNumber, getJson } from './api';
import type { GameList, GameSummary, Overview, PlayerDetail, TournamentDetail, TournamentList } from './api';

type Filters = {
  player: string; event: string; yearFrom: string; yearTo: string; federation: string;
  color: string; result: string; minRating: string; eco: string; opening: string;
  source: string; dateFrom: string; dateTo: string;
};
const empty: Filters = { player:'', event:'', yearFrom:'', yearTo:'', federation:'', color:'both',
  result:'', minRating:'', eco:'', opening:'', source:'', dateFrom:'', dateTo:'' };

function date(value: string | null) { return value || 'Date unknown'; }
function player(name: string | null, flag: string | null) { return <>{flag && <span className="catalog-flag" aria-hidden="true">{flag}</span>}{name || '?'}</>; }

function GameRows({ games }: { games: GameSummary[] }) {
  return <div className="catalog-rows">
    {games.map((game) => <a key={game.id} className="catalog-row" href={`/games/${game.id}`} target="_blank" rel="noopener noreferrer" title="Open game in a new tab">
      <span className="catalog-row-main"><span className="catalog-row-event">{game.tournament || 'Tournament unknown'}</span>
        <span className="catalog-row-players">{player(game.white_name, game.white_flag)}<span className="versus">—</span>{player(game.black_name, game.black_flag)}</span>
        <span className="catalog-row-meta">{game.white_rating ?? '—'} / {game.black_rating ?? '—'} Elo{game.eco ? ` · ${game.eco}` : ''}{game.round ? ` · round ${game.round}` : ''}</span></span>
      <time>{date(game.played_on)}</time><strong>{game.result || '*'}</strong><span className="row-arrow" aria-hidden="true">↗</span>
    </a>)}
  </div>;
}

function Pager({ page, total, limit, onPage }: { page: number; total: number; limit: number; onPage: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / limit));
  return <div className="catalog-pager"><button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</button>
    <span>{formatNumber(page)} / {formatNumber(pages)}</span>
    <button type="button" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</button></div>;
}

function field(label: string, value: string, onChange: (value: string) => void, placeholder = '') {
  return <label className="catalog-field"><span>{label}</span><input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} /></label>;
}

function query(filters: Filters, page: number, sort: string, eventId?: number, playerId?: number) {
  const p = new URLSearchParams({ page:String(page), limit:'24', sort });
  if (playerId) p.set('player_id', String(playerId));
  if (eventId) p.set('event_id', String(eventId));
  else if (filters.event) p.set('event', filters.event);
  if (!playerId && filters.player) p.set(/^\d+$/.test(filters.player) ? 'player_id' : 'player', filters.player);
  for (const [key, value] of Object.entries({
    from: filters.yearFrom, to: filters.yearTo, federation:filters.federation.toUpperCase(), color:filters.color,
    result:filters.result, min_rating:filters.minRating, eco:filters.eco.toUpperCase(), opening:filters.opening,
    source:filters.source, date_from:filters.dateFrom, date_to:filters.dateTo,
  })) if (value && value !== 'both') p.set(key, value);
  return p.toString();
}

function GameExplorer({ eventId, playerId, years }: { eventId?: number; playerId?: number; years: number[] }) {
  const [draft, setDraft] = useState<Filters>(empty);
  const [applied, setApplied] = useState<Filters>(empty);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState('newest');
  const [response, setResponse] = useState<{ key: string; data: GameList } | null>(null);
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null);
  const search = useMemo(() => query(applied, page, sort, eventId, playerId), [applied, page, sort, eventId, playerId]);
  const data = response?.key === search ? response.data : null;
  const error = failure?.key === search ? failure.message : '';

  useEffect(() => {
    const controller = new AbortController();
    getJson<GameList>(`/api/games?${search}`, controller.signal).then((next) => setResponse({ key:search, data:next })).catch((e: Error) => {
      if (!controller.signal.aborted) setFailure({ key:search, message:e.message });
    });
    return () => controller.abort();
  }, [search]);

  const update = (key: keyof Filters) => (value: string) => setDraft((prior) => ({ ...prior, [key]:value }));
  const submit = (event: FormEvent) => { event.preventDefault(); setPage(1); setApplied({ ...draft }); };
  const reset = () => { setDraft({ ...empty }); setApplied({ ...empty }); setPage(1); };

  return <>
    <form className="catalog-filters" onSubmit={submit}>
      <div className="filter-primary">
        {!playerId && field('Player', draft.player, update('player'), 'Name or FIDE ID')}
        {!eventId && field('Tournament', draft.event, update('event'), 'Tournament name')}
        <label className="catalog-field"><span>Year from</span><select value={draft.yearFrom} onChange={(e) => update('yearFrom')(e.target.value)}><option value="">Any</option>{years.map((year) => <option key={year}>{year}</option>)}</select></label>
        <label className="catalog-field"><span>Year to</span><select value={draft.yearTo} onChange={(e) => update('yearTo')(e.target.value)}><option value="">Any</option>{years.map((year) => <option key={year}>{year}</option>)}</select></label>
        {field('Federation', draft.federation, update('federation'), 'AUT')}
      </div>
      <details className="filter-more"><summary>More filters</summary>
        <div className="filter-extra">
          <label className="catalog-field"><span>Player color</span><select value={draft.color} onChange={(e) => update('color')(e.target.value)}><option value="both">Any</option><option value="white">White</option><option value="black">Black</option></select></label>
          <label className="catalog-field"><span>Result</span><select value={draft.result} onChange={(e) => update('result')(e.target.value)}><option value="">Any</option><option value="1-0">1–0</option><option value="0-1">0–1</option><option value="1/2-1/2">½–½</option><option value="*">No result</option></select></label>
          {field('Minimum Elo for both players', draft.minRating, update('minRating'), '1800')}
          {field('ECO', draft.eco, update('eco'), 'B33')}
          {field('Opening', draft.opening, update('opening'), 'Sicilian')}
          <label className="catalog-field"><span>Source</span><select value={draft.source} onChange={(e) => update('source')(e.target.value)}><option value="">Any</option><option value="fide-official">FIDE PGN</option><option value="broadcast">Broadcast</option></select></label>
          <label className="catalog-field"><span>Date from</span><input type="date" value={draft.dateFrom} onChange={(e) => update('dateFrom')(e.target.value)} /></label>
          <label className="catalog-field"><span>Date to</span><input type="date" value={draft.dateTo} onChange={(e) => update('dateTo')(e.target.value)} /></label>
        </div>
      </details>
      <div className="filter-actions"><button className="primary-button" type="submit">Find games</button><button className="quiet-button" type="button" onClick={reset}>Reset</button></div>
    </form>

    <div className="catalog-results-head"><div><strong>{data ? formatNumber(data.total) : '—'}</strong><span>games</span></div>
      <label>Sort <select value={sort} onChange={(e) => { setSort(e.target.value); setPage(1); }}><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="tournament">Tournament</option><option value="rating">Rating</option><option value="longest">Longest</option></select></label></div>
    {error ? <div className="catalog-empty">Load error: {error}</div> : !data ? <div className="catalog-empty">Loading games…</div> : data.games.length ? <GameRows games={data.games} /> : <div className="catalog-empty">No games match these filters. Try changing them.</div>}
    {data && <Pager page={page} total={data.total} limit={24} onPage={(next) => { setPage(next); window.scrollTo(0, 0); }} />}
  </>;
}

export function GamesPage({ navigate }: { navigate: Navigate }) {
  const [overview, setOverview] = useState<Overview | null>(null);
  useEffect(() => { const controller = new AbortController(); getJson<Overview>('/api/overview', controller.signal).then(setOverview).catch(() => {}); return () => controller.abort(); }, []);
  return <main className="catalog-page">
    <div className="catalog-intro"><div><h1>Games</h1><p>Search the imported collection. Open a game to explore it on the board.</p></div>
      <button type="button" className="text-link" onClick={() => navigate('/tournaments')}>Browse tournaments</button></div>
    <GameExplorer years={overview?.years.map((item) => item.year) || []} />
  </main>;
}

export function TournamentsPage({ navigate }: { navigate: Navigate }) {
  const [draft, setDraft] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('games');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<TournamentList | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    const p = new URLSearchParams({ q:search, sort, page:String(page), limit:'30' });
    getJson<TournamentList>(`/api/tournaments?${p}`, controller.signal).then(setData).catch((e: Error) => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  }, [search, sort, page]);
  return <main className="catalog-page">
    <div className="catalog-intro"><div><h1>Tournaments</h1><p>Events from imported PGNs. Open one for dates, results and games.</p></div></div>
    <form className="tournament-search" onSubmit={(e) => { e.preventDefault(); setPage(1); setSearch(draft); }}>
      {field('Name', draft, setDraft, 'Find a tournament')}
      <label className="catalog-field"><span>Sort</span><select value={sort} onChange={(e) => { setSort(e.target.value); setPage(1); }}><option value="games">Most games</option><option value="name">Name</option></select></label>
      <button type="submit" className="primary-button">Search</button>
    </form>
    <div className="catalog-results-head"><div><strong>{data ? formatNumber(data.total) : '—'}</strong><span>events</span></div></div>
    {error ? <div className="catalog-empty">Load error: {error}</div> : !data ? <div className="catalog-empty">Loading tournaments…</div> : data.tournaments.length ? <div className="tournament-rows">{data.tournaments.map((item) => <a key={item.id} href={`/tournaments/${item.id}`} onClick={(e) => { if (e.metaKey || e.ctrlKey) return; e.preventDefault(); navigate(`/tournaments/${item.id}`); }}><strong>{item.name}</strong><span>{formatNumber(item.games)} games</span><span aria-hidden="true">→</span></a>)}</div> : <div className="catalog-empty">No tournaments match this search.</div>}
    {data && <Pager page={page} total={data.total} limit={30} onPage={(next) => { setPage(next); window.scrollTo(0, 0); }} />}
  </main>;
}

export function TournamentPage({ id, navigate }: { id: number; navigate: Navigate }) {
  const [detail, setDetail] = useState<TournamentDetail | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    getJson<TournamentDetail>(`/api/tournaments/${id}`, controller.signal).then(setDetail).catch((e: Error) => { if (!controller.signal.aborted) setError(e.message); });
    getJson<Overview>('/api/overview', controller.signal).then(setOverview).catch(() => {});
    return () => controller.abort();
  }, [id]);
  if (error) return <main className="catalog-page"><div className="catalog-empty">{error}</div></main>;
  if (!detail) return <main className="catalog-page"><div className="catalog-empty">Loading tournament…</div></main>;
  return <main className="catalog-page">
    <button type="button" className="back-link" onClick={() => navigate('/tournaments')}>← All tournaments</button>
    <div className="catalog-intro"><div><h1>{detail.name}</h1><p>Records with this event name in imported PGNs. The name alone does not verify official event status.</p></div></div>
    <div className="tournament-facts"><div><strong>{formatNumber(detail.games)}</strong><span>games</span></div><div><strong>{detail.first_date || '—'}</strong><span>first game</span></div><div><strong>{detail.last_date || '—'}</strong><span>last game</span></div><div><strong>{detail.sources}</strong><span>sources</span></div></div>
    <div className="tournament-secondary"><span>Years: {detail.years.map((item) => `${item.year} (${formatNumber(item.games)})`).join(', ') || 'unknown'}</span><span>Results: {detail.white_wins || 0} / {detail.draws || 0} / {detail.black_wins || 0}</span></div>
    <h2 className="section-title">Tournament games</h2><GameExplorer eventId={id} years={overview?.years.map((item) => item.year) || []} />
  </main>;
}

export function PlayerPage({ id, navigate }: { id: number; navigate: Navigate }) {
  const [player, setPlayer] = useState<PlayerDetail | null>(null);
  const [error, setError] = useState('');
  const [overview, setOverview] = useState<Overview | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    getJson<PlayerDetail>(`/api/players/${id}`, controller.signal).then((next) => {
      setPlayer(next);
      document.title = `${next.name} · ChessScope`;
    }).catch((e: Error) => { if (!controller.signal.aborted) setError(e.message); });
    getJson<Overview>('/api/overview', controller.signal).then(setOverview).catch(() => {});
    return () => { controller.abort(); document.title = 'ChessScope'; };
  }, [id]);
  if (error) return <main className="catalog-page"><button className="back-link" onClick={() => navigate('/')}>← Back to games</button><div className="catalog-empty">{error}</div></main>;
  if (!player) return <main className="catalog-page"><div className="catalog-empty">Loading player profile…</div></main>;
  return <main className="catalog-page player-page">
    <button className="back-link" onClick={() => navigate('/')}>← Back to games</button>
    <div className="catalog-intro"><div className="player-profile-identity"><PlayerAvatar id={player.fide_id} name={player.name} /><div><h1>{player.flag && <span className="catalog-flag" aria-hidden="true">{player.federation === 'RUS' ? '🏳️' : player.flag}</span>}{player.name}</h1>
      <p>{player.federation || 'Federation unknown'} · FIDE ID {player.fide_id}{player.official_rating ? ` · ${player.official_rating} classical Elo (${player.rating_month})` : ''}</p></div></div>
      <div className="player-page-count"><strong>{formatNumber(player.games)}</strong><span>games in library</span></div></div>
    <h2 className="section-title">Player games</h2>
    <GameExplorer playerId={id} years={overview?.years.map((item) => item.year) || []} />
  </main>;
}
