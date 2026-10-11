// Sucht im OCR-Text die typischen Wörter und Zeichen jeder Sprache.
// Die Fundstellen (Start/Ende im Text) sind die Belege für den „Warum?“-Knopf.

import { SPRACHEN, type Sprachcode } from './sprachen.ts';

export interface Beleg {
  sprache: Sprachcode;
  art: 'wort' | 'zeichen';
  text: string;
  /** Position im OCR-Text (Zeichenindex), Ende exklusiv */
  start: number;
  ende: number;
}

export interface SprachTreffer {
  code: Sprachcode;
  /** verschiedene gefundene Wörter, klein geschrieben */
  woerter: string[];
  /** verschiedene gefundene Zeichen */
  zeichen: string[];
  belege: Beleg[];
}

const WORT = /\p{L}+/gu;

export function findeBelege(text: string): SprachTreffer[] {
  const treffer: SprachTreffer[] = [];
  const woerterImText = [...text.matchAll(WORT)];

  for (const sprache of SPRACHEN) {
    const liste = new Set(sprache.woerter);
    const belege: Beleg[] = [];
    const woerter = new Set<string>();
    const zeichen = new Set<string>();

    for (const m of woerterImText) {
      const wort = m[0].toLowerCase();
      if (liste.has(wort)) {
        woerter.add(wort);
        belege.push({ sprache: sprache.code, art: 'wort', text: m[0], start: m.index, ende: m.index + m[0].length });
      }
    }

    if (sprache.zeichen) {
      const global = new RegExp(sprache.zeichen.source, 'gu');
      for (const m of text.matchAll(global)) {
        zeichen.add(m[0].toLowerCase());
        belege.push({ sprache: sprache.code, art: 'zeichen', text: m[0], start: m.index, ende: m.index + m[0].length });
      }
    }

    if (belege.length > 0) {
      belege.sort((a, b) => a.start - b.start);
      treffer.push({ code: sprache.code, woerter: [...woerter], zeichen: [...zeichen], belege });
    }
  }
  return treffer;
}
