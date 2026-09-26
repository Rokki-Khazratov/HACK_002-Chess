import { useEffect, useState } from 'react';
import App from '../App';
import type { Navigate } from '../Root';
import { importPgn } from '../chess/pgn';
import { addMove, createTree, type MoveTree } from '../chess/tree';
import { getJson } from './api';
import type { GameDetail } from './api';

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
  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      getJson<GameDetail>(`/api/games/${id}`, controller.signal),
      fetch(`/api/games/${id}/pgn`, { signal:controller.signal }).then((response) => {
        if (!response.ok) throw new Error(`PGN недоступен: HTTP ${response.status}`);
        return response.text();
      }),
    ]).then(([game, pgn]) => {
      const result = importPgn(pgn);
      setLoaded('error' in result
        ? { game, tree:legalPrefix(game), note:'Исходный PGN содержит ошибку. Показаны доступные легальные ходы.' }
        : { game, tree:result.tree, note:'' });
      document.title = `${game.white_name} — ${game.black_name} · ChessScope`;
    }).catch((e: Error) => { if (!controller.signal.aborted) setError(e.message); });
    return () => { controller.abort(); document.title = 'ChessScope'; };
  }, [id]);

  if (error) return <main className="catalog-page"><button className="back-link" type="button" onClick={() => navigate('/')}>← К партиям</button><div className="catalog-empty">{error}</div></main>;
  if (!loaded) return <main className="catalog-page"><div className="catalog-empty">Открываем партию и PGN…</div></main>;
  const { game, tree, note } = loaded;
  const source = game.source_url && /^https?:\/\//.test(game.source_url) ? game.source_url : null;
  return <main className="game-page">
    <div className="game-page-heading">
      <div><button className="back-link" type="button" onClick={() => navigate('/')}>← К партиям</button>
        <h1>{game.white_name} <span>—</span> {game.black_name}</h1>
        <div className="game-page-context"><a href={`/tournaments/${game.event_id}`} onClick={(e) => { e.preventDefault(); navigate(`/tournaments/${game.event_id}`); }}>{game.tournament}</a>
          <span>{game.played_on || 'Дата неизвестна'}</span>{game.round && <span>Раунд {game.round}</span>}{game.eco && <span>{game.eco}</span>}</div></div>
      <div className="game-page-actions"><a href={`/api/games/${id}/pgn`} download>Скачать PGN</a>{source && <a href={source} target="_blank" rel="noopener noreferrer">Источник ↗</a>}</div>
    </div>
    {note && <p className="game-parse-note">{note}</p>}
    <App initialTree={tree} game={game} />
  </main>;
}
