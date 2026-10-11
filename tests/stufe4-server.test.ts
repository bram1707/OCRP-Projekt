// Stufe 4, Server: Rückmeldung (B6, AK-51), Rückmeldungen ansehen und löschen (B7), Daten zurücksetzen (B8, AK-52).

import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { describe, test } from 'node:test';
import { mockModell, type SprachModell } from '../src/ai/mock.ts';
import { oeffneDatenbank, spieleTestdatenEin } from '../src/db/datenbank.ts';
import { SCHEMA_STAND } from '../src/db/schema.ts';
import { erstelleServer, type ServerOptionen } from '../src/server/app.ts';
import type { MarieUebersicht } from '../src/server/marie.ts';
import {
  anfrage, BILDER, DEMO, DEMO_BILDER, demoDaten, hoere, kurz, neueDatenbank, TESTDATEN, testdaten, type TestServer,
} from './hilfen.ts';

const max = { methode: 'POST' as const, rolle: 'max' };
const testleitung = { rolle: 'testleitung' };

/** Server mit allen Optionen; ohne Angabe der Basisdatensatz mit „Daten zurücksetzen“. */
async function mitServer(
  arbeit: (s: TestServer, db: DatabaseSync) => Promise<void>,
  optionen: Partial<ServerOptionen> & { db?: DatabaseSync } = {},
): Promise<void> {
  const db = optionen.db ?? (await neueDatenbank());
  const server = erstelleServer({ bilderOrdner: BILDER, datenOrdner: TESTDATEN, ...optionen, db });
  await new Promise<void>((fertig) => server.listen(0, '127.0.0.1', fertig));
  const { port } = server.address() as { port: number };
  const s: TestServer = { url: `http://127.0.0.1:${port}`, schliessen: () => new Promise((f) => server.close(() => f())) };
  try {
    await arbeit(s, db);
  } finally {
    await s.schliessen();
    if (!optionen.db) db.close();
  }
}

