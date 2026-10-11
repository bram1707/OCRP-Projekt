// Erzeugt die Platzhalter-Fotos in <ordner>/bilder/ aus <ordner>/labels.json: npm run bilder
// Ohne Angabe ist <ordner> testdaten/, für die Demo-Daten: npm run bilder -- testdaten/demo
// Nur fiktive Inhalte. Das unleserliche Label wird absichtlich verschwommen gezeichnet.
// Dazu kommen die Fotos, die erst die Simulation liefert (Nachbesserung, Foto nachreichen).

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { LabelDaten } from '../src/db/datenbank.ts';

const ordner = process.argv[2] ? resolve(process.argv[2]) : import.meta.dirname;
const labels = JSON.parse(readFileSync(join(ordner, 'labels.json'), 'utf8')) as LabelDaten[];

/** Was tatsächlich auf dem Label steht, wenn die OCR es nicht lesen konnte. */
const ECHTER_TEXT: Record<string, string> = {
  'STA4-08': 'ACHTUNG! Quetschgefahr. Hände fernhalten.\nUWAGA! Ryzyko zgniecenia. Trzymać ręce z dala.',
};
const VERSCHWOMMEN = new Set(['STA4-08']);

function xml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Breite eines Zeichens beim Umbrechen: chinesische Schriftzeichen sind etwa doppelt so breit. */
const breiteVon = (text: string) => [...text].reduce((n, z) => n + (/\p{Script=Han}/u.test(z) ? 2 : 1), 0);

function umbrechen(text: string, breite = 34): string[] {
  const zeilen: string[] = [];
  for (const absatz of text.split('\n')) {
    let zeile = '';
    // Chinesisch hat keine Leerzeichen: dort darf nach jedem Satzzeichen umbrochen werden.
    for (const wort of absatz.replace(/([。！；])/gu, '$1 ').trim().split(' ')) {
      if (breiteVon(`${zeile} ${wort}`.trim()) > breite) {
        zeilen.push(zeile);
        zeile = wort;
      } else {
        zeile = /\p{Script=Han}$/u.test(zeile) || /[。！；]$/u.test(zeile) ? zeile + wort : `${zeile} ${wort}`.trim();
      }
    }
    zeilen.push(zeile, '');
  }
  return zeilen.slice(0, -1);
}

interface Foto {
  id: string;
  text: string;
  verschwommen: boolean;
  /** Zusatz in der Bildunterschrift, z. B. „neues Label“ */
  zusatz?: string;
}

/**
 * Art des Schildes nach ISO 7010, aus dem Text abgeleitet (Optimierung 2, Punkt 7):
 * Verbot rot, Gebot blau, Rettung grün, sonst Warnung gelb.
 */
export type Schildart = 'warnung' | 'verbot' | 'gebot' | 'rettung';

export function schildart(text: string): Schildart {
  const t = text.toLowerCase();
  if (/notausgang|exit|出口|wyjście|sortie|выход/u.test(t)) return 'rettung';
  if (/verboten|zakaz|wzbroniony|interdit|yasak|забранено|запрещ|禁止|prohibited/u.test(t)) return 'verbot';
  if (/tragen|nosić|носете|носить|takın|佩戴|wear|porter/u.test(t)) return 'gebot';
  return 'warnung';
}

