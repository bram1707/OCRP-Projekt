// Oberfläche, Aufrufe: die echten Aufruffunktionen gegen einen Testserver (AK-03, AK-10, AK-11, AK-22).
// fetch wird nur um die Adresse des Testservers ergänzt und mitgeschrieben.

import assert from 'node:assert/strict';
import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, test } from 'node:test';
import { ladeAnlage, ladeAnlagen, ladeLabel, ladeMarie, ladeZusammenfassung, ServerFehler } from '../src/ui/api.ts';
import * as pruefung from '../src/ui/pruefung/aktionen.ts';
import * as simulation from '../src/ui/simulation/aktionen.ts';
import { neueDatenbank, starteServer, type TestServer } from './hilfen.ts';

interface Aufruf {
  methode: string;
  pfad: string;
  kopf: Record<string, string>;
  koerper: string | null;
}

const echtesFetch = globalThis.fetch;
let db: DatabaseSync;
let server: TestServer;
let aufrufe: Aufruf[];

beforeEach(async () => {
  db = await neueDatenbank();
  server = await starteServer(db);
  aufrufe = [];
  globalThis.fetch = (async (eingabe: string, init: RequestInit = {}) => {
    aufrufe.push({
      methode: init.method ?? 'GET',
      pfad: eingabe,
      kopf: Object.fromEntries(Object.entries((init.headers ?? {}) as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v])),
      koerper: typeof init.body === 'string' ? init.body : null,
    });
    return echtesFetch(server.url + eingabe, init);
  }) as typeof fetch;
});
afterEach(async () => {
  globalThis.fetch = echtesFetch;
  await server.schliessen();
});

const protokoll = () =>
  db.prepare('SELECT anlage_id, label_id, wer, wann, ergebnis, grund FROM entscheidungen ORDER BY id').all() as Record<string, unknown>[];
const abzug = () => JSON.stringify(['anlagen', 'labels', 'entscheidungen'].map((t) => db.prepare(`SELECT * FROM ${t}`).all()));

describe('AK-03 Laden, Öffnen und Blättern schreiben nie', () => {
  test('alle lesenden Aufrufe sind GET ohne Rolle und ändern nichts', async () => {
    const vorher = abzug();
    const anlagen = await ladeAnlagen();
    for (const a of anlagen) {
      const d = await ladeAnlage(a.id);
      await ladeZusammenfassung(a.id);
      for (const l of [...d.labels, ...d.ausserhalbDerPruefung]) await ladeLabel(l.id);
    }
    await ladeMarie();
    assert.ok(aufrufe.some((a) => a.pfad === '/api/marie'));
    assert.ok(aufrufe.length > 20);
    for (const a of aufrufe) {
      assert.equal(a.methode, 'GET', a.pfad);
      assert.equal(a.kopf['x-rolle'], undefined, a.pfad);
    }
    assert.equal(abzug(), vorher);
  });
});

describe('AK-22 jede Entscheidung schreibt genau einen Protokolleintrag', () => {
  const neuerEintrag = async (arbeit: () => Promise<unknown>) => {
    const vorher = protokoll().length;
    await arbeit();
    const nachher = protokoll();
    assert.equal(nachher.length, vorher + 1);
    const e = nachher.at(-1)!;
    assert.ok(!Number.isNaN(Date.parse(e.wann as string)), 'mit Zeitpunkt');
    return `${e.wer}:${e.ergebnis}:${e.label_id ?? e.anlage_id}:${e.grund ?? ''}`;
  };

  test('Bestätigen, Melden, Zurücknehmen, Freigeben (Max) sowie Nachbessern und Foto nachreichen (Simulation)', async () => {
    assert.equal(await neuerEintrag(() => pruefung.bestaetige('SWR5-01')), 'max:bestaetigt:SWR5-01:');
    assert.equal(await neuerEintrag(() => pruefung.nimmZurueck('SWR5-01')), 'max:zurueckgenommen:SWR5-01:');
    assert.equal(await neuerEintrag(() => pruefung.meldeFehler('SWR5-01', 'unleserlich')), 'max:fehler:SWR5-01:unleserlich');
    assert.equal(await neuerEintrag(() => simulation.simuliereNachbesserung('SWR5-01')), 'simulation:nachgebessert:SWR5-01:');
    assert.equal(await neuerEintrag(() => simulation.simuliereNachbesserung('SWR5-02')), 'simulation:nachgebessert:SWR5-02:');
    assert.equal(await neuerEintrag(() => simulation.reicheFotoNach('SWR5-05')), 'simulation:nacherfasst:SWR5-05:');
    for (const id of ['SWR5-01', 'SWR5-02', 'SWR5-03', 'SWR5-05']) await pruefung.bestaetige(id);
    assert.equal(await neuerEintrag(() => pruefung.gebeFrei('SWR5')), 'max:freigegeben:SWR5:');
  });
});