function rueckmeldung(s: TestServer, rolle: string | undefined, koerper: unknown, kopf: Record<string, string> = {}) {
  return fetch(`${s.url}/api/feedback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(rolle ? { 'X-Rolle': rolle } : {}), ...kopf },
    body: JSON.stringify(koerper),
  });
}

/** Inhalt der Tabellen für Anlagen, Labels und Protokoll (ohne Rückmeldungen). */
function abzug(db: DatabaseSync): string {
  return ['anlagen', 'labels', 'entscheidungen']
    .map((t) => JSON.stringify(db.prepare(`SELECT * FROM ${t} ORDER BY 1`).all()))
    .join('\n');
}

const zeilen = (db: DatabaseSync) => db.prepare('SELECT * FROM feedback ORDER BY id').all() as Record<string, unknown>[];

describe('B6 Rückmeldung speichern (AK-51)', () => {
  test('Szenario, Zeitpunkt vom Server und Kommentar landen in der Tabelle feedback, sonst nichts', async () => {
    await mitServer(async (s, db) => {
      const vorher = Date.now();
      const res = await rueckmeldung(s, 'max', { szenario: 'presse3', kommentar: '  Der Knopf war gut zu finden.  ', zeitpunkt: '2000-01-01T00:00:00Z', name: 'Erika' });
      assert.equal(res.status, 200);
      const antwort = (await res.json()) as { id: number; szenario: string; zeitpunkt: string };
      assert.equal(antwort.szenario, 'presse3');
      const gespeichert = zeilen(db);
      assert.equal(gespeichert.length, 1);
      assert.deepEqual(Object.keys(gespeichert[0]!).sort(), ['id', 'kommentar', 'szenario', 'zeitpunkt'], 'kein Name, keine Rolle, keine Adresse');
      assert.equal(gespeichert[0]!.kommentar, 'Der Knopf war gut zu finden.');
      assert.equal(gespeichert[0]!.zeitpunkt, antwort.zeitpunkt);
      const zeit = Date.parse(antwort.zeitpunkt);
      assert.ok(zeit >= vorher - 1000 && zeit <= Date.now() + 1000, 'Zeitpunkt vom Server, nicht aus der Anfrage');
    });
  });

  test('alle fünf Szenarien sind erlaubt; 1000 Zeichen gehen, 1001 nicht', async () => {
    await mitServer(async (s, db) => {
      for (const szenario of ['presse3', 'montagelinie1', 'lackierung2', 'marie', 'allgemein']) {
        assert.equal((await rueckmeldung(s, 'testleitung', { szenario, kommentar: 'ok' })).status, 200, szenario);
      }
      assert.equal((await rueckmeldung(s, 'max', { szenario: 'allgemein', kommentar: 'x'.repeat(1000) })).status, 200);
      const zuLang = await rueckmeldung(s, 'max', { szenario: 'allgemein', kommentar: 'x'.repeat(1001) });
      assert.equal(zuLang.status, 400);
      assert.match(((await zuLang.json()) as { fehler: string }).fehler, /höchstens 1000 Zeichen/);
      assert.equal(zeilen(db).length, 6);
    });
  });

  test('400 bei leerem Kommentar, nur Leerzeichen, fehlendem oder unbekanntem Szenario; nichts wird gespeichert', async () => {
    await mitServer(async (s, db) => {
      const falsch: unknown[] = [
        { szenario: 'presse3', kommentar: '' },
        { szenario: 'presse3', kommentar: '   \n ' },
        { szenario: 'presse3' },
        { szenario: 'presse3', kommentar: 42 },
        { kommentar: 'Gut.' },
        { szenario: 'presse4', kommentar: 'Gut.' },
        { szenario: 'Presse3', kommentar: 'Gut.' },
        { szenario: ['presse3'], kommentar: 'Gut.' },
      ];
      for (const koerper of falsch) assert.equal((await rueckmeldung(s, 'max', koerper)).status, 400, JSON.stringify(koerper));
      assert.equal(zeilen(db).length, 0);
    });
  });

  test('Gegenprüfung: Steuerzeichen wie das Nullzeichen ergeben 400 mit Fachmeldung statt 500; Zeilenumbruch und Tabulator bleiben erlaubt', async () => {
    await mitServer(async (s, db) => {
      for (const kommentar of ['\u0000abc', 'a\u0000', 'a\u0007b', 'a\u001bb', 'a\u007fb']) {
        const r = await rueckmeldung(s, 'marie', { szenario: 'marie', kommentar });
        assert.equal(r.status, 400, JSON.stringify(kommentar));
        assert.match(await r.text(), /Zeichen, die sich nicht speichern lassen/);
      }
      assert.equal(zeilen(db).length, 0);
      assert.equal((await rueckmeldung(s, 'marie', { szenario: 'marie', kommentar: 'Zeile 1\n\tZeile 2' })).status, 200);
      assert.equal(zeilen(db)[0]?.kommentar, 'Zeile 1\n\tZeile 2');
    });
  });

  test('403 ohne Rolle, mit unbekannter Rolle und von einer fremden Seite', async () => {
    await mitServer(async (s, db) => {
      const gut = { szenario: 'allgemein', kommentar: 'Gut.' };
      assert.equal((await rueckmeldung(s, undefined, gut)).status, 403);
      assert.equal((await rueckmeldung(s, 'admin', gut)).status, 403);
      assert.equal((await rueckmeldung(s, 'max', gut, { Origin: 'http://fremd.example' })).status, 403);
      assert.equal((await rueckmeldung(s, 'marie', gut, { 'Sec-Fetch-Site': 'cross-site' })).status, 403);
      assert.equal((await rueckmeldung(s, 'marie', gut, { 'Sec-Fetch-Site': 'same-site' })).status, 403);
      assert.equal(zeilen(db).length, 0);
      const host = new URL(s.url).host;
      assert.equal((await rueckmeldung(s, 'marie', gut, { 'Sec-Fetch-Site': 'same-origin', Origin: `http://${host}` })).status, 200);
    });
  });

  test('als Marie: Labels, Anlagen und Protokoll bleiben gleich, und es gibt kein Signal', async () => {
    await mitServer(async (s, db) => {
      const vorher = abzug(db);
      const marieVorher = (await anfrage(s, '/api/marie')).text;
      const h = await hoere(`${s.url}/api/ereignisse`);
      try {
        await kurz(50);
        assert.equal((await rueckmeldung(s, 'marie', { szenario: 'marie', kommentar: 'Ich sehe, was offen ist.' })).status, 200);
        await kurz(100);
        assert.deepEqual(h.nachrichten, ['{"stand":0}'], 'kein Signal');
      } finally {
        h.schliessen();
      }
      assert.equal(abzug(db), vorher);
      assert.equal((await anfrage(s, '/api/marie')).text, marieVorher);
    });
  });

  test('Schema-Stand 3; eine Datenbank aus Stufe 3 wird neu angelegt und bekommt die Tabelle feedback', () => {
    assert.equal(SCHEMA_STAND, 3);
    const ordner = mkdtempSync(join(tmpdir(), 'pruefsystem-stand-'));
    try {
      const pfad = join(ordner, 'alt.sqlite');
      const alt = oeffneDatenbank(pfad);
      alt.exec('DROP TABLE feedback; PRAGMA user_version = 2;');
      alt.close();
      const db = oeffneDatenbank(pfad);
      assert.equal((db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version, 3);
      assert.ok(db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'feedback'").get());
      db.close();
    } finally {
      rmSync(ordner, { recursive: true, force: true });
    }
  });
});

