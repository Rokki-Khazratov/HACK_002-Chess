import { pathTo, type MoveTree } from '../chess/tree';
import { openingAt } from '../chess/openings';
import type { EngineState } from '../engine/stockfish';
import type { CoachContext, Preparation } from './types';

export function boardContext(tree: MoveTree, nodeId: string, source: CoachContext['boardSource'], gameId: number | undefined,
  preparation: Preparation | undefined, engine: EngineState | undefined): CoachContext {
  const fen = tree.nodes[nodeId].fen;
  return {
    boardSource: source, ...(source === 'library' && gameId ? { gameId } : {}), preparation,
    board: {
      nodeId, fen, rootFen: tree.nodes[tree.rootId].fen,
      line: pathTo(tree, nodeId).map((id) => tree.nodes[id].uci).filter((uci): uci is string => !!uci),
      opening: openingAt(tree, nodeId) ?? undefined,
      ...(engine?.fen === fen && engine.lines.length ? { engine: {
        fen, lines: engine.lines.slice(0, 3).map(({ depth, score, pv }) => ({ depth, score, pv: pv.slice(0, 30) })),
      } } : {}),
    },
  };
}

export function actionAvailable(action: { requires: string[] }, context: CoachContext) {
  return action.requires.every((field) => field === 'opponent'
    ? !!(context.preparation?.opponent?.name || context.preparation?.opponent?.fideId)
    : field === 'board' ? !!context.board : field === 'preparation' ? !!context.preparation : false);
}

export function analysisId() {
  try { const saved = sessionStorage.getItem('chessscope.ai.analysis'); if (saved) return saved; } catch { /* Optional storage. */ }
  return newAnalysisId();
}

export function newAnalysisId() {
  const id = `analysis:${crypto.randomUUID()}`;
  try { sessionStorage.setItem('chessscope.ai.analysis', id); } catch { /* In-memory session still works. */ }
  return id;
}

export type SavedAnalysis = { id: string; title: string; tree: MoveTree; updatedAt: string };
const SAVED_ANALYSES_KEY = 'chessscope.savedAnalyses';
export function readSavedAnalyses(): SavedAnalysis[] {
  try { const value = JSON.parse(localStorage.getItem(SAVED_ANALYSES_KEY) || '[]'); return Array.isArray(value) ? value : []; }
  catch { return []; }
}
export function saveAnalysis(tree: MoveTree, title: string): SavedAnalysis {
  const item = { id: crypto.randomUUID(), title: title.trim() || 'Chess analysis', tree, updatedAt: new Date().toISOString() };
  try { localStorage.setItem(SAVED_ANALYSES_KEY, JSON.stringify([item, ...readSavedAnalyses()])); } catch { /* Analysis remains available in the current session. */ }
  return item;
}
