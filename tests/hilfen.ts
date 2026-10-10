// Gemeinsame Hilfen für die Tests. Nur hier werden die Erwartungswerte gelesen.

import { readFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { join, resolve } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import type { GrundCode } from '../src/ai/auffaelligkeit.ts';
import { ladeTestdaten, oeffneDatenbank, spieleTestdatenEin, type Testdaten } from '../src/db/datenbank.ts';
import type { Status } from '../src/db/status.ts';
import { erstelleServer } from '../src/server/app.ts';

export const WURZEL = resolve(import.meta.dirname, '..');
export const TESTDATEN = join(WURZEL, 'testdaten');
export const BILDER = join(TESTDATEN, 'bilder');

export interface Erwartung {
  sprachen: string[];
  lesbar: boolean;
  unsicher: boolean;
  auffaellig: GrundCode[];
  status: Status;
  notiz?: string;
  /** nach der simulierten Nachbesserung bzw. dem nachgereichten Foto */
  nachSimulation?: { sprachen: string[]; lesbar: boolean; status: Status };
}

export function testdaten(): Testdaten {
  return ladeTestdaten(TESTDATEN);
}

export function erwartungen(): Record<string, Erwartung> {
  const roh = JSON.parse(readFileSync(join(TESTDATEN, 'erwartung.json'), 'utf8')) as Record<string, unknown>;
  return Object.fromEntries(Object.entries(roh).filter(([k]) => !k.startsWith('_'))) as Record<string, Erwartung>;
}

export async function neueDatenbank(): Promise<DatabaseSync> {
  const db = oeffneDatenbank(':memory:');
  await spieleTestdatenEin(db, testdaten());
  return db;
}

export interface TestServer {
  url: string;
  schliessen: () => Promise<void>;
}

export async function starteServer(db: DatabaseSync): Promise<TestServer> {
  const server = erstelleServer({ db, bilderOrdner: BILDER });
  await new Promise<void>((fertig) => server.listen(0, '127.0.0.1', fertig));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    schliessen: () => new Promise((fertig) => server.close(() => fertig())),
  };
}

export interface Antwort {
  status: number;
  daten: any;
  kopf: Headers;
  text: string;
}

export async function anfrage(
  server: TestServer,
  pfad: string,
  optionen: { methode?: 'GET' | 'POST'; rolle?: string; koerper?: string } = {},
): Promise<Antwort> {
  const kopf: Record<string, string> = {};
  if (optionen.rolle) kopf['X-Rolle'] = optionen.rolle;
  if (optionen.koerper !== undefined) kopf['Content-Type'] = 'application/json';
  const res = await fetch(server.url + pfad, { method: optionen.methode ?? 'GET', headers: kopf, body: optionen.koerper });
  const text = await res.text();
  let daten: unknown = null;
  try {
    daten = JSON.parse(text);
  } catch {
    daten = null;
  }
  return { status: res.status, daten, kopf: res.headers, text };
}
