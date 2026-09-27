import { useEffect, useRef, useState } from 'react';
import type { Navigate } from '../Root';
import { getJson, type GameList } from '../library/api';
import { ChatPanel } from '../components/ChatPanel';
import { loadHistory, loadPreparations, savePreparations, sendToCoach } from '../ai/api';
import { selectPreparation } from '../ai/preparation';
import type { CoachTurn, Preparation } from '../ai/types';
import './prepare.css';

type Player = { fide_id: number; name: string; federation: string | null; games: number; flag: string };
type Study = { id: string; title: string; project: string; updated: number; preparation: Preparation; messages?: unknown[] };
const starter = (): Study => ({ id: crypto.randomUUID(), title: 'New preparation', project: 'My preparation', updated: Date.now(), preparation: { id: '', project: 'My preparation', color: 'unknown', opening: '', notes: '' } });
const readLocal = (): Study[] => { try { const value = JSON.parse(localStorage.getItem('chessscope.prepare.studies') || '[]'); return Array.isArray(value) ? value.filter((item) => item && typeof item.id === 'string') : []; } catch { return []; } };
const contextFor = (study: Study): Preparation => { const value = study.preparation || ({} as Preparation); return { ...value, color: value.color || 'unknown', opening: value.opening || '', notes: value.notes || '', id: study.id, project: study.project }; };
const draftFor = (study: Study) => ({ id: study.id, title: study.title, project: study.project, updated: study.updated, preparation: contextFor(study) });

