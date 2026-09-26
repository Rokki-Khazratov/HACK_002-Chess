export interface GameSummary {
  id: number;
  tournament: string;
  event_id?: number;
  played_on: string | null;
  round: string | null;
  white_name: string | null;
  black_name: string | null;
  white_id: number | null;
  black_id: number | null;
  white_flag: string | null;
  black_flag: string | null;
  white_rating: number | null;
  black_rating: number | null;
  result: string;
  opening: string | null;
  eco: string | null;
  ply_count: number;
  source_kind: string;
}

export interface GameDetail extends GameSummary {
  event_id: number;
  source_url: string | null;
  game_url: string | null;
  white_fed: string | null;
  black_fed: string | null;
  white_fed_basis: string | null;
  black_fed_basis: string | null;
  headers: Record<string, string>;
  license: string | null;
  initial_fen: string;
  moves: { uci: string; san: string; ply: number }[];
}

export interface GameList { total: number; page: number; limit: number; games: GameSummary[] }
export interface Tournament { id: number; name: string; games: number }
export interface TournamentList { total: number; page: number; limit: number; tournaments: Tournament[] }
export interface TournamentDetail extends Tournament {
  first_date: string | null;
  last_date: string | null;
  years: { year: number; games: number }[];
  sources: number;
  white_wins: number;
  black_wins: number;
  draws: number;
}
export interface Overview { games: number; tournaments: number; players: number; years: { year: number; games: number }[] }

export async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, { signal });
  const body = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
  return body;
}

export const formatNumber = (value: number | undefined | null) => new Intl.NumberFormat('ru-RU').format(value ?? 0);