describe('B7 Rückmeldungen ansehen und löschen', () => {
  test('nur die Testleitung liest die Liste, die neueste zuerst; Max, Marie, ohne Rolle oder fremde Seite → 403', async () => {
    await mitServer(async (s) => {
      await rueckmeldung(s, 'max', { szenario: 'presse3', kommentar: 'Erste' });
      await rueckmeldung(s, 'marie', { szenario: 'marie', kommentar: 'Zweite <b>fett</b>' });
      const { status, daten } = await anfrage(s, '/api/feedback', testleitung);
      assert.equal(status, 200);
      assert.deepEqual(daten.map((r: { szenario: string; kommentar: string }) => [r.szenario, r.kommentar]), [
        ['marie', 'Zweite <b>fett</b>'],
        ['presse3', 'Erste'],
      ]);
      for (const rolle of ['max', 'marie', undefined]) assert.equal((await anfrage(s, '/api/feedback', { rolle })).status, 403, String(rolle));
      const fremd = await fetch(`${s.url}/api/feedback`, { headers: { 'X-Rolle': 'testleitung', 'Sec-Fetch-Site': 'cross-site' } });
      assert.equal(fremd.status, 403);
    });
  });

  test('„Rückmeldungen löschen“ nur als Testleitung, ohne Signal; danach ist die Liste leer', async () => {
    await mitServer(async (s, db) => {
      await rueckmeldung(s, 'max', { szenario: 'allgemein', kommentar: 'Weg damit' });
      for (const rolle of ['max', 'marie', undefined]) {
        assert.equal((await anfrage(s, '/api/feedback/loeschen', { methode: 'POST', rolle })).status, 403, String(rolle));
      }
      assert.equal(zeilen(db).length, 1);
      const h = await hoere(`${s.url}/api/ereignisse`);
      try {
        await kurz(50);
        const { status, daten } = await anfrage(s, '/api/feedback/loeschen', { methode: 'POST', ...testleitung });
        assert.equal(status, 200);
        assert.deepEqual(daten, { geloescht: 1 });
        await kurz(100);
        assert.deepEqual(h.nachrichten, ['{"stand":0}']);
      } finally {
        h.schliessen();
      }
      assert.deepEqual((await anfrage(s, '/api/feedback', testleitung)).daten, []);
    });
  });

  test('nach dem Löschen steht der Kommentar auch nicht mehr in der Datenbankdatei', async () => {
    const ordner = mkdtempSync(join(tmpdir(), 'pruefsystem-feedback-'));
    const pfad = join(ordner, 'test.sqlite');
    const db = oeffneDatenbank(pfad);
    try {
      await spieleTestdatenEin(db, testdaten());
      const merkmal = 'Rueckmeldung-Merkmal-7f3a9c';
      await mitServer(async (s) => {
        assert.equal((await rueckmeldung(s, 'max', { szenario: 'allgemein', kommentar: `${merkmal} steht hier` })).status, 200);
        assert.ok(readFileSync(pfad).includes(merkmal), 'vor dem Löschen in der Datei');
        assert.equal((await anfrage(s, '/api/feedback/loeschen', { methode: 'POST', ...testleitung })).status, 200);
      }, { db });
      assert.ok(!readFileSync(pfad).includes(merkmal), 'nach dem Löschen nicht mehr in der Datei');
      assert.ok(!existsSync(`${pfad}-journal`) || !readFileSync(`${pfad}-journal`).includes(merkmal));
    } finally {
      db.close();
      rmSync(ordner, { recursive: true, force: true });
    }
  });
});

