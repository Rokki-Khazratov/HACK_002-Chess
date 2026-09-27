import type { Score } from '../engine/stockfish';

export type Person = { name: string; fideId?: number };
export type PreparationPlan = {
  status: 'draft' | 'agreed'; summary: string; recommendations: string[];
  sourceGameId?: number; sourceReferences: string[]; updatedAt: string;
};
export type Preparation = {
  id: string; project: string; player?: Person; opponent?: Person;
  color: 'white' | 'black' | 'unknown'; opening: string; notes: string;
  plan?: PreparationPlan;
};
export type OpponentColorEvidence = {
  found: number; sampleSize: number; excluded: number; sampleLimit: number;
  dateRange: [string, string] | null;
  statuses: Record<string, number>; exclusionReasons: Record<string, number>;
  openings: { name: string; eco?: string; games: number; examples: { id: number; reference: string; date?: string; white?: string; black?: string; result?: string }[] }[];
};
export type OpponentEvidence = {
  source: string; fideId: number; profile?: { fide_id: number; name: string; federation?: string; games: number } | null;
  limitation: string; colors: Record<string, OpponentColorEvidence>;
};
export type CoachContext = {
  preparation?: Preparation;
  gameId?: number;
  boardSource?: 'library' | 'analysis' | 'import' | 'demo';
  board?: {
    nodeId: string; rootFen: string; fen: string; line: string[];
    opening?: { name: string; eco: string };
    engine?: { fen: string; lines: { depth: number; score: Score; pv: string[] }[] };
  };
};
export type CoachAction = { id: string; label: string; version: string; requires: string[]; prompt: string };
export type CoachRequest = { version: 1; conversationId: string; requestId: string; action: string; message: string; context: CoachContext };
export type CoachEngineLine = {
  id: string; rank: number; fen: string; source: string; depth: number;
  score: Score; scorePerspective: 'white'; uci: string[]; notation: string;
};
export type CoachAnalysis = {
  summary: string;
  sections: { kind: 'white_plan' | 'black_plan' | 'advantages' | 'risks' | 'next_steps' | 'answer'; title: string; items: string[] }[];
  lineExplanations: Record<string, string>;
};
export type CoachTurn = {
  id: string; conversationId: string; action: string; blueprintVersion: string;
  message: string; reply: string; model: string; createdAt: string;
  analysis?: CoachAnalysis;
  engineLines?: CoachEngineLine[];
  positionFacts?: { turn: 'white' | 'black'; check: boolean; checkmate: boolean; stalemate: boolean } | null;
  context: CoachContext & {
    opponentEvidence?: OpponentEvidence;
  };
  demo?: boolean;
};
