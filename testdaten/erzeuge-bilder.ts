// Erzeugt die Platzhalter-Fotos in testdaten/bilder/ aus labels.json: npm run bilder
// Nur fiktive Inhalte. Das unleserliche Label wird absichtlich verschwommen gezeichnet.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { LabelDaten } from '../src/db/datenbank.ts';

const ordner = import.meta.dirname;
const labels = JSON.parse(readFileSync(join(ordner, 'labels.json'), 'utf8')) as LabelDaten[];

/** Was tatsächlich auf dem Label steht, wenn die OCR es nicht lesen konnte. */
const ECHTER_TEXT: Record<string, string> = {
  'STA4-08': 'ACHTUNG! Quetschgefahr. Hände fernhalten.\nUWAGA! Ryzyko zgniecenia. Trzymać ręce z dala.',
};
const VERSCHWOMMEN = new Set(['STA4-08']);

function xml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function umbrechen(text: string, breite = 34): string[] {
  const zeilen: string[] = [];
  for (const absatz of text.split('\n')) {
    let zeile = '';
    for (const wort of absatz.split(' ')) {
      if ((zeile + ' ' + wort).trim().length > breite) {
        zeilen.push(zeile);
        zeile = wort;
      } else {
        zeile = (zeile + ' ' + wort).trim();
      }
    }
    zeilen.push(zeile, '');
  }
  return zeilen.slice(0, -1);
}

function svg(label: LabelDaten): string {
  const text = ECHTER_TEXT[label.id] ?? label.ocrText;
  const zeilen = umbrechen(text)
    .map((z, i) => `<text x="40" y="${130 + i * 24}" font-size="19">${xml(z)}</text>`)
    .join('\n    ');
  const filter = VERSCHWOMMEN.has(label.id) ? ' filter="url(#unscharf)"' : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="340" viewBox="0 0 480 340" font-family="Arial, sans-serif" role="img" aria-label="Platzhalterfoto Label ${label.id}">
  <defs><filter id="unscharf"><feGaussianBlur stdDeviation="3.2"/></filter></defs>
  <rect width="480" height="340" fill="#d9d9d9"/>
  <g${filter}>
    <rect x="16" y="16" width="448" height="308" rx="10" fill="#ffd400" stroke="#111" stroke-width="5"/>
    <polygon points="70,36 110,104 30,104" fill="#111"/>
    <polygon points="70,50 100,98 40,98" fill="#ffd400"/>
    <text x="64" y="94" font-size="38" font-weight="bold">!</text>
    <text x="130" y="80" font-size="16">Platzhalterfoto · ${xml(label.id)}</text>
    <g fill="#111">
    ${zeilen}
    </g>
  </g>
</svg>
`;
}

mkdirSync(join(ordner, 'bilder'), { recursive: true });
for (const label of labels) {
  if (label.bild === null) continue;
  writeFileSync(join(ordner, 'bilder', label.bild), svg(label));
}
console.log(`${labels.filter((l) => l.bild !== null).length} Bilder erzeugt.`);
