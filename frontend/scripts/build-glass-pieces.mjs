// Builds the "glass" piece set from the cburnett outlines (GPLv2+): translucent
// frosted fills, a specular highlight and a soft drop shadow. Output goes to
// public/pieces/glass. Run: node scripts/build-glass-pieces.mjs
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const SRC = 'public/pieces/cburnett';
const OUT = 'public/pieces/glass';
const CODES = ['P', 'N', 'B', 'R', 'Q', 'K'];

const defs = (white) => `<defs>
<linearGradient id="fill" x1="0" y1="0" x2="0.35" y2="1">
${white
    ? `<stop offset="0" stop-color="#ffffff" stop-opacity="0.96"/>
<stop offset="0.45" stop-color="#eef4f9" stop-opacity="0.82"/>
<stop offset="1" stop-color="#c3d3e0" stop-opacity="0.78"/>`
    : `<stop offset="0" stop-color="#6c7682" stop-opacity="0.92"/>
<stop offset="0.5" stop-color="#2a3038" stop-opacity="0.93"/>
<stop offset="1" stop-color="#0f1216" stop-opacity="0.96"/>`}
</linearGradient>
<filter id="glass" x="-25%" y="-20%" width="150%" height="150%" color-interpolation-filters="sRGB">
<feGaussianBlur in="SourceAlpha" stdDeviation="0.8" result="soft"/>
<feSpecularLighting in="soft" surfaceScale="${white ? 3 : 4}" specularConstant="${white ? 0.9 : 1.15}" specularExponent="24" lighting-color="#ffffff" result="spec">
<feDistantLight azimuth="240" elevation="52"/>
</feSpecularLighting>
<feComposite in="spec" in2="SourceAlpha" operator="in" result="shine"/>
<feOffset in="SourceAlpha" dy="1.1" result="drop"/>
<feGaussianBlur in="drop" stdDeviation="0.9" result="dropSoft"/>
<feColorMatrix in="dropSoft" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.35 0" result="shadow"/>
<feMerge><feMergeNode in="shadow"/><feMergeNode in="SourceGraphic"/><feMergeNode in="shine"/></feMerge>
</filter>
</defs>`;

function glassify(svg, white) {
  const edge = white ? '#7d8f9e' : '#0a0c0f';
  let out = svg
    // Body fills become the glass gradient; black detail lines inside white
    // pieces and light detail lines inside black pieces become soft highlights.
    .replaceAll(white ? 'fill="#fff"' : 'fill="#000"', 'fill="url(#fill)"')
    .replaceAll('stroke="#ececec"', 'stroke="#ffffff" stroke-opacity="0.55"')
    .replaceAll('fill="#ececec"', 'fill="#ffffff" fill-opacity="0.45"')
    .replaceAll('stroke="#000"', `stroke="${edge}"`)
    .replaceAll('fill="#000"', `fill="${edge}"`);
  // Groups without an explicit fill default to black; give them the glass fill.
  out = out.replace(/<g(?![^>]*\bfill=)/, '<g fill="url(#fill)"');
  // Wrap the drawing in the glass filter and add the gradient/filter defs.
  out = out.replace(/(<svg[^>]*>)/, `$1${defs(white)}<g filter="url(#glass)">`).replace(/<\/svg>\s*$/, '</g></svg>');
  return out;
}

mkdirSync(OUT, { recursive: true });
for (const color of ['w', 'b']) {
  for (const piece of CODES) {
    const name = `${color}${piece}.svg`;
    writeFileSync(`${OUT}/${name}`, glassify(readFileSync(`${SRC}/${name}`, 'utf8'), color === 'w'));
  }
}
console.log(`glass pieces written to ${OUT}`);