export function PreparePage({ navigate }: { navigate: Navigate }) {
  const initial = readLocal();
  const [studies, setStudies] = useState<Study[]>(() => initial.length ? initial : [starter()]);
  const [active, setActive] = useState(() => { try { const id = sessionStorage.getItem('chessscope.openPreparation') || ''; sessionStorage.removeItem('chessscope.openPreparation'); return id; } catch { return ''; } });
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Player[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchState, setSearchState] = useState<'idle' | 'results' | 'empty' | 'error'>('idle');
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState('Loading preparations…');
  const [review, setReview] = useState<CoachTurn>();
  const [working, setWorking] = useState<'review' | 'plan' | 'demo' | ''>('');
  const [chatVersion, setChatVersion] = useState(0);
  const study = studies.find((item) => item.id === active) || studies[0];
  const preparation = contextFor(study);
  const opponent = preparation.opponent;
  const activeId = useRef(study.id);
  activeId.current = study.id;

  useEffect(() => {
    const controller = new AbortController();
    loadPreparations(controller.signal).then(({ studies: saved }) => {
      if (controller.signal.aborted) return;
      setStudies((current) => { const merged = new Map(current.map((item) => [item.id, item])); saved.forEach((item) => { const prior = merged.get(item.id); if (!prior || item.updated >= prior.updated) merged.set(item.id, { ...item, messages: prior?.messages }); }); return [...merged.values()].sort((a, b) => b.updated - a.updated); });
      setReady(true); setStatus('Saved');
    }).catch(() => { if (!controller.signal.aborted) { setReady(true); setStatus('Saved locally · server unavailable'); } });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    try { localStorage.setItem('chessscope.prepare.studies', JSON.stringify(studies)); } catch { /* optional cache */ }
    if (!ready) return;
    const handle = window.setTimeout(() => savePreparations([draftFor(study)]).then(() => setStatus('Saved')).catch(() => setStatus('Saved locally · server unavailable')), 500);
    return () => window.clearTimeout(handle);
  }, [studies, study, ready]);
  useEffect(() => {
    setReview(undefined);
    const controller = new AbortController();
    loadHistory(`prep:${study.id}`, controller.signal).then(({ turns }) => { if (!controller.signal.aborted) setReview([...turns].reverse().find((turn) => turn.action === 'repertoire')); }).catch(() => {});
    return () => controller.abort();
  }, [study.id]);
  useEffect(() => {
    const value = query.trim();
    if (!value) { setResults([]); setSearching(false); setSearchState('idle'); return; }
    const controller = new AbortController();
    const handle = window.setTimeout(() => {
      setSearching(true);
      getJson<Player[]>(`/api/players?q=${encodeURIComponent(value)}`, controller.signal).then((players) => {
        if (controller.signal.aborted) return;
        setResults(players); setSearchState(players.length ? 'results' : 'empty');
      }).catch(() => { if (!controller.signal.aborted) { setResults([]); setSearchState('error'); } }).finally(() => { if (!controller.signal.aborted) setSearching(false); });
    }, 250);
    return () => { window.clearTimeout(handle); controller.abort(); };
  }, [query]);

  const patch = (change: Partial<Preparation>) => setStudies((items) => items.map((item) => item.id === study.id ? { ...item, title: change.opponent?.name ? `vs ${change.opponent.name}` : item.title, updated: Date.now(), preparation: { ...contextFor(item), ...change } } : item));
  const newStudy = () => { const item = starter(); setStudies((items) => [item, ...items]); setActive(item.id); setResults([]); setQuery(''); };
  const selectOpponent = (player: Player) => { patch({ opponent: { name: player.name, fideId: player.fide_id }, plan: undefined }); setReview(undefined); setResults([]); setQuery(''); setSearchState('idle'); setStatus(`${player.name} selected · create a review when ready`); };
  const requestCoach = async (action: 'repertoire' | 'preparation_plan', message: string) => {
    const requestedStudy = study.id;
    setWorking(action === 'repertoire' ? 'review' : 'plan'); setStatus(action === 'repertoire' ? 'Creating evidence review…' : 'Drafting the agreed plan…');
    try {
      await savePreparations([draftFor(study)]);
      const { turn } = await sendToCoach({ version: 1, conversationId: `prep:${study.id}`, requestId: crypto.randomUUID(), action, message, context: { preparation } });
      if (activeId.current !== requestedStudy) return;
      if (action === 'repertoire') setReview(turn);
      else patch({ plan: { status: 'agreed', summary: turn.analysis?.summary || turn.reply.slice(0, 1000), recommendations: turn.analysis?.sections.flatMap((section) => section.items).slice(0, 8) || [], sourceGameId: preparation.plan?.sourceGameId, sourceReferences: Object.values(turn.context.opponentEvidence?.colors || {}).flatMap((color) => color.openings.flatMap((opening) => opening.examples.map((game) => game.reference))).slice(0, 12), updatedAt: new Date().toISOString() } });
      setChatVersion((value) => value + 1); setStatus(action === 'repertoire' ? 'Evidence review saved in this chat' : 'Plan agreed and saved');
    } catch (cause) { if (activeId.current === requestedStudy) setStatus(cause instanceof Error ? cause.message : 'Coach request failed'); }
    finally { if (activeId.current === requestedStudy) setWorking(''); }
  };
  const openBoard = async () => {
    const gameId = preparation.plan?.sourceGameId;
    if (!gameId) { setStatus('Choose an example game before opening the board.'); return; }
    try { await savePreparations([draftFor(study)]); await selectPreparation(preparation); sessionStorage.setItem('chessscope.openChat', `prep:${study.id}`); navigate(`/games/${gameId}`); }
    catch (cause) { setStatus(cause instanceof Error ? cause.message : 'Could not open the board'); }
  };
  const launchDemo = async () => {
    setWorking('demo'); setStatus('Preparing the guided demo…');
    try {
      const sample = await getJson<GameList>('/api/games?player_id=1503014&status=all&sort=newest&limit=1');
      if (!sample.games[0]) throw new Error('The demo player is not available in this library.');
      const item = starter();
      item.title = 'Demo · Magnus Carlsen'; item.project = 'Guided demo';
      item.preparation = { id: item.id, project: item.project, opponent: { name: 'Carlsen, Magnus', fideId: 1503014 }, color: 'black', opening: sample.games[0].opening || 'Explore from the source game', notes: 'Guided hackathon demo. Compare the source game, inspect the selected position, run Stockfish, ask the coach, and save a branch.', plan: { status: 'agreed', summary: 'Guided demo prepared from a catalog game.', recommendations: ['Open the source game', 'Choose a position', 'Run Stockfish', 'Ask the coach', 'Save a named branch'], sourceGameId: sample.games[0].id, sourceReferences: [`/games/${sample.games[0].id}`], updatedAt: new Date().toISOString() } };
      setStudies((items) => [item, ...items]); setActive(item.id); await savePreparations([draftFor(item)]); await selectPreparation(item.preparation); sessionStorage.setItem('chessscope.openChat', `prep:${item.id}`); navigate(`/games/${sample.games[0].id}`);
    } catch (cause) { setStatus(cause instanceof Error ? cause.message : 'Could not start the demo'); setWorking(''); }
  };
  const examples = review ? Object.values(review.context.opponentEvidence?.colors || {}).flatMap((color) => color.openings.flatMap((opening) => opening.examples)) : [];
  const conflict = preparation.color === 'white' ? /\bblack\b/i.test(preparation.notes) : preparation.color === 'black' ? /\bwhite\b/i.test(preparation.notes) : false;

  return <main className="prep-page"><div className="prep-shell">
    <header className="prep-header"><div><span className="prep-eyebrow"><i /> OPPONENT PREPARATION</span><h1>Preparation workspace</h1></div><div className="prep-header-actions"><button className="prep-demo" onClick={() => void launchDemo()} disabled={!!working}>{working === 'demo' ? 'Starting demo…' : '▶ Launch demo'}</button><select aria-label="Saved preparation" value={study.id} onChange={(event) => { setActive(event.target.value); setResults([]); setQuery(''); }} >{studies.map((item) => <option value={item.id} key={item.id}>{item.title}</option>)}</select><button className="prep-new" onClick={newStudy}>＋ New</button></div></header>
    <div className="prep-workspace">
      <section className="prep-main">
        <div className="prep-main-heading"><div><span className="prep-kicker">COACH WORKSPACE</span><h2>{opponent ? `Plan against ${opponent.name}` : 'Start with an opponent'}</h2></div><span className="prep-save-state">{status}</span></div>
        {review && <article className="prep-evidence"><header><div><span className="prep-kicker">EVIDENCE REVIEW</span><h3>Games used for this preparation</h3></div><span>{new Date(review.createdAt).toLocaleDateString()}</span></header><div className="prep-evidence-grid">{(['white', 'black'] as const).map((color) => { const sample = review.context.opponentEvidence?.colors[color]; return <div key={color}><strong>{sample?.sampleSize ?? 0}</strong><span>used as {color}</span><small>{sample?.found ?? 0} found · {sample?.excluded ?? 0} excluded</small></div>; })}</div><p>{review.context.opponentEvidence?.limitation || 'No library evidence was attached to this answer.'}</p>{examples.length > 0 && <div className="prep-source-picker"><label>Source game for board study<select value={preparation.plan?.sourceGameId || ''} onChange={(event) => patch({ plan: { status: preparation.plan?.status || 'draft', summary: preparation.plan?.summary || '', recommendations: preparation.plan?.recommendations || [], sourceReferences: preparation.plan?.sourceReferences || [], sourceGameId: Number(event.target.value), updatedAt: new Date().toISOString() } })}><option value="">Choose a game…</option>{examples.filter((game, index, all) => all.findIndex((item) => item.id === game.id) === index).map((game) => <option value={game.id} key={game.id}>Game #{game.id} · {game.white} — {game.black}</option>)}</select></label>{preparation.plan?.sourceGameId && <button className="prep-link" onClick={() => navigate(`/games/${preparation.plan!.sourceGameId}`)}>Open source ↗</button>}</div>}</article>}
        {preparation.plan?.status === 'agreed' && <article className="prep-plan"><span className="prep-kicker">AGREED PLAN</span><h3>{preparation.plan.summary}</h3><ul>{preparation.plan.recommendations.slice(0, 5).map((item) => <li key={item}>{item}</li>)}</ul><button className="prep-primary" onClick={() => void openBoard()}>Study selected game on board →</button></article>}
        <section className="prep-chat" id="prep-chat"><ChatPanel key={`${study.id}:${chatVersion}`} conversationId={`prep:${study.id}`} context={{ preparation }} /></section>
      </section>
      <aside className="prep-controls">
        <section className="prep-card"><div className="prep-card-title"><span>1</span><div><h2>Opponent</h2><p>Search updates as you type.</p></div></div><div className="prep-search"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name or FIDE ID" aria-label="Search players" />{searching && <i />}</div>{searchState === 'error' && <p className="prep-error">Search is unavailable. Check the library server.</p>}{searchState === 'empty' && <p className="prep-empty">No exact matches. Try the full name or FIDE ID.</p>}{results.length > 0 && <div className="prep-results">{results.slice(0, 8).map((player) => <button className="prep-result" key={`${player.fide_id}-${player.name}`} disabled={!player.fide_id} onClick={() => selectOpponent(player)}><span>{player.flag || '♟'}</span><span><strong>{player.name}</strong><small>{player.federation || 'Unknown'} · FIDE {player.fide_id || 'unverified'} · {player.games} games</small></span><b>Select</b></button>)}</div>}{opponent && <div className="prep-opponent"><span>♟</span><div><small>SELECTED</small><strong>{opponent.name}</strong><p>FIDE {opponent.fideId || 'unverified'}</p></div>{opponent.fideId && <button className="prep-link" onClick={() => navigate(`/players/${opponent.fideId}`)}>Profile ↗</button>}</div>}</section>
        <section className="prep-card"><div className="prep-card-title"><span>2</span><div><h2>Game plan</h2><p>Keep the brief specific.</p></div></div><div className="prep-form"><label>Your name<input value={preparation.player?.name || ''} onChange={(event) => patch({ player: { name: event.target.value } })} placeholder="Your name" /></label><label>Your color<select value={preparation.color} onChange={(event) => patch({ color: event.target.value as Preparation['color'] })}><option value="unknown">Not decided</option><option value="white">White</option><option value="black">Black</option></select></label><label>Opening<input value={preparation.opening} onChange={(event) => patch({ opening: event.target.value })} placeholder="e.g. Sicilian Defence" /></label><label>Goal and notes<textarea value={preparation.notes} onChange={(event) => patch({ notes: event.target.value })} placeholder="What outcome and lines matter?" /></label></div>{conflict && <p className="prep-warning">Your notes mention the opposite color. Resolve that before agreeing the final plan.</p>}</section>
        <section className="prep-card"><div className="prep-card-title"><span>3</span><div><h2>Review and readiness</h2><p>Inspect evidence, agree a plan, then study it.</p></div></div><button className="prep-primary" onClick={() => void requestCoach('repertoire', `Review ${opponent?.name}'s available games by color. Show found, used and excluded counts, date ranges, limitations, opening patterns and linked examples.`)} disabled={!opponent?.fideId || !!working}>{working === 'review' ? 'Creating review…' : 'Create evidence review'}</button><button className="prep-secondary" onClick={() => void requestCoach('preparation_plan', 'Create the final preparation plan from our discussion. Separate evidence from hypotheses, include concrete recommendations and cite the supplied games.')} disabled={!review || conflict || !!working}>{working === 'plan' ? 'Saving plan…' : 'Agree final plan'}</button><button className="prep-board" onClick={() => void openBoard()} disabled={!preparation.plan?.sourceGameId}>Open on board →</button>{!opponent?.fideId && <p className="prep-hint">Select a verified library player first.</p>}</section>
      </aside>
    </div>
  </div></main>;
}
