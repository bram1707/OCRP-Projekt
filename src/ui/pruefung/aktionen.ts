// Schreibende Aufrufe für Max. Jeder betrifft genau ein Label bzw. genau eine Anlage (AK-11);
// es gibt keinen Aufruf für mehrere Labels. Die Regeln selbst prüft der Server.

import type { Fehlergrund } from '../../db/status.ts';
import { labelPfad, leseAntwort, ServerFehler, type AnlageAnsicht, type LabelAnsicht } from '../api.ts';

/** Sendet als simulierte Rolle „max“. Auch die Simulationsseite nutzt diesen Weg. */
export async function sendeAlsMax<T>(pfad: string, koerper?: Record<string, unknown>): Promise<T> {
  const kopf: Record<string, string> = { Accept: 'application/json', 'X-Rolle': 'max' };
  if (koerper) kopf['Content-Type'] = 'application/json';
  let res: Response;
  try {
    res = await fetch(pfad, { method: 'POST', headers: kopf, body: koerper ? JSON.stringify(koerper) : undefined });
  } catch {
    throw new ServerFehler(0, 'Keine Verbindung zum Server. Ihre Entscheidung wurde nicht gespeichert.');
  }
  return leseAntwort<T>(res);
}

export const bestaetige = (labelId: string) => sendeAlsMax<LabelAnsicht>(labelPfad(labelId, 'bestaetigen'));
export const meldeFehler = (labelId: string, grund: Fehlergrund, text?: string) =>
  sendeAlsMax<LabelAnsicht>(labelPfad(labelId, 'fehler'), text === undefined ? { grund } : { grund, text });
export const nimmZurueck = (labelId: string) => sendeAlsMax<LabelAnsicht>(labelPfad(labelId, 'zuruecknehmen'));
export const gebeFrei = (anlageId: string) => sendeAlsMax<AnlageAnsicht>(`/api/anlagen/${encodeURIComponent(anlageId)}/freigeben`);
