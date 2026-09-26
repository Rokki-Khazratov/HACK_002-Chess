import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import type { Navigate } from '../Root';
import { formatNumber, getJson } from './api';
import type { GameList, GameSummary, Overview, TournamentDetail, TournamentList } from './api';

type Filters = {
  player: string; event: string; yearFrom: string; yearTo: string; federation: string;
  color: string; result: string; minRating: string; eco: string; opening: string;
  source: string; dateFrom: string; dateTo: string;
};
const empty: Filters = { player:'', event:'', yearFrom:'', yearTo:'', federation:'', color:'both',
  result:'', minRating:'', eco:'', opening:'', source:'', dateFrom:'', dateTo:'' };

function date(value: string | null) { return value || 'Дата неизвестна'; }
function player(name: string | null, flag: string | null) { return <>{flag && <span className="catalog-flag" aria-hidden="true">{flag}</span>}{name || '?'}</>; }

function GameRows({ games }: { games: GameSummary[] }) {
  return <div className="catalog-rows">
    {games.map((game) => <a key={game.id} className="catalog-row" href={`/games/${game.id}`} target="_blank" rel="noopener noreferrer" title="Открыть партию в новой вкладке">
      <span className="catalog-row-main"><span className="catalog-row-event">{game.tournament || 'Турнир не указан'}</span>
        <span className="catalog-row-players">{player(game.white_name, game.white_flag)}<span className="versus">—</span>{player(game.black_name, game.black_flag)}</span>
        <span className="catalog-row-meta">{game.white_rating ?? '—'} / {game.black_rating ?? '—'} Elo{game.eco ? ` · ${game.eco}` : ''}{game.round ? ` · раунд ${game.round}` : ''}</span></span>
      <time>{date(game.played_on)}</time><strong>{game.result || '*'}</strong><span className="row-arrow" aria-hidden="true">↗</span>
    </a>)}
  </div>;
}

function Pager({ page, total, limit, onPage }: { page: number; total: number; limit: number; onPage: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / limit));
  return <div className="catalog-pager"><button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)}>Назад</button>
    <span>{formatNumber(page)} / {formatNumber(pages)}</span>
    <button type="button" disabled={page >= pages} onClick={() => onPage(page + 1)}>Далее</button></div>;
}

function field(label: string, value: string, onChange: (value: string) => void, placeholder = '') {
  return <label className="catalog-field"><span>{label}</span><input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} /></label>;
}

function query(filters: Filters, page: number, sort: string, eventId?: number) {
  const p = new URLSearchParams({ page:String(page), limit:'24', sort });
  if (eventId) p.set('event_id', String(eventId));
  else if (filters.event) p.set('event', filters.event);
  if (filters.player) p.set(/^\d+$/.test(filters.player) ? 'player_id' : 'player', filters.player);
  for (const [key, value] of Object.entries({
    from: filters.yearFrom, to: filters.yearTo, federation:filters.federation.toUpperCase(), color:filters.color,
    result:filters.result, min_rating:filters.minRating, eco:filters.eco.toUpperCase(), opening:filters.opening,
    source:filters.source, date_from:filters.dateFrom, date_to:filters.dateTo,
  })) if (value && value !== 'both') p.set(key, value);
  return p.toString();
}

function GameExplorer({ eventId, years }: { eventId?: number; years: number[] }) {
  const [draft, setDraft] = useState<Filters>(empty);
  const [applied, setApplied] = useState<Filters>(empty);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState('newest');
  const [response, setResponse] = useState<{ key: string; data: GameList } | null>(null);
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null);
  const search = useMemo(() => query(applied, page, sort, eventId), [applied, page, sort, eventId]);
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
        {field('Игрок', draft.player, update('player'), 'Имя или FIDE ID')}
        {!eventId && field('Турнир', draft.event, update('event'), 'Название турнира')}
        <label className="catalog-field"><span>Год от</span><select value={draft.yearFrom} onChange={(e) => update('yearFrom')(e.target.value)}><option value="">Любой</option>{years.map((year) => <option key={year}>{year}</option>)}</select></label>
        <label className="catalog-field"><span>Год до</span><select value={draft.yearTo} onChange={(e) => update('yearTo')(e.target.value)}><option value="">Любой</option>{years.map((year) => <option key={year}>{year}</option>)}</select></label>
        {field('Федерация', draft.federation, update('federation'), 'AUT')}
      </div>
      <details className="filter-more"><summary>Дополнительные фильтры</summary>
        <div className="filter-extra">
          <label className="catalog-field"><span>Цвет игрока</span><select value={draft.color} onChange={(e) => update('color')(e.target.value)}><option value="both">Любой</option><option value="white">Белыми</option><option value="black">Чёрными</option></select></label>
          <label className="catalog-field"><span>Результат</span><select value={draft.result} onChange={(e) => update('result')(e.target.value)}><option value="">Любой</option><option value="1-0">1–0</option><option value="0-1">0–1</option><option value="1/2-1/2">½–½</option><option value="*">Без результата</option></select></label>
          {field('Минимальный Elo обоих игроков', draft.minRating, update('minRating'), '1800')}
          {field('ECO', draft.eco, update('eco'), 'B33')}
          {field('Дебют', draft.opening, update('opening'), 'Sicilian')}
          <label className="catalog-field"><span>Источник</span><select value={draft.source} onChange={(e) => update('source')(e.target.value)}><option value="">Любой</option><option value="fide-official">FIDE PGN</option><option value="broadcast">Трансляция</option></select></label>
          <label className="catalog-field"><span>Дата от</span><input type="date" value={draft.dateFrom} onChange={(e) => update('dateFrom')(e.target.value)} /></label>
          <label className="catalog-field"><span>Дата до</span><input type="date" value={draft.dateTo} onChange={(e) => update('dateTo')(e.target.value)} /></label>
        </div>
      </details>
      <div className="filter-actions"><button className="primary-button" type="submit">Найти партии</button><button className="quiet-button" type="button" onClick={reset}>Сбросить</button></div>
    </form>

    <div className="catalog-results-head"><div><strong>{data ? formatNumber(data.total) : '—'}</strong><span>партий</span></div>
      <label>Сортировка <select value={sort} onChange={(e) => { setSort(e.target.value); setPage(1); }}><option value="newest">Новые сначала</option><option value="oldest">Старые сначала</option><option value="tournament">По турниру</option><option value="rating">По рейтингу</option><option value="longest">По длине</option></select></label></div>
    {error ? <div className="catalog-empty">Ошибка загрузки: {error}</div> : !data ? <div className="catalog-empty">Загружаем партии…</div> : data.games.length ? <GameRows games={data.games} /> : <div className="catalog-empty">Партий по этим фильтрам нет. Измените условия поиска.</div>}
    {data && <Pager page={page} total={data.total} limit={24} onPage={(next) => { setPage(next); window.scrollTo(0, 0); }} />}
  </>;
}

