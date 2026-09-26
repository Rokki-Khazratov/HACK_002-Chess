// Builds src/data/openings.json from the Lichess chess-openings dataset (CC0).
// Source: https://github.com/lichess-org/chess-openings — run: node scripts/build-openings.mjs
import { writeFileSync } from 'node:fs';
import { Chess } from 'chess.js';

const BASE = 'https://raw.githubusercontent.com/lichess-org/chess-openings/master/';
const byEpd = {};

for (const part of ['a', 'b', 'c', 'd', 'e']) {
  const res = await fetch(`${BASE}${part}.tsv`);
  if (!res.ok) throw new Error(`Failed to fetch ${part}.tsv: ${res.status}`);
  const lines = (await res.text()).trim().split('\n').slice(1);
  for (const line of lines) {
    const [eco, name, pgn] = line.split('\t');
    const chess = new Chess();
    chess.loadPgn(pgn);
    const epd = chess.fen().split(' ').slice(0, 4).join(' ');
    byEpd[epd] = [eco, name];
  }
}

writeFileSync(new URL('../src/data/openings.json', import.meta.url), JSON.stringify(byEpd));
console.log(`Wrote ${Object.keys(byEpd).length} opening positions`);
