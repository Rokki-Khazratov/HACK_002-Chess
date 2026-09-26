import { useEffect, useMemo, useState } from 'react';
import type { FormEvent, MouseEvent } from 'react';
import type { Navigate } from '../Root';
import { PlayerAvatar } from '../components/PlayerAvatar';
import { formatNumber, getJson } from './api';
import type { GameList, GameSummary, Overview, Participant, PlayerDetail, TournamentDetail, TournamentList, TournamentSource } from './api';

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

type TournamentFilters = {
  q: string; player: string; site: string; yearFrom: string; yearTo: string;
  minAvgElo: string; minPlayers: string; source: string; status: string;
};
const emptyTournamentFilters: TournamentFilters = { q:'', player:'', site:'', yearFrom:'', yearTo:'', minAvgElo:'', minPlayers:'', source:'', status:'' };
const tournamentParams: [keyof TournamentFilters, string][] = [
  ['q', 'q'], ['player', 'player'], ['site', 'site'], ['yearFrom', 'year_from'], ['yearTo', 'year_to'],
  ['minAvgElo', 'min_avg_elo'], ['minPlayers', 'min_players'], ['source', 'source'], ['status', 'status'],
];
const tournamentSources: TournamentSource[] = ['fide-official', 'broadcast'];
const tournamentSorts: [string, string][] = [
  ['games', 'Most games'], ['newest', 'Newest'], ['oldest', 'Oldest'], ['avg_elo', 'Highest average Elo'], ['players', 'Most players'], ['name', 'Name'],
];
const TOURNAMENT_LIMIT = 30;

/** Normalises one filter value; anything outside the API contract becomes '' and is not sent. */
function cleanTournamentValue(key: keyof TournamentFilters, raw: string | null) {
  const value = (raw ?? '').trim();
  if (key === 'yearFrom' || key === 'yearTo') return /^\d{4}$/.test(value) ? value : '';
  if (key === 'minAvgElo' || key === 'minPlayers') return /^\d+$/.test(value) ? value : '';
  if (key === 'source') return tournamentSources.includes(value as TournamentSource) ? value : '';
  if (key === 'status') return value === 'accepted' ? value : '';
  return value;
}

function tournamentFilterParams(filters: TournamentFilters) {
  const params = new URLSearchParams();
  for (const [key, param] of tournamentParams) {
    const value = cleanTournamentValue(key, filters[key]);
    if (value) params.set(param, value);
  }
  return params;
}

function readTournamentUrl() {
  const params = new URLSearchParams(window.location.search);
  const filters = { ...emptyTournamentFilters };
  for (const [key, param] of tournamentParams) filters[key] = cleanTournamentValue(key, params.get(param));
  const sortParam = params.get('sort') || '';
  const sort = tournamentSorts.some(([value]) => value === sortParam) ? sortParam : 'games';
  const page = Math.max(1, Number.parseInt(params.get('page') || '1', 10) || 1);
  return { filters, sort, page };
}

function dateRange(from: string | null | undefined, to: string | null | undefined) {
  if (from && to) return from === to ? from : `${from} – ${to}`;
  return from || to || '';
}