describe('B8 Daten zurücksetzen (AK-52)', () => {
  test('danach gleicht die Datenbank einem frischen Start; Rückmeldungen bleiben', async () => {
    const frisch = abzug(await neueDatenbank());
    await mitServer(async (s, db) => {
      await anfrage(s, '/api/labels/STA4-01/bestaetigen', max);
      await anfrage(s, '/api/labels/STA4-02/fehler', { ...max, koerper: JSON.stringify({ grund: 'beschaedigt' }) });
      await anfrage(s, '/api/labels/SWR5-02/nachbessern', max);
      await anfrage(s, '/api/labels/SWR5-05/nacherfassen', max);
      await rueckmeldung(s, 'max', { szenario: 'allgemein', kommentar: 'Bleibt' });
      assert.notEqual(abzug(db), frisch);

      const { status, daten } = await anfrage(s, '/api/demo/zuruecksetzen', { methode: 'POST', ...testleitung });
      assert.equal(status, 200);
      assert.deepEqual(daten, { zurueckgesetzt: true });
      assert.equal(abzug(db), frisch);
      assert.deepEqual(zeilen(db).map((z) => z.kommentar), ['Bleibt']);
    });
  });

  test('mit den Demo-Daten: alle drei Anlagen stehen wieder am Anfang, Marie sieht 37/36/0/1', async () => {
    const db = oeffneDatenbank(':memory:');
    await spieleTestdatenEin(db, demoDaten());
    try {
      await mitServer(async (s) => {
        for (const l of demoDaten().labels.filter((x) => x.anlageId === 'PRE3')) await anfrage(s, `/api/labels/${l.id}/bestaetigen`, max);
        assert.equal((await anfrage(s, '/api/anlagen/PRE3/freigeben', max)).status, 200);
        assert.equal((await anfrage(s, '/api/demo/zuruecksetzen', { methode: 'POST', ...testleitung })).status, 200);
        const m = (await anfrage(s, '/api/marie')).daten as MarieUebersicht;
        assert.deepEqual(m.zahlen, { gesamt: 37, offen: 36, erledigt: 0, fehlerhaft: 1 });
        assert.ok(m.anlagen.every((a) => a.gesperrt));
      }, { db, bilderOrdner: DEMO_BILDER, datenOrdner: DEMO });
    } finally {
      db.close();
    }
  });

  test('Marie, Max, ohne Rolle oder von einer fremden Seite → 403, nichts ändert sich', async () => {
    await mitServer(async (s, db) => {
      await anfrage(s, '/api/labels/STA4-01/bestaetigen', max);
      const vorher = abzug(db);
      for (const rolle of ['marie', 'max', undefined]) {
        assert.equal((await anfrage(s, '/api/demo/zuruecksetzen', { methode: 'POST', rolle })).status, 403, String(rolle));
      }
      const fremd = await fetch(`${s.url}/api/demo/zuruecksetzen`, { method: 'POST', headers: { 'X-Rolle': 'testleitung', Origin: 'http://fremd.example' } });
      assert.equal(fremd.status, 403);
      assert.equal(abzug(db), vorher);
    });
  });

  test('ohne Datensatz-Ordner gibt es das Zurücksetzen nicht (404)', async () => {
    await mitServer(async (s) => {
      assert.equal((await anfrage(s, '/api/demo/zuruecksetzen', { methode: 'POST', ...testleitung })).status, 404);
    }, { datenOrdner: undefined });
  });

  test('genau ein Signal; danach zeigt Maries Übersicht die Startzahlen', async () => {
    await mitServer(async (s) => {
      await anfrage(s, '/api/labels/STA4-01/bestaetigen', max);
      const start = (await neueDatenbankZahlen());
      const h = await hoere(`${s.url}/api/ereignisse`);
      try {
        await kurz(50);
        const warte = h.naechste();
        assert.equal((await anfrage(s, '/api/demo/zuruecksetzen', { methode: 'POST', ...testleitung })).status, 200);
        assert.equal(await warte, '{"stand":2}');
        await kurz(100);
        assert.deepEqual(h.nachrichten, ['{"stand":1}', '{"stand":2}']);
      } finally {
        h.schliessen();
      }
      assert.deepEqual(((await anfrage(s, '/api/marie')).daten as MarieUebersicht).zahlen, start);
    });
  });

  test('kein leerer Zwischenstand: während die Erkennung läuft, liefert der Server den alten Stand vollständig', async () => {
    // Die Erkennung wartet, bis der Test den Stand mehrmals gelesen hat.
    let erkennungen = 0;
    let oeffne = () => {};
    const tor = new Promise<void>((r) => (oeffne = r));
    const wartend: SprachModell = async (text) => {
      erkennungen += 1;
      await tor;
      return mockModell(text);
    };
    await mitServer(async (s) => {
      await anfrage(s, '/api/labels/STA4-01/bestaetigen', max);
      const zuruecksetzen = anfrage(s, '/api/demo/zuruecksetzen', { methode: 'POST', ...testleitung });
      try {
        while (erkennungen === 0) await kurz(1);
        for (let i = 0; i < 3; i++) {
          const m = (await anfrage(s, '/api/marie')).daten as MarieUebersicht;
          assert.equal(m.zahlen.gesamt, 20);
          assert.equal(m.zahlen.erledigt, 8, 'noch der alte Stand mit STA4-01 bestätigt');
        }
      } finally {
        oeffne();
      }
      assert.equal((await zuruecksetzen).status, 200);
      assert.equal(((await anfrage(s, '/api/marie')).daten as MarieUebersicht).zahlen.erledigt, 7);
    }, { modell: wartend });
  });
});

async function neueDatenbankZahlen(): Promise<MarieUebersicht['zahlen']> {
  let zahlen: MarieUebersicht['zahlen'] | null = null;
  await mitServer(async (s) => {
    zahlen = ((await anfrage(s, '/api/marie')).daten as MarieUebersicht).zahlen;
  });
  return zahlen!;
}