describe('AK-10, AK-11 was gesendet wird', () => {
  test('Melden sendet nur den Grund, als Max, an genau ein Label', async () => {
    await pruefung.meldeFehler('STA4-08', 'sprache_falsch');
    assert.equal(aufrufe.length, 1);
    assert.deepEqual(aufrufe[0], {
      methode: 'POST',
      pfad: '/api/labels/STA4-08/fehler',
      kopf: { accept: 'application/json', 'x-rolle': 'max', 'content-type': 'application/json' },
      koerper: '{"grund":"sprache_falsch"}',
    });
  });
  test('Bestätigen, Zurücknehmen und die Simulation senden keinen Körper', async () => {
    await pruefung.bestaetige('STA4-01');
    await pruefung.nimmZurueck('STA4-01');
    await simulation.reicheFotoNach('SWR5-05');
    for (const a of aufrufe) assert.equal(a.koerper, null, a.pfad);
  });
  test('jeder schreibende Aufruf nimmt genau eine Kennung; es gibt keinen für mehrere Labels', () => {
    assert.deepEqual(Object.keys(pruefung).sort(), ['bestaetige', 'gebeFrei', 'meldeFehler', 'nimmZurueck', 'sendeAlsMax']);
    assert.deepEqual(Object.keys(simulation).sort(), ['reicheFotoNach', 'simuliereNachbesserung']);
    assert.equal(pruefung.bestaetige.length, 1);
    assert.equal(pruefung.nimmZurueck.length, 1);
    assert.equal(pruefung.gebeFrei.length, 1);
    // Kennung, Grund und die Beschreibung bei „Sonstiges“; weiterhin genau eine Kennung.
    assert.equal(pruefung.meldeFehler.length, 3);
    assert.equal(simulation.simuliereNachbesserung.length, 1);
    assert.equal(simulation.reicheFotoNach.length, 1);
  });
  test('eine Liste statt einer Kennung erreicht kein Label', async () => {
    await assert.rejects(pruefung.bestaetige(['STA4-01', 'STA4-02'] as unknown as string), (e: ServerFehler) => e.status === 404);
    assert.equal(protokoll().filter((e) => e.ergebnis === 'bestaetigt' && e.label_id !== 'STA4-10' && e.anlage_id === 'STA4').length, 0);
  });
});

describe('Fehler des Servers erreichen Max als verständliche Meldung', () => {
  test('409: die Meldung des Servers; abgelehnte Freigabe mit Gründen', async () => {
    await assert.rejects(pruefung.bestaetige('STA4-10'), (e: ServerFehler) => e.status === 409 && /Bestätigt/.test(e.message));
    await assert.rejects(pruefung.gebeFrei('STA4'), (e: ServerFehler) => e.status === 409 && Array.isArray(e.details) && e.details.length > 0);
  });
  test('ohne Verbindung: eigene Meldung, nichts gespeichert', async () => {
    globalThis.fetch = (async () => {
      throw new TypeError('fetch failed');
    }) as typeof fetch;
    await assert.rejects(pruefung.bestaetige('STA4-01'), (e: ServerFehler) => e.status === 0 && /nicht gespeichert/.test(e.message));
    await assert.rejects(ladeAnlagen(), (e: ServerFehler) => e.status === 0 && /Keine Verbindung/.test(e.message));
  });
});
