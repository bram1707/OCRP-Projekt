// Sucht im OCR-Text die typischen Wörter und Zeichen jeder Sprache.
// Die Fundstellen (Start/Ende im Text) sind die Belege für den „Warum?“-Knopf.
//
// Optimierung 2, Punkt 8: Die Sprache wird abschnittsweise bestimmt. Ein Abschnitt ist eine Zeile;
// eine kurze Überschrift („⚠ ACHTUNG“) gehört zur Zeile darunter. Jeder Abschnitt gehört der Sprache
// mit den stärksten Belegen. Belege einer Sprache zählen nur in Abschnitten, die ihr gehören. So kommen
// bei zweisprachigen Labels zwei Sprachen heraus, und ein einzelnes Wort wie „no“ in einer spanischen
// Zeile macht daraus kein Englisch. Eine zweite Sprache im selben Abschnitt zählt nur mit mindestens zwei
// typischen Wörtern oder wenn sie eine andere Schrift hat (das deutet auf einen Lesefehler, Max soll es sehen).

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

/**
 * Vergleichsform eines Wortes: klein, ohne den Punkt, den „İ“ beim Kleinschreiben mitbringt, und „ı“ wie „i“.
 * So passt „DİKKAT“, „DIKKAT“ und „dikkat“ aus der Texterkennung auf dasselbe Wort.
 */
function vergleichsform(wort: string): string {
  return wort.toLowerCase().replace(/̇/g, '').replace(/ı/g, 'i');
}

const LISTEN = new Map(SPRACHEN.map((s) => [s.code, new Set(s.woerter.map(vergleichsform))]));

