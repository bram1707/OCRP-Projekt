// Welche Labels sind auffällig, und warum (AK-19, AK-32)?
// Zweisprachigkeit allein ist nie auffällig. Eine Abweichung von der Mehrheit
// der Anlage ist ein Hinweis für Max, kein Fehler.

import { istUnsicher, SCHWELLE_OCR, SCHWELLE_SPRACHE } from './detectLanguage.ts';
import { sprachName } from './sprachen.ts';

export type GrundCode =
  | 'unsicher_ocr'
  | 'unsicher_sprache'
  | 'text_unleserlich'
  | 'abweichende_sprachen'
  | 'nachgebessert';

export interface Grund {
  code: GrundCode;
  /** ein Satz in einfacher Sprache */
  text: string;
}

export interface Auffaelligkeit {
  auffaellig: boolean;
  gruende: Grund[];
}

export interface BewertbaresLabel {
  id: string;
  /** false, wenn kein Foto erfasst wurde */
  hatFoto: boolean;
  ocrText: string;
  ocrKonfidenz: number;
  sprachen: string[];
  konfidenzJeSprache: Record<string, number>;
  sprachKonfidenz: number;
  /** kam mindestens einmal aus der Nachbesserung zurück */
  nachgebessert: boolean;
}

/** Weniger als so viele Buchstaben gelten als „sehr kurz“. */
const MIN_BUCHSTABEN = 12;

function prozent(wert: number): string {
  return `${Math.round(wert * 100)} %`;
}

export function kombination(sprachen: readonly string[]): string {
  return [...sprachen].sort().join('+');
}

function kombinationLesbar(schluessel: string): string {
  return schluessel.split('+').map(sprachName).join(' und ');
}

function istSicherErkannt(l: BewertbaresLabel): boolean {
  return l.hatFoto && !istUnsicher(l.ocrKonfidenz, l.sprachKonfidenz, l.sprachen);
}

export interface Mehrheit {
  kombination: string;
  anzahl: number;
  /** Zahl der sicher erkannten Labels, unter denen gezählt wurde */
  basis: number;
}

/** Häufigste Sprachkombination der sicher erkannten Labels, wenn sie mehr als die Hälfte stellt. */
export function mehrheitsKombination(labels: readonly BewertbaresLabel[]): Mehrheit | null {
  const sichere = labels.filter(istSicherErkannt);
  const zaehler = new Map<string, number>();
  for (const l of sichere) {
    const k = kombination(l.sprachen);
    zaehler.set(k, (zaehler.get(k) ?? 0) + 1);
  }
  let beste: Mehrheit | null = null;
  for (const [k, anzahl] of zaehler) {
    if (!beste || anzahl > beste.anzahl) beste = { kombination: k, anzahl, basis: sichere.length };
  }
  return beste && beste.anzahl * 2 > beste.basis ? beste : null;
}

function istTextUnleserlich(l: BewertbaresLabel): boolean {
  const buchstaben = (l.ocrText.match(/\p{L}/gu) ?? []).length;
  return l.sprachen.includes('unbekannt') || buchstaben < MIN_BUCHSTABEN;
}

/** Bewertet alle Labels einer Anlage. Labels ohne Foto werden nicht bewertet (Status „Fehlt“). */
export function bewerteAnlage(labels: readonly BewertbaresLabel[]): Map<string, Auffaelligkeit> {
  const mehrheit = mehrheitsKombination(labels);
  const ergebnis = new Map<string, Auffaelligkeit>();

  for (const l of labels) {
    const gruende: Grund[] = [];
    if (l.hatFoto) {
      if (l.ocrKonfidenz < SCHWELLE_OCR) {
        gruende.push({ code: 'unsicher_ocr', text: `Text schlecht lesbar (Texterkennung ${prozent(l.ocrKonfidenz)}).` });
      }
      if (l.sprachKonfidenz < SCHWELLE_SPRACHE || l.sprachen.includes('unbekannt')) {
        const schwach = Object.entries(l.konfidenzJeSprache)
          .filter(([, k]) => k < SCHWELLE_SPRACHE)
          .map(([code, k]) => `${sprachName(code)} ${prozent(k)}`);
        const detail = schwach.length > 0 ? ` (${schwach.join(', ')})` : '';
        gruende.push({ code: 'unsicher_sprache', text: `Sprache nicht sicher erkannt${detail}.` });
      }
      if (istTextUnleserlich(l)) {
        gruende.push({ code: 'text_unleserlich', text: 'Text ist leer, sehr kurz oder unleserlich.' });
      }
      if (mehrheit && istSicherErkannt(l) && kombination(l.sprachen) !== mehrheit.kombination) {
        gruende.push({
          code: 'abweichende_sprachen',
          text:
            `Sprachen anders als bei ${mehrheit.anzahl} von ${mehrheit.basis} Labels dieser Anlage: ` +
            `hier ${kombinationLesbar(kombination(l.sprachen))}, sonst ${kombinationLesbar(mehrheit.kombination)}.`,
        });
      }
      if (l.nachgebessert) {
        gruende.push({ code: 'nachgebessert', text: 'Kam nach einer Nachbesserung zurück, bitte erneut prüfen.' });
      }
    }
    ergebnis.set(l.id, { auffaellig: gruende.length > 0, gruende });
  }
  return ergebnis;
}