/** Bildzeichen im Schild: Blitz, Hand, Hitze, Brille, Gehörschutz, Flamme, Person, Pfeil oder Ausrufezeichen. */
function bildzeichen(text: string, farbe: string): string {
  const t = text.toLowerCase();
  if (/spannung|napięcie|voltage|напрежение|напряжение|gerilim|tension|électrique|高压|触电/u.test(t)) {
    return `<polygon points="-6,-22 8,-22 0,-4 10,-4 -8,24 -2,2 -10,2" fill="${farbe}"/>`;
  }
  if (/quetsch|crush|zgniec|écrasement|смачкване|ezilme|夹手/u.test(t)) {
    return `<rect x="-14" y="-4" width="28" height="18" rx="4" fill="${farbe}"/><rect x="-14" y="-18" width="6" height="16" rx="3" fill="${farbe}"/><rect x="-6" y="-22" width="6" height="20" rx="3" fill="${farbe}"/><rect x="2" y="-20" width="6" height="18" rx="3" fill="${farbe}"/><rect x="-22" y="16" width="44" height="6" fill="${farbe}"/>`;
  }
  if (/heiß|hot|gorąca|chaude|sıcak|гореща|горячая|高温/u.test(t)) {
    const welle = (x: number) => `<path d="M${x},18 q-6,-8 0,-16 q6,-8 0,-16" fill="none" stroke="${farbe}" stroke-width="4"/>`;
    return `${welle(-10)}${welle(0)}${welle(10)}<rect x="-18" y="18" width="36" height="5" fill="${farbe}"/>`;
  }
  if (/schutzbrille|okulary|очила|очки|gözlük|护目镜|glasses|lunettes/u.test(t)) {
    return `<circle cx="-10" cy="0" r="8" fill="none" stroke="${farbe}" stroke-width="4"/><circle cx="10" cy="0" r="8" fill="none" stroke="${farbe}" stroke-width="4"/><rect x="-2" y="-2" width="4" height="3" fill="${farbe}"/>`;
  }
  if (/gehörschutz|ochronniki|антифони|hearing|kulaklık|耳罩/u.test(t)) {
    return `<path d="M-16,4 a16,16 0 0 1 32,0" fill="none" stroke="${farbe}" stroke-width="4"/><rect x="-20" y="2" width="9" height="14" rx="3" fill="${farbe}"/><rect x="11" y="2" width="9" height="14" rx="3" fill="${farbe}"/>`;
  }
  if (/rauchen|feuer|fumer|smoking|sigara|吸烟|明火/u.test(t)) {
    return `<path d="M0,-20 q12,14 6,26 q-6,10 -12,0 q-6,-12 6,-26z" fill="${farbe}"/>`;
  }
  if (/notausgang|exit|出口/u.test(t)) {
    return `<rect x="6" y="-20" width="16" height="40" fill="none" stroke="${farbe}" stroke-width="3"/><circle cx="-8" cy="-14" r="4" fill="${farbe}"/><path d="M-8,-8 l-6,14 m6,-14 l6,12 m-6,-10 l-10,4 m10,-4 l8,-4" stroke="${farbe}" stroke-width="4"/><path d="M-22,22 h18 l-6,-6 m6,6 l-6,6" fill="none" stroke="${farbe}" stroke-width="3"/>`;
  }
  if (/zutritt|betreten|wstęp|entrée|entrer|girişi|влизането|вход|进入|入内/u.test(t)) {
    return `<circle cx="0" cy="-14" r="5" fill="${farbe}"/><path d="M0,-8 v16 m0,0 l-7,14 m7,-14 l7,14 m-7,-18 l-10,6 m10,-6 l10,6" stroke="${farbe}" stroke-width="4" fill="none"/>`;
  }
  return `<text x="0" y="14" font-size="38" font-weight="bold" text-anchor="middle" fill="${farbe}">!</text>`;
}