/** Alle Belege aller Sprachen im ganzen Text, ohne Zuordnung zu Abschnitten. */
export function findeAlleBelege(text: string): SprachTreffer[] {
  const treffer: SprachTreffer[] = [];
  const woerterImText = [...text.matchAll(WORT)];

  for (const sprache of SPRACHEN) {
    const liste = LISTEN.get(sprache.code)!;
    const belege: Beleg[] = [];
    const woerter = new Set<string>();
    const zeichen = new Set<string>();

    if (sprache.ohneLeerzeichen) {
      // Ohne Leerzeichen gibt es keine Wortgrenzen: jedes Listenwort als Teilstück suchen, längere zuerst,
      // und keine Stelle doppelt zählen.
      const belegt = new Set<number>();
      for (const w of [...sprache.woerter].sort((a, b) => b.length - a.length)) {
        for (let start = text.indexOf(w); start !== -1; start = text.indexOf(w, start + w.length)) {
          const stellen = Array.from({ length: w.length }, (_, i) => start + i);
          if (stellen.some((s) => belegt.has(s))) continue;
          stellen.forEach((s) => belegt.add(s));
          woerter.add(w);
          belege.push({ sprache: sprache.code, art: 'wort', text: w, start, ende: start + w.length });
        }
      }
    } else {
      for (const m of woerterImText) {
        const wort = vergleichsform(m[0]);
        if (liste.has(wort)) {
          woerter.add(wort);
          belege.push({ sprache: sprache.code, art: 'wort', text: m[0], start: m.index, ende: m.index + m[0].length });
        }
      }
    }

    if (sprache.zeichen) {
      const global = new RegExp(sprache.zeichen.source, 'gu');
      for (const m of text.matchAll(global)) {
        // Zeichen, die schon Teil eines Wortbelegs sind, zählen bei Chinesisch nicht noch einmal.
        if (sprache.ohneLeerzeichen && belege.some((b) => b.art === 'wort' && m.index >= b.start && m.index < b.ende)) continue;
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

export interface Abschnitt {
  start: number;
  ende: number;
}

/** Wie viele Wörter eine Zeile hat; chinesische Schriftzeichen zählen je zwei als ein Wort. */
function wortzahl(zeile: string): number {
  const han = (zeile.match(/\p{Script=Han}/gu) ?? []).length;
  const andere = (zeile.replace(/\p{Script=Han}/gu, ' ').match(/\p{L}{2,}/gu) ?? []).length;
  return andere + Math.ceil(han / 2);
}

/** Höchstens so viele Wörter hat eine Überschrift, die zur Zeile darunter gehört. */
const UEBERSCHRIFT_WOERTER = 2;

/** Teilt den Text in Abschnitte: Zeilen mit Buchstaben; eine kurze Überschrift gehört zur nächsten Zeile. */
export function teileInAbschnitte(text: string): Abschnitt[] {
  const zeilen: Abschnitt[] = [];
  let start = 0;
  for (const teil of text.split('\n')) {
    if (/\p{L}/u.test(teil)) zeilen.push({ start, ende: start + teil.length });
    start += teil.length + 1;
  }
  const istUeberschrift = (z: Abschnitt) => wortzahl(text.slice(z.start, z.ende)) <= UEBERSCHRIFT_WOERTER;
  const abschnitte: Abschnitt[] = [];
  for (let i = 0; i < zeilen.length; i += 1) {
    const zeile = zeilen[i]!;
    const naechste = zeilen[i + 1];
    if (naechste && istUeberschrift(zeile) && !istUeberschrift(naechste)) {
      abschnitte.push({ start: zeile.start, ende: naechste.ende });
      i += 1;
    } else {
      abschnitte.push(zeile);
    }
  }
  return abschnitte;
}

/** Stärke der Belege, gleiche Formel wie die Sicherheit im Mock (Wörter zählen viel, Zeichen wenig). */
function staerke(woerter: number, zeichen: number): number {
  if (woerter > 0) return 0.55 + 0.12 * Math.min(woerter, 3) + 0.04 * Math.min(zeichen, 3);
  return zeichen >= 2 ? 0.4 + 0.05 * Math.min(zeichen, 3) : 0;
}

/** Eine zweite Sprache in derselben Zeile zählt erst ab so vielen verschiedenen typischen Wörtern. */
const MIN_WOERTER_ZWEITE_SPRACHE = 2;

/** Schrift einer Sprache. Fremde Schriftzeichen mitten in einem Abschnitt bleiben sichtbar (z. B. kyrillisch gelesene Buchstaben). */
const SCHRIFT: Partial<Record<Sprachcode, string>> = { ru: 'kyrillisch', bg: 'kyrillisch', zh: 'han' };
const schrift = (code: Sprachcode) => SCHRIFT[code] ?? 'lateinisch';

function ausBelegen(code: Sprachcode, belege: Beleg[]): SprachTreffer {
  const woerter = new Set<string>();
  const zeichen = new Set<string>();
  for (const b of belege) {
    if (b.art === 'wort') woerter.add(b.sprache === 'zh' ? b.text : vergleichsform(b.text));
    else zeichen.add(b.text.toLowerCase());
  }
  return { code, woerter: [...woerter], zeichen: [...zeichen], belege };
}

/**
 * Belege je Sprache, aber nur aus den Abschnitten, die dieser Sprache gehören.
 * Das ist die Grundlage für den Sprachvorschlag und für die Markierungen im „Warum?“-Bereich.
 */
export function findeBelege(text: string): SprachTreffer[] {
  const alle = findeAlleBelege(text).flatMap((t) => t.belege);
  const gesammelt = new Map<Sprachcode, Beleg[]>();

  for (const abschnitt of teileInAbschnitte(text)) {
    const hier = alle.filter((b) => b.start >= abschnitt.start && b.ende <= abschnitt.ende);
    const jeSprache = new Map<Sprachcode, Beleg[]>();
    for (const b of hier) jeSprache.set(b.sprache, [...(jeSprache.get(b.sprache) ?? []), b]);

    const bewertet = [...jeSprache].map(([code, belege]) => {
      const t = ausBelegen(code, belege);
      return { code, belege, woerter: t.woerter.length, wert: staerke(t.woerter.length, t.zeichen.length) };
    }).filter((k) => k.wert > 0);
    if (bewertet.length === 0) continue;
    // Stärkste Sprache gewinnt; bei Gleichstand die mit mehr Belegen, dann die frühere.
    bewertet.sort((a, b) => b.wert - a.wert || b.belege.length - a.belege.length || a.belege[0]!.start - b.belege[0]!.start);
    const [sieger, ...rest] = bewertet;
    const behalten = [
      sieger!,
      ...rest.filter((k) => k.woerter >= MIN_WOERTER_ZWEITE_SPRACHE || schrift(k.code) !== schrift(sieger!.code)),
    ];
    for (const k of behalten) gesammelt.set(k.code, [...(gesammelt.get(k.code) ?? []), ...k.belege]);
  }

  return [...gesammelt].map(([code, belege]) => ausBelegen(code, belege.sort((a, b) => a.start - b.start)));
}
