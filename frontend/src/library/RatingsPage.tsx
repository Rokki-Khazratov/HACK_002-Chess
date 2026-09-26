import { useEffect, useMemo, useState } from 'react';
import type { Navigate } from '../Root';
import { PlayerAvatar } from '../components/PlayerAvatar';
import { formatNumber } from './api';

type RankedPlayer = {
  rank: number; fideId: number; name: string; federation: string; flag: string | null;
  rating: number; birthYear: number | null; title: string | null; games: number;
  ytdChange: number | null; rankChange: number | null; trend: (number | null)[];
};

function Trend({ values }: { values: (number | null)[] }) {
  if (!values || values.length !== 3 || values.some((value) => value === null)) return <span className="ratings-muted">—</span>;
  const numbers = values as number[];
  const low = Math.min(...numbers) - 4;
  const high = Math.max(...numbers) + 4;
  const points = numbers.map((value, i) => `${4 + i * 26},${22 - ((value - low) / (high - low)) * 18}`).join(' ');
  return <svg className="ratings-trend" width="60" height="26" viewBox="0 0 60 26" role="img" aria-label={`FIDE ratings in January, February and September: ${numbers.join(', ')}`}><polyline points={points} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

export function RatingsPage({ navigate }: { navigate: Navigate }) {
  const [players, setPlayers] = useState<RankedPlayer[]>([]);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [federation, setFederation] = useState('');
  const [limit, setLimit] = useState(100);
  const [sort, setSort] = useState<'rank' | 'name' | 'games' | 'change'>('rank');
  const [liveBannerAvailable, setLiveBannerAvailable] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/ratings-sep26.json', { signal: controller.signal, cache: 'no-store' })
      .then((response) => { if (!response.ok) throw new Error(`HTTP ${response.status}`); return response.json() as Promise<RankedPlayer[]>; })
      .then(setPlayers).catch((e: Error) => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  }, []);
  const federations = useMemo(() => [...new Set(players.map((p) => p.federation))].sort(), [players]);
  const visible = useMemo(() => {
    const q = search.toLocaleLowerCase().trim();
    const list = players.slice(0, limit).filter((p) => (!q || p.name.toLocaleLowerCase().includes(q) || String(p.fideId).includes(q)) && (!federation || p.federation === federation));
    return list.sort(sort === 'name' ? (a, b) => a.name.localeCompare(b.name) : sort === 'games' ? (a, b) => b.games - a.games || a.rank - b.rank : sort === 'change' ? (a, b) => (b.ytdChange ?? -Infinity) - (a.ytdChange ?? -Infinity) : (a, b) => a.rank - b.rank);
  }, [players, search, federation, limit, sort]);
  return <main className="catalog-page ratings-page">
    <div className="catalog-intro"><div><div className="ratings-eyebrow">FIDE · Standard · September 2026</div><h1>World rankings</h1>
      <p>Official monthly classical ratings. Changes compare January and September FIDE lists. The live Top 10 panel comes directly from 2700chess.</p></div>
      <a className="text-link" href="https://www.2700chess.com/" target="_blank" rel="noopener noreferrer">View live ratings ↗</a></div>
    <details className="ratings-live"><summary><span className="ratings-live-label">Live feed</span><strong>Top 10 live ratings from 2700chess</strong><span className="ratings-live-toggle">Show live table</span></summary>
      <div className="ratings-live-content"><small>2700chess updates this official banner when its ratings change.</small>
        {liveBannerAvailable ? <a href="https://www.2700chess.com/" target="_blank" rel="noopener noreferrer"><img src="https://www.2700chess.com/files/topten_olive.png" alt="Live top 10 chess ratings from 2700chess" onError={() => setLiveBannerAvailable(false)} /></a>
          : <a className="text-link" href="https://www.2700chess.com/" target="_blank" rel="noopener noreferrer">Open live ratings ↗</a>}</div></details>
    <div className="ratings-controls">
      <label className="catalog-field ratings-search"><span>Search players</span><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name or FIDE ID" /></label>
      <label className="catalog-field"><span>Federation</span><select value={federation} onChange={(e) => setFederation(e.target.value)}><option value="">All federations</option>{federations.map((code) => <option key={code}>{code}</option>)}</select></label>
      <label className="catalog-field"><span>Player pool</span><select value={limit} onChange={(e) => setLimit(Number(e.target.value))}><option value={100}>Top 100</option><option value={300}>Top 300</option></select></label>
      <label className="catalog-field"><span>Sort by</span><select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}><option value="rank">Rating rank</option><option value="name">Name</option><option value="change">2026 rating change</option><option value="games">FIDE games this month</option></select></label>
    </div>
    <div className="ratings-source"><span>{formatNumber(visible.length)} players</span><span>Source: <a href="https://ratings.fide.com/download/standard_sep26frl.zip" target="_blank" rel="noopener noreferrer">FIDE September 2026 rating list ↗</a></span></div>
    {error ? <div className="catalog-empty">Could not load ratings: {error}</div> : !players.length ? <div className="catalog-empty">Loading rankings…</div> :
      <div className="ratings-table-wrap"><table className="ratings-table"><thead><tr><th>#</th><th title="Rank change since January 2026">↑↓</th><th>Player</th><th>Fed</th><th>Classical Elo</th><th title="Rating change since January 2026">2026 Δ</th><th title="January, February and September FIDE ratings">Trend</th><th>Title</th><th>Games</th><th>Born</th><th></th></tr></thead><tbody>
        {visible.map((p) => <tr key={p.fideId}><td className="ratings-rank">{p.rank}</td><td className={p.rankChange && p.rankChange > 0 ? 'ratings-up' : p.rankChange && p.rankChange < 0 ? 'ratings-down' : 'ratings-muted'}>{p.rankChange === null ? '—' : p.rankChange > 0 ? `↑${p.rankChange}` : p.rankChange < 0 ? `↓${-p.rankChange}` : '—'}</td><td><a className="ratings-player" href={`/players/${p.fideId}`} onClick={(e) => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; e.preventDefault(); navigate(`/players/${p.fideId}`); }}><PlayerAvatar id={p.fideId} name={p.name} /><span>{p.name}<small>FIDE {p.fideId}</small></span></a></td><td><span aria-label={p.federation}>{p.federation === 'RUS' ? '🏳️' : p.flag || '◇'} {p.federation}</span></td><td className="ratings-value">{p.rating}</td><td className={p.ytdChange && p.ytdChange > 0 ? 'ratings-up' : p.ytdChange && p.ytdChange < 0 ? 'ratings-down' : 'ratings-muted'}>{p.ytdChange === null ? '—' : p.ytdChange > 0 ? `+${p.ytdChange}` : p.ytdChange || '—'}</td><td><Trend values={p.trend} /></td><td>{p.title || '—'}</td><td>{p.games}</td><td>{p.birthYear || '—'}</td><td><a className="ratings-games" href={`/players/${p.fideId}`} onClick={(e) => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; e.preventDefault(); navigate(`/players/${p.fideId}`); }} title="View games">↗</a></td></tr>)}
      </tbody></table>{!visible.length && <div className="catalog-empty">No players match these filters.</div>}</div>}
  </main>;
}
