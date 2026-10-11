// Status eines Labels, Sperre der Anlage und Reihenfolge in Max' Liste.
// Reine Funktionen ohne Datenbank, damit sie einzeln testbar sind.

import type { Prioritaet } from '../ai/antwortSchema.ts';
import { istUnsicher } from '../ai/detectLanguage.ts';

export const STATUS = ['offen', 'unsicher', 'nachgebessert', 'fehlerhaft', 'bestaetigt', 'fehlt'] as const;
export type Status = (typeof STATUS)[number];

/** Jeder Status hat ein eigenes Wort (AK-14). Die Farbe kommt in Stufe 2 dazu. */
export const STATUS_TEXT: Record<Status, string> = {
  offen: 'Offen',
  unsicher: 'Unsicher',
  nachgebessert: 'Nachgebessert',
  fehlerhaft: 'Fehlerhaft',
  bestaetigt: 'Bestätigt',
  fehlt: 'Fehlt',
};

export const FEHLERGRUENDE = ['unleserlich', 'sprache_falsch', 'beschaedigt'] as const;
export type Fehlergrund = (typeof FEHLERGRUENDE)[number];

export const FEHLERGRUND_TEXT: Record<Fehlergrund, string> = {
  unleserlich: 'Unleserlich',
  sprache_falsch: 'Sprache falsch',
  beschaedigt: 'Label beschädigt',
};

/** Aus diesen Status kann Max ein Label bestätigen oder einen Fehler melden. */
export const PRUEFBAR: readonly Status[] = ['offen', 'unsicher', 'nachgebessert'];

/** Max' Liste: was er prüfen kann, dann Erledigtes. Fehlerhaft und Fehlt stehen nicht darin (AK-13). */
export const IN_MAX_LISTE: readonly Status[] = [...PRUEFBAR, 'bestaetigt'];

export function istStatus(wert: unknown): wert is Status {
  return typeof wert === 'string' && (STATUS as readonly string[]).includes(wert);
}

export function istFehlergrund(wert: unknown): wert is Fehlergrund {
  return typeof wert === 'string' && (FEHLERGRUENDE as readonly string[]).includes(wert);
}

/** Status direkt nach der Erfassung: ohne Foto „Fehlt“, unter den Schwellen „Unsicher“, sonst „Offen“. */
export function anfangsstatus(
  hatFoto: boolean,
  ocrKonfidenz: number,
  sprachKonfidenz: number,
  sprachen: readonly string[],
): Status {
  if (!hatFoto) return 'fehlt';
  return istUnsicher(ocrKonfidenz, sprachKonfidenz, sprachen) ? 'unsicher' : 'offen';
}

export interface Hinderungsgrund {
  labelId: string | null;
  text: string;
}

export interface Freigabepruefung {
  moeglich: boolean;
  hinderungsgruende: Hinderungsgrund[];
}

/**
 * Eine Anlage darf nur freigegeben werden, wenn jedes Label laut Anlagenliste erfasst
 * und bestätigt ist (AK-01, AK-02, AK-45). Jeder andere Status hält sie gesperrt.
 */
export function pruefeFreigabe(
  sollAnzahl: number,
  labels: readonly { id: string; status: Status }[],
): Freigabepruefung {
  const hinderungsgruende: Hinderungsgrund[] = labels
    .filter((l) => l.status !== 'bestaetigt')
    .map((l) => ({ labelId: l.id, text: `Label ${l.id} ist „${STATUS_TEXT[l.status]}“.` }));
  const nichtErfasst = sollAnzahl - labels.length;
  if (nichtErfasst > 0) {
    hinderungsgruende.push({
      labelId: null,
      text: nichtErfasst === 1 ? '1 Label laut Anlagenliste nicht erfasst.' : `${nichtErfasst} Labels laut Anlagenliste nicht erfasst.`,
    });
  }
  if (labels.length === 0) hinderungsgruende.push({ labelId: null, text: 'Die Anlage hat keine Labels.' });
  return { moeglich: hinderungsgruende.length === 0, hinderungsgruende };
}

/**
 * Gesperrt, solange nicht freigegeben. Zusätzlich gilt eine Anlage immer als gesperrt,
 * wenn die Freigabeprüfung scheitert, auch wenn ein Freigabedatum gespeichert ist.
 */
export function istGesperrt(
  freigegebenAm: string | null,
  sollAnzahl: number,
  labels: readonly { id: string; status: Status }[],
): boolean {
  return freigegebenAm === null || !pruefeFreigabe(sollAnzahl, labels).moeglich;
}

/** Relevanz in Max' Liste (AK-13): Nachgebessert, Unsicher, Offen; danach Erledigtes. */
const RANG_MAX: Record<Status, number> = {
  nachgebessert: 0,
  unsicher: 1,
  offen: 2,
  bestaetigt: 3,
  fehlerhaft: 4,
  fehlt: 5,
};

/**
 * Sortiert nach Status-Relevanz (AK-13). Innerhalb gleichen Status zuerst „genau prüfen“ (AK-32),
 * dann auffällige vor unauffälligen (AK-19), dann nach Kennung.
 */
export function sortiereFuerMax<T extends { id: string; status: Status; auffaellig: boolean; prioritaet: Prioritaet }>(
  labels: readonly T[],
): T[] {
  const genau = (l: T) => Number(l.prioritaet === 'genau_pruefen');
  return [...labels].sort(
    (a, b) =>
      RANG_MAX[a.status] - RANG_MAX[b.status] ||
      genau(b) - genau(a) ||
      Number(b.auffaellig) - Number(a.auffaellig) ||
      a.id.localeCompare(b.id),
  );
}

/** Maries vier Zahlen (AK-40): jedes Label gehört zu genau einer Gruppe. */
export const GRUPPEN_MARIE = ['offen', 'erledigt', 'fehlerhaft'] as const;
export type GruppeMarie = (typeof GRUPPEN_MARIE)[number];

/**
 * Zuordnung wie HMW 2 (Widerspruch 6 der Akzeptanzkriterien): „fehlerhaft“ schließt Unsicher und Fehlt ein.
 * Nachgebessert wartet wieder auf Max und zählt deshalb als offen (wie AK-12).
 */
export const GRUPPE_MARIE: Record<Status, GruppeMarie> = {
  offen: 'offen',
  nachgebessert: 'offen',
  bestaetigt: 'erledigt',
  unsicher: 'fehlerhaft',
  fehlerhaft: 'fehlerhaft',
  fehlt: 'fehlerhaft',
};

/** Relevanz bei Marie (AK-41): Fehlt, Fehlerhaft, Unsicher, Offen, Bestätigt; Nachgebessert vor Offen. */
export const RANG_MARIE: Record<Status, number> = {
  fehlt: 0,
  fehlerhaft: 1,
  unsicher: 2,
  nachgebessert: 3,
  offen: 4,
  bestaetigt: 5,
};

/** Sortiert nach Maries Relevanz, bei gleichem Status nach Kennung. */
export function sortiereFuerMarie<T extends { status: Status; schluessel: string }>(labels: readonly T[]): T[] {
  return [...labels].sort((a, b) => RANG_MARIE[a.status] - RANG_MARIE[b.status] || a.schluessel.localeCompare(b.schluessel));
}
