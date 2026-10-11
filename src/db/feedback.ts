// Rückmeldungen aus Nutzertests (AK-51): Szenario, Zeitpunkt und Kommentar, sonst nichts.
// Kein Name, keine Rolle, keine Adresse; die Seite bittet, keine Angaben zu Personen einzutragen.

import type { DatabaseSync } from 'node:sqlite';
import { Fachfehler } from './aktionen.ts';

/** Die Szenarien des Nutzertests (AK-50) und „allgemein“ für alles andere. */
export const SZENARIEN = ['presse3', 'montagelinie1', 'lackierung2', 'marie', 'allgemein'] as const;
export type Szenario = (typeof SZENARIEN)[number];

export const MAX_KOMMENTAR = 1000;

export interface Rueckmeldung {
  id: number;
  szenario: Szenario;
  /** vom Server gesetzt, als ISO-Text */
  zeitpunkt: string;
  kommentar: string;
}

export function istSzenario(wert: unknown): wert is Szenario {
  return typeof wert === 'string' && (SZENARIEN as readonly string[]).includes(wert);
}

/** Prüft und speichert eine Rückmeldung. Den Zeitpunkt setzt der Server, nicht die Anfrage. */
export function speichereRueckmeldung(db: DatabaseSync, eingabe: Record<string, unknown>, jetzt: Date): Rueckmeldung {
  const { szenario, kommentar } = eingabe;
  if (!istSzenario(szenario)) throw new Fachfehler(400, 'Bitte wählen Sie aus, zu welchem Teil des Tests die Rückmeldung gehört.');
  const text = typeof kommentar === 'string' ? kommentar.trim() : '';
  if (text === '') throw new Fachfehler(400, 'Bitte schreiben Sie einen Kommentar.');
  if (text.length > MAX_KOMMENTAR) throw new Fachfehler(400, `Der Kommentar ist zu lang (höchstens ${MAX_KOMMENTAR} Zeichen).`);
  const zeitpunkt = jetzt.toISOString();
  const { lastInsertRowid } = db.prepare('INSERT INTO feedback (szenario, zeitpunkt, kommentar) VALUES (?, ?, ?)').run(szenario, zeitpunkt, text);
  return { id: Number(lastInsertRowid), szenario, zeitpunkt, kommentar: text };
}

/** Alle Rückmeldungen, die neueste zuerst. */
export function holeRueckmeldungen(db: DatabaseSync): Rueckmeldung[] {
  return db.prepare('SELECT id, szenario, zeitpunkt, kommentar FROM feedback ORDER BY id DESC').all() as unknown as Rueckmeldung[];
}

/** Löscht alle Rückmeldungen. Mit secure_delete (beim Öffnen gesetzt) sind sie danach auch nicht mehr in der Datei. */
export function loescheRueckmeldungen(db: DatabaseSync): number {
  return Number(db.prepare('DELETE FROM feedback').run().changes);
}
