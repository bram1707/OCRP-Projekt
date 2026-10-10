// Nur lesende Aufrufe der Schnittstelle, ohne Rolle. Schreibende Aufrufe liegen
// ausschließlich in pruefung/aktionen.ts und simulation/aktionen.ts.

import type { AnlageAnsicht, LabelAnsicht, Zusammenfassung } from '../server/ansichten.ts';

export type { AnlageAnsicht, LabelAnsicht, Zusammenfassung };
export type { Grund } from '../ai/auffaelligkeit.ts';
export type { Beleg } from '../ai/belege.ts';
export type { Hinderungsgrund, Status } from '../db/status.ts';

export interface AnlageMitLabels {
  anlage: AnlageAnsicht;
  /** Max' Liste in der Reihenfolge des Servers (relevantestes zuerst) */
  labels: LabelAnsicht[];
  /** Fehlerhaft (in Nachbesserung) und Fehlt (ohne Foto) */
  ausserhalbDerPruefung: LabelAnsicht[];
}

/** Fehler mit der Meldung des Servers in einfacher Sprache. */
export class ServerFehler extends Error {
  status: number;
  details: unknown;
  constructor(status: number, meldung: string, details: unknown = null) {
    super(meldung);
    this.name = 'ServerFehler';
    this.status = status;
    this.details = details;
  }
}

/** Liest Antwort oder Fehlermeldung des Servers. Ohne verständliche Antwort gibt es eine allgemeine Meldung. */
export async function leseAntwort<T>(res: Response): Promise<T> {
  let daten: unknown = null;
  try {
    daten = await res.json();
  } catch {
    daten = null;
  }
  if (!res.ok) {
    const fehler = (daten as { fehler?: unknown; details?: unknown } | null) ?? {};
    const meldung = typeof fehler.fehler === 'string' ? fehler.fehler : 'Der Server hat nicht geantwortet. Bitte die Seite neu laden.';
    throw new ServerFehler(res.status, meldung, fehler.details ?? null);
  }
  return daten as T;
}

async function hole<T>(pfad: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(pfad, { headers: { Accept: 'application/json' } });
  } catch {
    throw new ServerFehler(0, 'Keine Verbindung zum Server. Bitte prüfen, ob er läuft, und die Seite neu laden.');
  }
  return leseAntwort<T>(res);
}

const teil = (id: string) => encodeURIComponent(id);

export const ladeAnlagen = () => hole<AnlageAnsicht[]>('/api/anlagen');
export const ladeAnlage = (anlageId: string) => hole<AnlageMitLabels>(`/api/anlagen/${teil(anlageId)}/labels`);
export const ladeZusammenfassung = (anlageId: string) => hole<Zusammenfassung>(`/api/anlagen/${teil(anlageId)}/zusammenfassung`);
export const ladeLabel = (labelId: string) => hole<LabelAnsicht>(`/api/labels/${teil(labelId)}`);