function plural(count: number, word: string) { return `${formatNumber(count)} ${count === 1 ? word : `${word}s`}`; }
function safeUrl(url: string | null | undefined) { return url && /^https?:\/\//i.test(url) ? url : null; }

/** In-app navigation that still lets modifier clicks open the real href. */
function internalLink(navigate: Navigate, path: string) {
  return (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigate(path);
  };
}

function yearField(label: string, value: string, onChange: (value: string) => void, years: number[]) {
  const options = value && !years.includes(Number(value)) ? [Number(value), ...years] : years;
  return <label className="catalog-field"><span>{label}</span><select value={value} onChange={(e) => onChange(e.target.value)}><option value="">Any</option>{options.map((year) => <option key={year} value={String(year)}>{year}</option>)}</select></label>;
}

function numberField(label: string, value: string, onChange: (value: string) => void, placeholder: string) {
  return <label className="catalog-field"><span>{label}</span><input value={value} inputMode="numeric" onChange={(e) => onChange(e.target.value.replace(/\D/g, ''))} placeholder={placeholder} /></label>;
}

export function TournamentsPage({ navigate }: { navigate: Navigate }) {
  const [initial] = useState(readTournamentUrl);
  const [draft, setDraft] = useState<TournamentFilters>(initial.filters);
  const [applied, setApplied] = useState<TournamentFilters>(initial.filters);
  const [sort, setSort] = useState(initial.sort);
  const [page, setPage] = useState(initial.page);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [response, setResponse] = useState<{ key: string; data: TournamentList } | null>(null);
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null);
  const filterQuery = useMemo(() => tournamentFilterParams(applied).toString(), [applied]);
  const search = useMemo(() => {
    const params = new URLSearchParams(filterQuery);
    params.set('sort', sort); params.set('page', String(page)); params.set('limit', String(TOURNAMENT_LIMIT));
    return params.toString();
  }, [filterQuery, sort, page]);
  const data = response?.key === search ? response.data : null;
  const error = failure?.key === search ? failure.message : '';
  const extraOpen = Boolean(initial.filters.minAvgElo || initial.filters.minPlayers || initial.filters.source || initial.filters.status);

  useEffect(() => {
    const controller = new AbortController();
    getJson<Overview>('/api/overview', controller.signal).then(setOverview).catch(() => {});
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    getJson<TournamentList>(`/api/tournaments?${search}`, controller.signal).then((next) => setResponse({ key:search, data:next })).catch((e: Error) => {
      if (!controller.signal.aborted) setFailure({ key:search, message:e.message });
    });
    return () => controller.abort();
  }, [search]);

  // Mirror the applied state into the address bar so a filtered list survives refresh and can be shared.
  useEffect(() => {
    if (window.location.pathname !== '/tournaments') return;
    const params = new URLSearchParams(filterQuery);
    if (sort !== 'games') params.set('sort', sort);
    if (page > 1) params.set('page', String(page));
    const qs = params.toString();
    const next = `/tournaments${qs ? `?${qs}` : ''}`;
    if (`${window.location.pathname}${window.location.search}` !== next) window.history.replaceState(window.history.state, '', next);
  }, [filterQuery, sort, page]);

  const years = overview?.years.map((item) => item.year) || [];
  const update = (key: keyof TournamentFilters) => (value: string) => setDraft((prior) => ({ ...prior, [key]:value }));
  const submit = (event: FormEvent) => { event.preventDefault(); setPage(1); setApplied({ ...draft }); };
  const reset = () => { setDraft({ ...emptyTournamentFilters }); setApplied({ ...emptyTournamentFilters }); setPage(1); };

  return <main className="catalog-page">
    <div className="catalog-intro"><div><h1>Tournaments</h1><p>Events from imported PGNs. Open one for standings, ratings and games.</p></div></div>
    <form className="catalog-filters" onSubmit={submit}>
      <div className="filter-primary">
        {field('Name', draft.q, update('q'), 'Tournament name')}
        {field('Player', draft.player, update('player'), 'Name or FIDE ID')}
        {field('Location', draft.site, update('site'), 'Wijk aan Zee, Germany')}
        {yearField('Year from', draft.yearFrom, update('yearFrom'), years)}
        {yearField('Year to', draft.yearTo, update('yearTo'), years)}
      </div>
      <details className="filter-more" open={extraOpen || undefined}><summary>More filters</summary>
        <div className="filter-extra">
          {numberField('Min average Elo', draft.minAvgElo, update('minAvgElo'), '2500')}
          {numberField('Min players', draft.minPlayers, update('minPlayers'), '10')}
          <label className="catalog-field"><span>Source</span><select value={draft.source} onChange={(e) => update('source')(e.target.value)}><option value="">Any</option><option value="fide-official">FIDE PGN</option><option value="broadcast">Broadcast</option></select></label>
          <label className="catalog-field"><span>Verification</span><select value={draft.status} onChange={(e) => update('status')(e.target.value)}><option value="">Any</option><option value="accepted">Only verified classical</option></select></label>
        </div>
      </details>
      <div className="filter-actions"><button className="primary-button" type="submit">Search</button><button className="quiet-button" type="button" onClick={reset}>Reset</button></div>
    </form>

    <div className="catalog-results-head"><div><strong>{data ? formatNumber(data.total) : '—'}</strong><span>events</span></div>
      <label>Sort <select value={sort} onChange={(e) => { setSort(e.target.value); setPage(1); }}>{tournamentSorts.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>
    {error ? <div className="catalog-empty">Load error: {error}</div> : !data ? <div className="catalog-empty">Loading tournaments…</div> : data.tournaments.length ? <div className="tournament-list">
      {data.tournaments.map((item) => {
        const verified = item.accepted_games > 0;
        const fide = verified || Boolean(item.source_kinds?.includes('fide-official'));
        const meta = [item.site, dateRange(item.first_date, item.last_date) || 'Date unknown'].filter(Boolean).join(' · ');
        return <a key={item.id} className="tournament-list-row" href={`/tournaments/${item.id}`} onClick={internalLink(navigate, `/tournaments/${item.id}`)}>
          <span className="tournament-list-main">
            <span className="tournament-list-title"><strong>{item.name}</strong>{fide && <span className="fide-badge" title={verified ? `${plural(item.accepted_games, 'game')} verified as official FIDE-rated classical` : 'Games from the official FIDE PGN download'}>FIDE</span>}</span>
            <span className="tournament-list-meta">{meta}</span>
          </span>
          <span className="tournament-list-stat tournament-list-players">{plural(item.players, 'player')}</span>
          <span className="tournament-list-stat tournament-list-elo" title="Average Elo of rated participants">{item.avg_elo ? `Ø ${item.avg_elo}` : '—'}</span>
          <span className="tournament-list-stat">{plural(item.games, 'game')}</span>
          <span className="row-arrow" aria-hidden="true">→</span>
        </a>;
      })}
    </div> : <div className="catalog-empty">No tournaments match these filters. Try changing them.</div>}
    {data && <Pager page={page} total={data.total} limit={TOURNAMENT_LIMIT} onPage={(next) => { setPage(next); window.scrollTo(0, 0); }} />}
  </main>;
}

type StandingsKey = 'rank' | 'rating' | 'live' | 'points' | 'perf';
type StandingsSort = { key: StandingsKey; desc: boolean };
const standingsValue: Record<StandingsKey, (p: Participant) => number | null> = {
  rank: (p) => p.rank, rating: (p) => p.event_rating, live: (p) => p.live_rating, points: (p) => p.points, perf: (p) => p.performance,
};

/** Sorts a copy; missing values always go last, ties fall back to the standings rank. */
function sortParticipants(list: Participant[], { key, desc }: StandingsSort) {
  const get = standingsValue[key];
  return [...list].sort((a, b) => {
    const x = get(a) ?? null;
    const y = get(b) ?? null;
    if (x === null || y === null) return x === y ? a.rank - b.rank : x === null ? 1 : -1;
    return (desc ? y - x : x - y) || a.rank - b.rank;
  });
}

function formatPoints(points: number) {
  const whole = Math.floor(points + 1e-9);
  const half = points - whole >= 0.25;
  if (!half) return String(whole);
  return whole === 0 ? '½' : `${whole}½`;
}

function formatMoney(amount: number, currency: string) {
  try { return new Intl.NumberFormat('en-US', { style:'currency', currency, minimumFractionDigits:0, maximumFractionDigits:0 }).format(amount); }
  catch { return `${formatNumber(amount)} ${currency}`; }
}

function RatingChange({ value }: { value: number | null }) {
  if (value === null || value === undefined) return null;
  const rounded = Math.round(value * 10) / 10;
  if (rounded === 0) return <span className="standings-change ratings-muted">0</span>;
  return <span className={`standings-change ${rounded > 0 ? 'ratings-up' : 'ratings-down'}`}>{rounded > 0 ? '+' : '−'}{Math.abs(rounded).toFixed(1)}</span>;
}

function SortHeader({ label, column, sort, onSort, title }: { label: string; column: StandingsKey; sort: StandingsSort; onSort: (key: StandingsKey) => void; title?: string }) {
  const active = sort.key === column;
  return <th aria-sort={active ? (sort.desc ? 'descending' : 'ascending') : 'none'} title={title}>
    <button type="button" className={active ? 'standings-sort active' : 'standings-sort'} onClick={() => onSort(column)}>{label}<span aria-hidden="true">{active ? (sort.desc ? ' ↓' : ' ↑') : ''}</span></button>
  </th>;
}

function ParticipantName({ participant: p, navigate }: { participant: Participant; navigate: Navigate }) {
  const flag = p.federation === 'RUS' ? '🏳️' : p.flag;
  const detail = [p.federation, p.fide_id ? `FIDE ${p.fide_id}` : null].filter(Boolean).join(' · ');
  const body = <><PlayerAvatar id={p.fide_id} name={p.name} /><span>
    {flag && <span className="catalog-flag" aria-hidden="true">{flag}</span>}{p.title && <span className="title-badge">{p.title}</span>}{p.name}
    {detail && <small>{detail}</small>}
  </span></>;
  if (!p.fide_id) return <span className="ratings-player standings-player">{body}</span>;
  return <a className="ratings-player standings-player" href={`/players/${p.fide_id}`} onClick={internalLink(navigate, `/players/${p.fide_id}`)}>{body}</a>;
}

function StandingsTable({ participants, navigate }: { participants: Participant[]; navigate: Navigate }) {
  const [sort, setSort] = useState<StandingsSort>({ key:'rank', desc:false });
  const rows = useMemo(() => sortParticipants(participants, sort), [participants, sort]);
  const onSort = (key: StandingsKey) => setSort((prior) => prior.key === key ? { key, desc:!prior.desc } : { key, desc:key !== 'rank' });
  return <div className="ratings-table-wrap"><table className="ratings-table standings-table">
    <thead><tr>
      <SortHeader label="#" column="rank" sort={sort} onSort={onSort} title="Standing" />
      <th>Player</th>
      <SortHeader label="Rating" column="rating" sort={sort} onSort={onSort} title="Rating at this tournament" />
      <SortHeader label="Live" column="live" sort={sort} onSort={onSort} title="Tournament rating plus the rating change from this event's games" />
      <th title="Latest imported FIDE classical rating">FIDE</th>
      <SortHeader label="Pts" column="points" sort={sort} onSort={onSort} title="Points: 1 per win, ½ per draw" />
      <th title="Wins / draws / losses">W/D/L</th>
      <SortHeader label="Perf" column="perf" sort={sort} onSort={onSort} title="Performance rating" />
    </tr></thead>
    <tbody>{rows.map((p) => <tr key={`${p.fide_id ?? p.name}-${p.rank}`}>
      <td className="ratings-rank">{p.rank}</td>
      <td><ParticipantName participant={p} navigate={navigate} /></td>
      <td className="standings-num">{p.event_rating ?? '—'}</td>
      <td className="standings-num"><span className="standings-live">{p.live_rating ?? '—'}</span><RatingChange value={p.rating_change} /></td>
      <td className="standings-num" title={p.official_month ? `FIDE rating list ${p.official_month}` : undefined}>{p.official_rating ?? '—'}</td>
      <td className="standings-num standings-points" title={`${p.points} from ${plural(p.games, 'game')}${p.buchholz !== null && p.buchholz !== undefined ? ` · Buchholz ${p.buchholz}` : ''}`}>{formatPoints(p.points)}</td>
      <td className="standings-num ratings-muted">{p.wins} / {p.draws} / {p.losses}</td>
      <td className="standings-num">{p.performance ?? '—'}</td>
    </tr>)}</tbody>
  </table></div>;
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
  if (error) return <main className="catalog-page"><button type="button" className="back-link" onClick={() => navigate('/tournaments')}>← All tournaments</button><div className="catalog-empty">{error}</div></main>;
  if (!detail) return <main className="catalog-page"><div className="catalog-empty">Loading tournament…</div></main>;

  const participants = detail.participants ?? [];
  const official = detail.official ?? null;
  const prize = detail.prize_fund ?? null;
  const range = dateRange(official?.start_date || detail.first_date, official?.end_date || detail.last_date);
  const timeControl = detail.time_control || official?.time_control_text || null;
  const subtitle = [detail.site, range, timeControl, detail.rounds ? plural(detail.rounds, 'round') : null].filter(Boolean).join(' · ');
  const links: { url: string; label: string }[] = [];
  for (const [url, label] of [[official?.fide_details_url, 'FIDE details'], [official?.fide_report_url, 'FIDE report'], [detail.broadcast_url, 'Broadcast']] as const) {
    const safe = safeUrl(url);
    if (safe) links.push({ url:safe, label });
  }
  const prizeSource = safeUrl(prize?.source_url);
  const averageNote = [detail.category ? `Category ${detail.category}` : null, detail.avg_live ? `live Ø ${detail.avg_live}` : null].filter(Boolean).join(' · ');

  return <main className="catalog-page">
    <button type="button" className="back-link" onClick={() => navigate('/tournaments')}>← All tournaments</button>
    <div className="catalog-intro"><div><h1>{detail.name}</h1><p>{subtitle || 'Dates unknown'}</p>
      {!official && <p className="tournament-note">Records with this event name in imported PGNs. The name alone does not verify official event status.</p>}</div></div>
    <div className="tournament-facts tournament-facts-wide">
      <div><strong>{detail.avg_elo ?? '—'}</strong><span>average Elo</span>{averageNote && <small className="tournament-fact-note">{averageNote}</small>}</div>
      <div><strong>{formatNumber(participants.length)}</strong><span>players</span></div>
      <div><strong>{formatNumber(detail.games)}</strong><span>games</span></div>
      <div>{prize ? <strong title={prize.note || undefined}>{formatMoney(prize.amount, prize.currency)}</strong> : <strong className="tournament-fact-muted" title="No prize fund in the imported sources">Not listed</strong>}
        <span>prize fund{prizeSource && <> · <a href={prizeSource} target="_blank" rel="noopener noreferrer">source ↗</a></>}</span>
        {prize?.note && <small className="tournament-fact-note">{prize.note}</small>}</div>
      <div><strong>{detail.top_rating ?? '—'}</strong><span>top rating</span></div>
    </div>
    {links.length > 0 && <div className="tournament-links">{links.map(({ url, label }) => <a key={label} href={url} target="_blank" rel="noopener noreferrer">{label} ↗</a>)}</div>}
    <div className="tournament-secondary">
      <span>Years: {detail.years.map((item) => `${item.year} (${formatNumber(item.games)})`).join(', ') || 'unknown'}</span>
      <span>Results: {detail.white_wins || 0} / {detail.draws || 0} / {detail.black_wins || 0}</span>
      <span>Sources: {detail.sources}</span>
      {detail.organizer && <span>Organizer: {detail.organizer}</span>}
      {official && <span>FIDE event {official.fide_event_id}{official.name && official.name !== detail.name ? ` · ${official.name}` : ''}</span>}
    </div>

    <h2 className="section-title">Participants</h2>
    {participants.length ? <StandingsTable participants={participants} navigate={navigate} /> : <div className="catalog-empty">No participant standings for this tournament yet.</div>}
    {detail.standings_basis && <p className="standings-basis">{detail.standings_basis}</p>}

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
