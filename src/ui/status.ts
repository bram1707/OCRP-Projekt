// Jeder Status hat ein Wort und eine eigene Farbe, nie nur Farbe (AK-14).
// Die Klassen stehen vollständig hier, damit Tailwind sie beim Bauen findet.

import type { Status } from '../db/status.ts';

export interface StatusAnzeige {
  wort: string;
  /** Hintergrund, Schrift und Rahmen; Kontrast mindestens 4,5 : 1 */
  klasse: string;
}

export const STATUS_ANZEIGE: Record<Status, StatusAnzeige> = {
  offen: { wort: 'Offen', klasse: 'bg-sky-100 text-sky-950 border-sky-700' },
  unsicher: { wort: 'Unsicher', klasse: 'bg-amber-100 text-amber-950 border-amber-700' },
  nachgebessert: { wort: 'Nachgebessert', klasse: 'bg-violet-100 text-violet-950 border-violet-700' },
  fehlerhaft: { wort: 'Fehlerhaft', klasse: 'bg-red-100 text-red-950 border-red-700' },
  bestaetigt: { wort: 'Bestätigt', klasse: 'bg-green-100 text-green-950 border-green-700' },
  fehlt: { wort: 'Fehlt', klasse: 'bg-stone-200 text-stone-950 border-stone-700' },
};

export const SPERRE_ANZEIGE = {
  gesperrt: { wort: 'Gesperrt', klasse: 'bg-red-100 text-red-950 border-red-700' },
  freigegeben: { wort: 'Freigegeben', klasse: 'bg-green-100 text-green-950 border-green-700' },
} as const satisfies Record<string, StatusAnzeige>;

/** Gesperrt oder Freigegeben, immer nach dem Wert des Servers (AK-01). */
export function sperreAnzeige(gesperrt: boolean): StatusAnzeige {
  return gesperrt ? SPERRE_ANZEIGE.gesperrt : SPERRE_ANZEIGE.freigegeben;
}

/** Aus diesen Status kann Max entscheiden (wie PRUEFBAR auf dem Server). */
export const PRUEFBAR: readonly Status[] = ['offen', 'unsicher', 'nachgebessert'];

export function istPruefbar(status: Status): boolean {
  return PRUEFBAR.includes(status);
}
