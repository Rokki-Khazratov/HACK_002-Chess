import { useEffect, useState } from 'react';
import App from '../App';
import type { Navigate } from '../Root';
import { importPgn } from '../chess/pgn';
import { addMove, createTree, type MoveTree } from '../chess/tree';
import { getJson } from './api';
import type { GameDetail } from './api';
import { MOCK_PGN } from '../dev/mockGame';

type Loaded = { game: GameDetail; tree: MoveTree; note: string };

function legalPrefix(game: GameDetail): MoveTree {
  let tree = createTree(game.initial_fen);
  let node = tree.rootId;
  for (const move of game.moves) {
    const added = addMove(tree, node, { from:move.uci.slice(0, 2), to:move.uci.slice(2, 4), promotion:move.uci[4] });
    if (!added) break;
    tree = added.tree;
    node = added.nodeId;
  }
  return tree;
}

export function GamePage({ id, navigate }: { id: number; navigate: Navigate }) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState('');
  const [mockLoaded, setMockLoaded] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      getJson<GameDetail>(`/api/games/${id}`, controller.signal),
      fetch(`/api/games/${id}/pgn`, { signal:controller.signal }).then((response) => {
        if (!response.ok) throw new Error(`PGN unavailable: HTTP ${response.status}`);
        return response.text();
      }),
    ]).then(([game, pgn]) => {
      const result = importPgn(pgn);
      setLoaded('error' in result
        ? { game, tree:legalPrefix(game), note:'The source PGN contains an error. Showing the available legal moves.' }
        : { game, tree:result.tree, note:'' });
      document.title = `${game.white_name} — ${game.black_name} · ChessScope`;
    }).catch((e: Error) => { if (!controller.signal.aborted) setError(e.message); });
    return () => { controller.abort(); document.title = 'ChessScope'; };
  }, [id]);

  if (error) return <main className="catalog-page"><button className="back-link" type="button" onClick={() => navigate('/')}>← Back to games</button><div className="catalog-empty">{error}</div></main>;
  if (!loaded) return <main className="catalog-page"><div className="catalog-empty">Opening game and PGN…</div></main>;
  const { game, tree, note } = loaded;
  const displayedGame: GameDetail = mockLoaded ? { ...game,
    white_name:'Carlsen, Magnus', black_name:'Nepomniachtchi, Ian', white_id:1503014, black_id:4168119,
    white_rating:2855, black_rating:2782, white_fed:'NOR', black_fed:'RUS', white_flag:'🇳🇴', black_flag:'🏳️',
    tournament:'World Championship Match 2021', played_on:'2021-12-03', round:'6', eco:'D02', result:'1-0',
    source_url:'https://lichess.org/study/RoBvWqfx/0IsLRqJa',
  } : game;
  const source = displayedGame.source_url && /^https?:\/\//.test(displayedGame.source_url) ? displayedGame.source_url : null;
  return <main className="game-page">
    <div className="game-page-heading">
      <div><button className="back-link" type="button" onClick={() => navigate('/')}>← Back to games</button>
        <h1>{displayedGame.white_id ? <a href={`/players/${displayedGame.white_id}`} onClick={(e) => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; e.preventDefault(); navigate(`/players/${displayedGame.white_id}`); }}>{displayedGame.white_name}</a> : displayedGame.white_name} <span>—</span> {displayedGame.black_id ? <a href={`/players/${displayedGame.black_id}`} onClick={(e) => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; e.preventDefault(); navigate(`/players/${displayedGame.black_id}`); }}>{displayedGame.black_name}</a> : displayedGame.black_name}</h1>
        <div className="game-page-context">{mockLoaded ? <span className="game-mock-label">Mock data · {displayedGame.tournament}</span> : <a href={`/tournaments/${game.event_id}`} onClick={(e) => { e.preventDefault(); navigate(`/tournaments/${game.event_id}`); }}>{game.tournament}</a>}
          <span>{displayedGame.played_on || 'Date unknown'}</span>{displayedGame.round && <span>Round {displayedGame.round}</span>}{displayedGame.eco && <span>{displayedGame.eco}</span>}</div></div>
      <div className="game-page-actions"><a href={mockLoaded ? `data:application/x-chess-pgn;charset=utf-8,${encodeURIComponent(MOCK_PGN)}` : `/api/games/${id}/pgn`} download={mockLoaded ? 'carlsen-nepomniachtchi-game6.pgn' : undefined}>Download PGN</a>{source && <a href={source} target="_blank" rel="noopener noreferrer">Source ↗</a>}</div>
    </div>
    {note && <p className="game-parse-note">{note}</p>}
    <App initialTree={tree} game={displayedGame} onMockChange={(enabled) => { setMockLoaded(enabled); document.title = enabled ? 'Carlsen — Nepomniachtchi · ChessScope' : `${game.white_name} — ${game.black_name} · ChessScope`; }} />
  </main>;
}
