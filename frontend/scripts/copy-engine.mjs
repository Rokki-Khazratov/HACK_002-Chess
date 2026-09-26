// Copies the single-threaded lite Stockfish WASM build into public/ so the browser
// can load it as a Web Worker without SharedArrayBuffer / COOP+COEP headers.
import { copyFileSync, mkdirSync } from 'node:fs';

const FILES = ['stockfish-19-lite-single.js', 'stockfish-19-lite-single.wasm', 'Copying.txt'];
const pkg = new URL('../node_modules/stockfish/', import.meta.url);
const dest = new URL('../public/stockfish/', import.meta.url);

mkdirSync(dest, { recursive: true });
for (const file of FILES) {
  const from = file.endsWith('.txt') ? new URL(file, pkg) : new URL(`bin/${file}`, pkg);
  copyFileSync(from, new URL(file, dest));
}
console.log(`Copied ${FILES.length} engine files to public/stockfish/`);
