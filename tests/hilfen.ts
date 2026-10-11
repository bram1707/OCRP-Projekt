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
/** Demo-Daten für Nutzertests (AK-50), eigener Datensatz neben den 20 Testlabels */
export const DEMO = join(TESTDATEN, 'demo');
export const DEMO_BILDER = join(DEMO, 'bilder');

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

export function erwartungen(ordner = TESTDATEN): Record<string, Erwartung> {
  const roh = JSON.parse(readFileSync(join(ordner, 'erwartung.json'), 'utf8')) as Record<string, unknown>;
  return Object.fromEntries(Object.entries(roh).filter(([k]) => !k.startsWith('_'))) as Record<string, Erwartung>;
}

export function demoDaten(): Testdaten {
  return ladeTestdaten(DEMO);
}

export function demoErwartungen(): Record<string, Erwartung> {
  return erwartungen(DEMO);
}

export async function neueDatenbank(daten: Testdaten = testdaten()): Promise<DatabaseSync> {
  const db = oeffneDatenbank(':memory:');
  await spieleTestdatenEin(db, daten);
  return db;
}

export async function neueDemoDatenbank(): Promise<DatabaseSync> {
  return neueDatenbank(demoDaten());
}

export interface TestServer {
  url: string;
  schliessen: () => Promise<void>;
}

export async function starteServer(db: DatabaseSync, bilderOrdner = BILDER): Promise<TestServer> {
  const server = erstelleServer({ db, bilderOrdner });
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

/** Hört auf das Signal (/api/ereignisse) und sammelt die Nachrichten (AK-44). */
export async function hoere(url: string, kopf: Record<string, string> = {}) {
  const abbruch = new AbortController();
  const res = await fetch(url, { headers: kopf, signal: abbruch.signal });
  const nachrichten: string[] = [];
  const wartend: { aufruf: (() => void) | null } = { aufruf: null };
  let rest = '';
  const leser = res.body!.getReader();
  void (async () => {
    try {
      for (;;) {
        const { value, done } = await leser.read();
        if (done) break;
        rest += new TextDecoder().decode(value);
        let ende: number;
        while ((ende = rest.indexOf('\n\n')) >= 0) {
          const block = rest.slice(0, ende);
          rest = rest.slice(ende + 2);
          const daten = block.split('\n').filter((z) => z.startsWith('data: ')).map((z) => z.slice(6));
          if (daten.length > 0) {
            nachrichten.push(daten.join('\n'));
            wartend.aufruf?.();
          }
        }
      }
    } catch {
      // abgebrochen
    }
  })();
  return {
    res,
    nachrichten,
    async naechste(ms = 2000): Promise<string> {
      await new Promise<void>((fertig, fehler) => {
        const uhr = setTimeout(() => fehler(new Error('keine Nachricht')), ms);
        wartend.aufruf = () => {
          clearTimeout(uhr);
          wartend.aufruf = null;
          fertig();
        };
      });
      return nachrichten.at(-1)!;
    },
    schliessen: () => abbruch.abort(),
  };
}

export const kurz = (ms: number) => new Promise((r) => setTimeout(r, ms));
