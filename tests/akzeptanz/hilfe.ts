// Eigene Hilfen des Test-Agents, unabhängig von tests/hilfen.ts des Build-Agents.

import type { AddressInfo } from 'node:net';
import { join, resolve } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { ladeTestdaten, oeffneDatenbank, spieleTestdatenEin, type Testdaten } from '../../src/db/datenbank.ts';
import { erstelleServer } from '../../src/server/app.ts';
import type { SprachModell } from '../../src/ai/mock.ts';

export const WURZEL = resolve(import.meta.dirname, '..', '..');
export const TESTDATEN = join(WURZEL, 'testdaten');

export async function basisDb(): Promise<DatabaseSync> {
  const db = oeffneDatenbank(':memory:');
  await spieleTestdatenEin(db, ladeTestdaten(TESTDATEN));
  return db;
}

export async function eigeneDb(daten: Testdaten, modell?: SprachModell): Promise<DatabaseSync> {
  const db = oeffneDatenbank(':memory:');
  await spieleTestdatenEin(db, daten, modell);
  return db;
}

export interface Srv { url: string; zu: () => Promise<void> }

export async function server(db: DatabaseSync): Promise<Srv> {
  const s = erstelleServer({ db, bilderOrdner: join(TESTDATEN, 'bilder') });
  await new Promise<void>((r) => s.listen(0, '127.0.0.1', r));
  const { port } = s.address() as AddressInfo;
  return { url: `http://127.0.0.1:${port}`, zu: () => new Promise((r) => s.close(() => r())) };
}

export async function ruf(
  s: Srv, pfad: string, o: { methode?: string; rolle?: string; koerper?: unknown } = {},
): Promise<{ status: number; daten: any; text: string }> {
  const kopf: Record<string, string> = {};
  if (o.rolle) kopf['X-Rolle'] = o.rolle;
  let body: string | undefined;
  if (o.koerper !== undefined) {
    kopf['Content-Type'] = 'application/json';
    body = typeof o.koerper === 'string' ? o.koerper : JSON.stringify(o.koerper);
  }
  const res = await fetch(s.url + pfad, { method: o.methode ?? 'GET', headers: kopf, body });
  const text = await res.text();
  let daten: any = null;
  try { daten = JSON.parse(text); } catch { /* kein JSON */ }
  return { status: res.status, daten, text };
}

/** Feste Modellantwort für Grenzwerttests. */
export function festesModell(antwort: unknown): SprachModell {
  return async () => (typeof antwort === 'string' ? antwort : JSON.stringify(antwort));
}

/** Lesbarer zweisprachiger Text mit vielen Belegen (Deutsch/Polnisch). */
export const DE_PL = 'ACHTUNG! Quetschgefahr. Hände fernhalten.\nUWAGA! Ryzyko zgniecenia. Trzymać ręce z dala.';
export const DE_FR = 'VORSICHT! Heiße Oberfläche. Nicht berühren.\nATTENTION ! Surface chaude. Ne pas toucher.';
export const DE_RU = 'ACHTUNG! Hochspannung. Nicht öffnen.\nВНИМАНИЕ! Высокое напряжение. Не открывать.';
export const DE_EN = 'ACHTUNG! Stromschlag. Nicht öffnen.\nWARNING! Electric shock. Do not open.';
export const NUR_DE = 'ACHTUNG! Quetschgefahr. Hände fernhalten. Nicht berühren.';