/** Das Schild selbst, je nach Art mit eigener Form, Farbe und Anordnung. */
function schild(art: Schildart, text: string, zeilen: string[], unterschrift: string): string {
  const textZeilen = (x: number, y: number, farbe: string) =>
    zeilen.map((z, i) => `<text x="${x}" y="${y + i * 24}" font-size="19" fill="${farbe}">${xml(z)}</text>`).join('\n    ');
  const klein = `<text x="130" y="44" font-size="14" fill="#333">${xml(unterschrift)}</text>`;
  switch (art) {
    case 'verbot':
      // Weißes Schild, rotes Verbotszeichen oben links, roter Balken, Text darunter.
      return `<rect x="16" y="16" width="448" height="308" rx="10" fill="#fff" stroke="#111" stroke-width="3"/>
    <g transform="translate(72,72)">${bildzeichen(text, '#111')}<circle r="40" fill="none" stroke="#c8102e" stroke-width="9"/><line x1="-28" y1="-28" x2="28" y2="28" stroke="#c8102e" stroke-width="9"/></g>
    ${klein}
    <rect x="130" y="62" width="318" height="16" fill="#c8102e"/>
    <g>${textZeilen(40, 140, '#111')}</g>`;
    case 'gebot':
      // Weißes Schild mit blauer Kopfzeile und blauem Gebotszeichen.
      return `<rect x="16" y="16" width="448" height="308" rx="10" fill="#fff" stroke="#005387" stroke-width="5"/>
    <rect x="16" y="16" width="448" height="104" rx="10" fill="#005387"/>
    <g transform="translate(72,68)"><circle r="40" fill="#fff"/><circle r="34" fill="#005387"/>${bildzeichen(text, '#fff')}</g>
    <text x="130" y="44" font-size="14" fill="#fff">${xml(unterschrift)}</text>
    <g>${textZeilen(40, 150, '#111')}</g>`;
    case 'rettung':
      // Grünes Rettungszeichen, weißer Text, Bildzeichen rechts.
      return `<rect x="16" y="16" width="448" height="308" rx="10" fill="#009a44" stroke="#111" stroke-width="3"/>
    <g transform="translate(400,76)"><rect x="-40" y="-40" width="80" height="80" rx="6" fill="#fff"/>${bildzeichen(text, '#009a44')}</g>
    <text x="40" y="44" font-size="14" fill="#fff">${xml(unterschrift)}</text>
    <g>${textZeilen(40, 150, '#fff')}</g>`;
    default:
      // Gelbes Warnzeichen wie bisher, mit Bildzeichen im Dreieck.
      return `<rect x="16" y="16" width="448" height="308" rx="10" fill="#ffd400" stroke="#111" stroke-width="5"/>
    <polygon points="70,30 116,110 24,110" fill="#111"/>
    <polygon points="70,44 104,104 36,104" fill="#ffd400"/>
    <g transform="translate(70,82) scale(0.8)">${bildzeichen(text, '#111')}</g>
    <text x="130" y="80" font-size="16">${xml(unterschrift)}</text>
    <g fill="#111">
    ${textZeilen(40, 130, '#111')}
    </g>`;
  }
}

function svg(foto: Foto): string {
  const zeilen = umbrechen(foto.text);
  const filter = foto.verschwommen ? ' filter="url(#unscharf)"' : '';
  const unterschrift = `Platzhalterfoto · ${foto.id}${foto.zusatz ? ` (${foto.zusatz})` : ''}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="340" viewBox="0 0 480 340" font-family="Arial, 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif" role="img" aria-label="Platzhalterfoto Label ${xml(foto.id)}">
  <defs><filter id="unscharf"><feGaussianBlur stdDeviation="3.2"/></filter></defs>
  <rect width="480" height="340" fill="#d9d9d9"/>
  <g${filter}>
    ${schild(schildart(foto.text), foto.text, zeilen, unterschrift)}
  </g>
</svg>
`;
}

const fotos = new Map<string, Foto>();
for (const l of labels) {
  if (l.bild !== null) {
    fotos.set(l.bild, { id: l.id, text: ECHTER_TEXT[l.id] ?? l.ocrText, verschwommen: VERSCHWOMMEN.has(l.id) });
  }
  if (l.nachKorrektur?.bild) fotos.set(l.nachKorrektur.bild, { id: l.id, text: l.nachKorrektur.ocrText, verschwommen: false, zusatz: 'neues Label' });
  if (l.nacherfassung) fotos.set(l.nacherfassung.bild, { id: l.id, text: l.nacherfassung.ocrText, verschwommen: false, zusatz: 'nachgereicht' });
}

mkdirSync(join(ordner, 'bilder'), { recursive: true });
for (const [datei, foto] of fotos) writeFileSync(join(ordner, 'bilder', datei), svg(foto));
console.log(`${fotos.size} Bilder erzeugt.`);
