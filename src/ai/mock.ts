// Mock-Modus der Spracherkennung (Standard, läuft ohne Schlüssel).
// Statt fester Antworten leitet der Mock die Sprachen regelbasiert aus typischen
// Wörtern und Zeichen ab (Entscheidung Bram, 10.10.2026). Er liefert wie ein
// echtes Modell einen JSON-Text, der danach durch die Schemaprüfung muss.

import { findeBelege, type SprachTreffer } from './belege.ts';
import { sprachName, SPRACHEN } from './sprachen.ts';
import { unbekannteAntwort, type SprachAntwort } from './antwortSchema.ts';

/** Ein Sprachmodell bekommt den OCR-Text und antwortet mit JSON-Text. */
export type SprachModell = (ocrText: string) => Promise<string>;

/** Ein einzelnes Zeichen reicht nie; ohne typisches Wort braucht es mindestens zwei verschiedene Zeichen. */
const MIN_ZEICHEN_OHNE_WORT = 2;

function runde(wert: number): number {
  return Math.round(wert * 100) / 100;
}

/**
 * Sicherheit aus der Zahl der Belege.
 * Mit Wörtern: 0,55 + 0,12 je Wort (höchstens 3) + 0,04 je Zeichen (höchstens 3), höchstens 0,99.
 * Nur Zeichen: 0,40 + 0,05 je Zeichen (höchstens 3), also immer deutlich unter 0,9.
 */
export function sicherheitAusBelegen(anzahlWoerter: number, anzahlZeichen: number): number {
  if (anzahlWoerter > 0) {
    return runde(Math.min(0.99, 0.55 + 0.12 * Math.min(anzahlWoerter, 3) + 0.04 * Math.min(anzahlZeichen, 3)));
  }
  if (anzahlZeichen >= MIN_ZEICHEN_OHNE_WORT) {
    return runde(0.4 + 0.05 * Math.min(anzahlZeichen, 3));
  }
  return 0;
}

function zitiere(woerter: string[]): string {
  return woerter.slice(0, 3).map((w) => `„${w}“`).join(', ');
}

function begruendeSprache(t: SprachTreffer): string {
  const name = sprachName(t.code);
  const zeichenName = SPRACHEN.find((s) => s.code === t.code)?.zeichenName ?? '';
  const zeichen = `den Zeichen ${t.zeichen.slice(0, 3).join(' ')} (${zeichenName})`;
  if (t.woerter.length === 0) return `${name} nur vermutet wegen ${zeichen.replace('den Zeichen', 'der Zeichen')}, ohne typische Wörter`;
  const woerter = `den Wörtern ${zitiere(t.woerter)}`;
  return `${name} erkannt an ${t.zeichen.length > 0 ? `${woerter} und ${zeichen}` : woerter}`;
}

/** Ergebnis des Mocks als Objekt (für Tests); `mockModell` liefert dasselbe als JSON-Text. */
export function mockAntwort(ocrText: string): SprachAntwort {
  const kandidaten = findeBelege(ocrText)
    .map((t) => ({ t, sicherheit: sicherheitAusBelegen(t.woerter.length, t.zeichen.length) }))
    .filter((k) => k.sicherheit > 0)
    // Reihenfolge wie im Text, damit „Deutsch 95 %, Polnisch 92 %“ dem Label folgt.
    .sort((a, b) => (a.t.belege[0]?.start ?? 0) - (b.t.belege[0]?.start ?? 0));

  if (kandidaten.length === 0) {
    return unbekannteAntwort('Keine typischen Wörter oder Zeichen einer Sprache gefunden.');
  }

  const konfidenzJeSprache = Object.fromEntries(kandidaten.map((k) => [k.t.code, k.sicherheit]));
  const konfidenz = Math.min(...kandidaten.map((k) => k.sicherheit));
  return {
    sprachen: kandidaten.map((k) => k.t.code),
    konfidenz,
    konfidenzJeSprache,
    prioritaet: konfidenz < 0.9 ? 'genau_pruefen' : 'normal',
    begruendung: `${kandidaten.map((k) => begruendeSprache(k.t)).join('; ')}.`,
  };
}

export const mockModell: SprachModell = async (ocrText) => JSON.stringify(mockAntwort(ocrText));