export function GamesPage({ navigate }: { navigate: Navigate }) {
  const [overview, setOverview] = useState<Overview | null>(null);
  useEffect(() => { const controller = new AbortController(); getJson<Overview>('/api/overview', controller.signal).then(setOverview).catch(() => {}); return () => controller.abort(); }, []);
  return <main className="catalog-page">
    <div className="catalog-intro"><div><h1>Партии</h1><p>Поиск по всей импортированной коллекции. Откройте запись, чтобы изучить её на доске.</p></div>
      <button type="button" className="text-link" onClick={() => navigate('/tournaments')}>Смотреть турниры</button></div>
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
    <div className="catalog-intro"><div><h1>Турниры</h1><p>Названия событий из PGN. Откройте турнир, чтобы увидеть годы, результаты и партии.</p></div></div>
    <form className="tournament-search" onSubmit={(e) => { e.preventDefault(); setPage(1); setSearch(draft); }}>
      {field('Название', draft, setDraft, 'Найти турнир')}
      <label className="catalog-field"><span>Сортировка</span><select value={sort} onChange={(e) => { setSort(e.target.value); setPage(1); }}><option value="games">По числу партий</option><option value="name">По названию</option></select></label>
      <button type="submit" className="primary-button">Найти</button>
    </form>
    <div className="catalog-results-head"><div><strong>{data ? formatNumber(data.total) : '—'}</strong><span>названий событий</span></div></div>
    {error ? <div className="catalog-empty">Ошибка загрузки: {error}</div> : !data ? <div className="catalog-empty">Загружаем турниры…</div> : data.tournaments.length ? <div className="tournament-rows">{data.tournaments.map((item) => <a key={item.id} href={`/tournaments/${item.id}`} onClick={(e) => { if (e.metaKey || e.ctrlKey) return; e.preventDefault(); navigate(`/tournaments/${item.id}`); }}><strong>{item.name}</strong><span>{formatNumber(item.games)} партий</span><span aria-hidden="true">→</span></a>)}</div> : <div className="catalog-empty">Турниров по этому запросу нет.</div>}
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
  if (!detail) return <main className="catalog-page"><div className="catalog-empty">Загружаем турнир…</div></main>;
  return <main className="catalog-page">
    <button type="button" className="back-link" onClick={() => navigate('/tournaments')}>← Все турниры</button>
    <div className="catalog-intro"><div><h1>{detail.name}</h1><p>Записи под этим названием в импортированных PGN. Название само по себе не подтверждает официальный статус события.</p></div></div>
    <div className="tournament-facts"><div><strong>{formatNumber(detail.games)}</strong><span>партий</span></div><div><strong>{detail.first_date || '—'}</strong><span>первая запись</span></div><div><strong>{detail.last_date || '—'}</strong><span>последняя запись</span></div><div><strong>{detail.sources}</strong><span>источников</span></div></div>
    <div className="tournament-secondary"><span>Годы: {detail.years.map((item) => `${item.year} (${formatNumber(item.games)})`).join(', ') || 'не указаны'}</span><span>Результаты: {detail.white_wins || 0} / {detail.draws || 0} / {detail.black_wins || 0}</span></div>
    <h2 className="section-title">Партии турнира</h2><GameExplorer eventId={id} years={overview?.years.map((item) => item.year) || []} />
  </main>;
}
