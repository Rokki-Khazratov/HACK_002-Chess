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
export type TournamentSource = 'fide-official' | 'broadcast';
export interface TournamentSummary extends Tournament {
  first_date: string | null;
  last_date: string | null;
  /** Distinct participants. */
  players: number;
  /** Average event rating of rated participants. */
  avg_elo: number | null;
  top_rating: number | null;
  site: string | null;
  source_kinds: string[];
  /** Games verified as official FIDE-rated classical OTB. */
  accepted_games: number;
}
export interface TournamentList { total: number; page: number; limit: number; tournaments: TournamentSummary[] }
export interface Participant {
  rank: number;
  fide_id: number | null;
  name: string;
  federation: string | null;
  flag: string | null;
  title: string | null;
  event_rating: number | null;
  official_rating: number | null;
  official_month: string | null;
  live_rating: number | null;
  rating_change: number | null;
  points: number;
  games: number;
  wins: number;
  draws: number;
  losses: number;
  performance: number | null;
  buchholz: number | null;
}
export interface TournamentOfficial {
  fide_event_id: string;
  name: string;
  start_date: string;
  end_date: string;
  time_control_text: string;
  fide_details_url: string;
  fide_report_url: string;
}
export interface PrizeFund { amount: number; currency: string; note: string | null; source_url: string }
export interface TournamentDetail extends Tournament {
  first_date: string | null;
  last_date: string | null;
  years: { year: number; games: number }[];
  sources: number;
  white_wins: number;
  black_wins: number;
  draws: number;
  site: string | null;
  time_control: string | null;
  rounds: number | null;
  broadcast_url: string | null;
  official: TournamentOfficial | null;
  prize_fund: PrizeFund | null;
  organizer: string | null;
  avg_elo: number | null;
  avg_live: number | null;
  top_rating: number | null;
  /** FIDE category from avg_elo; only meaningful for round robins. */
  category: number | null;
  /** Sorted by rank. */
  participants: Participant[];
  standings_basis: string;
}
export interface PlayerDetail { fide_id: number; name: string; federation: string | null; federation_basis: string | null; flag: string | null; games: number; official_rating?: number | null; rating_month?: string | null }
export interface Overview { games: number; tournaments: number; players: number; years: { year: number; games: number }[] }

export async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, { signal });
  const body = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
  return body;
}

export const formatNumber = (value: number | undefined | null) => new Intl.NumberFormat('en-US').format(value ?? 0);
