// Szenarien des Nutzertests (AK-50) für die Rückmeldung (AK-51). Dieselbe Liste prüft der Server (src/db/feedback.ts).

import { bereichDerAdresse, leseRoute } from '../route.ts';

export const SZENARIEN = ['presse3', 'montagelinie1', 'lackierung2', 'marie', 'allgemein'] as const;
export type Szenario = (typeof SZENARIEN)[number];

export const SZENARIO_TEXT: Record<Szenario, string> = {
  presse3: 'Presse 3',
  montagelinie1: 'Montagelinie 1',
  lackierung2: 'Lackierung 2',
  marie: 'Marie: Ist alles geprüft?',
  allgemein: 'Allgemein',
};

export function istSzenario(wert: unknown): wert is Szenario {
  return typeof wert === 'string' && (SZENARIEN as readonly string[]).includes(wert);
}

/** Die Anlagen der Demo-Daten und ihr Szenario; bei allen anderen Anlagen gilt „allgemein“. */
export const SZENARIO_DER_ANLAGE: Readonly<Record<string, Szenario>> = { PRE3: 'presse3', MON1: 'montagelinie1', LAC2: 'lackierung2' };

/** Vorauswahl aus der Seite, die man gerade sieht. */
export function szenarioDerAdresse(hash: string): Szenario {
  if (bereichDerAdresse(hash) === 'marie') return 'marie';
  const route = leseRoute(hash);
  if (route.seite === 'anlage' || route.seite === 'label') return SZENARIO_DER_ANLAGE[route.anlageId] ?? 'allgemein';
  return 'allgemein';
}
