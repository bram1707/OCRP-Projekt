// Schreibende Aufrufe für den Nutzertest (nur im Prototyp): die Rückmeldung von jeder Seite (AK-51)
// und die Aufgaben der Testleitung. Sie ändern nichts an Labels und Anlagen, außer „Daten zurücksetzen“ (AK-52).

import { leseAntwort, ServerFehler, type Rueckmeldung } from '../api.ts';
import type { Szenario } from './szenarien.ts';

/** Wer die Rückmeldung sendet; die Rolle wird nicht gespeichert. */
export type Absender = 'max' | 'marie' | 'testleitung';

async function sende<T>(
  pfad: string,
  rolle: Absender,
  ohneVerbindung: string,
  { methode = 'POST', koerper }: { methode?: 'GET' | 'POST'; koerper?: Record<string, unknown> } = {},
): Promise<T> {
  const kopf: Record<string, string> = { Accept: 'application/json', 'X-Rolle': rolle };
  if (koerper) kopf['Content-Type'] = 'application/json';
  let res: Response;
  try {
    res = await fetch(pfad, { method: methode, headers: kopf, body: koerper ? JSON.stringify(koerper) : undefined });
  } catch {
    throw new ServerFehler(0, ohneVerbindung);
  }
  return leseAntwort<T>(res);
}

export const sendeRueckmeldung = (rolle: Absender, szenario: Szenario, kommentar: string) =>
  sende<{ id: number }>('/api/feedback', rolle, 'Keine Verbindung zum Server. Ihre Rückmeldung wurde nicht gespeichert.', {
    koerper: { szenario, kommentar },
  });

export const ladeRueckmeldungen = () =>
  sende<Rueckmeldung[]>('/api/feedback', 'testleitung', 'Keine Verbindung zum Server. Bitte prüfen, ob er läuft, und die Seite neu laden.', {
    methode: 'GET',
  });

export const loescheRueckmeldungen = () =>
  sende<{ geloescht: number }>('/api/feedback/loeschen', 'testleitung', 'Keine Verbindung zum Server. Es wurde nichts gelöscht.');

export const setzeDatenZurueck = () =>
  sende<{ zurueckgesetzt: true }>('/api/demo/zuruecksetzen', 'testleitung', 'Keine Verbindung zum Server. Es wurde nichts zurückgesetzt.');
