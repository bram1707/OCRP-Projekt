// Eigene Akzeptanztests des Test-Agents für Stufe 4 (Demo-Modus, Rückmeldung, Zurücksetzen, README; AK-50 bis AK-53),
// dazu AK-46 mit dem freigegebenen Zusatz und AK-61 für die Demo-Daten.
// Unabhängig von tests/stufe4-*.test.ts des Build-Agents: Die Erwartungen kommen aus dem Wortlaut der Kriterien
// (Anlagennamen, Anzahlen, Sprachen, 90-%-Schwelle) und werden nur über die Schnittstelle geprüft.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { ladeTestdaten, oeffneDatenbank, oeffneDatenbankMitStand, spieleTestdatenEin } from '../../src/db/datenbank.ts';
import { erstelleServer } from '../../src/server/app.ts';
import { bereiteSystemVor } from '../../src/server/system.ts';
import { ruf, TESTDATEN, WURZEL, type Srv } from './hilfe.ts';

const DEMO = join(TESTDATEN, 'demo');
type Db = DatabaseSync;

async function demoDb(pfad = ':memory:'): Promise<Db> {
  const db = oeffneDatenbank(pfad);
  await spieleTestdatenEin(db, ladeTestdaten(DEMO));
  return db;
}

async function srv(db: Db, ordner = DEMO): Promise<Srv> {
  const s = erstelleServer({ db, bilderOrdner: join(ordner, 'bilder'), datenOrdner: ordner });
  await new Promise<void>((r) => s.listen(0, '127.0.0.1', r));
  const { port } = s.address() as AddressInfo;
  return { url: `http://127.0.0.1:${port}`, zu: () => new Promise((r) => s.close(() => r())) };
}

async function mitDemo(f: (s: Srv, db: Db) => Promise<void>): Promise<void> {
  const db = await demoDb();
  const s = await srv(db);
  try { await f(s, db); } finally { await s.zu(); db.close(); }
}

const alsMax = (s: Srv, pfad: string, koerper?: unknown) => ruf(s, pfad, { methode: 'POST', rolle: 'max', koerper });
const sprachFalsch = { grund: 'sprache_falsch' };

async function labelsVon(s: Srv, anlage: string): Promise<any[]> {
  const r = await ruf(s, `/api/anlagen/${anlage}/labels`);
  assert.equal(r.status, 200);
  return [...r.daten.labels, ...r.daten.ausserhalbDerPruefung];
}
const sprachen = (l: any): string => l.sprachen.map((x: any) => x.code).sort().join('+');
const anlage = async (s: Srv, id: string) => (await ruf(s, '/api/anlagen')).daten.find((a: any) => a.id === id);
const marie = async (s: Srv) => (await ruf(s, '/api/marie')).daten;

/** Kompletter lesbarer Zustand über die Schnittstelle, für den Vergleich vor/nach dem Zurücksetzen. */
async function zustand(s: Srv): Promise<string> {
  const anlagen = (await ruf(s, '/api/anlagen')).daten;
  const labels: unknown[] = [];
  for (const a of anlagen) for (const l of await labelsVon(s, a.id)) labels.push((await ruf(s, `/api/labels/${l.id}`)).daten);
  return JSON.stringify({ anlagen, labels, marie: await marie(s) });
}

/** Zählt Signale auf /api/ereignisse (wie in stufe3.test.ts). */
async function hoere(s: Srv) {
  const ac = new AbortController();
  const res = await fetch(s.url + '/api/ereignisse', { signal: ac.signal });
  const leser = res.body!.getReader();
  const dec = new TextDecoder();
  let puffer = '';
  const nachrichten: string[] = [];
  void (async () => {
    try {
      for (;;) {
        const { value, done } = await leser.read();
        if (done) break;
        puffer += dec.decode(value, { stream: true });
        let i;
        while ((i = puffer.indexOf('\n\n')) >= 0) {
          const block = puffer.slice(0, i); puffer = puffer.slice(i + 2);
          if (block.split('\n').some((z) => z.startsWith('data:'))) nachrichten.push(block);
        }
      }
    } catch { /* abgebrochen */ }
  })();
  const warte = async (anzahl: number, ms = 800) => {
    const ende = Date.now() + ms;
    while (nachrichten.length < anzahl && Date.now() < ende) await new Promise((r) => setTimeout(r, 10));
    return nachrichten.length;
  };
  await warte(1);
  return { anzahl: () => nachrichten.length, warte, zu: () => ac.abort() };
}

// ---------------------------------------------------------------- AK-50

describe('AK-50: Demo-Daten wie im Kriterium', () => {
  test('vier Anlagen: Presse 3 (12), Montagelinie 1 (15), Lackierung 2 (10), Abfüllung 5 (8), alle gesperrt, nichts bestätigt', () => mitDemo(async (s) => {
    const anlagen = (await ruf(s, '/api/anlagen')).daten;
    // Dazu die Testanlage „Eigene Fotos“ (Erweiterung Foto-Upload, 11.10.2026) und Abfüllung 5 (Optimierung 2: Türkisch, Bulgarisch, Chinesisch).
    const soll: Record<string, [string, number]> = {
      PRE3: ['Presse 3', 12], MON1: ['Montagelinie 1', 15], LAC2: ['Lackierung 2', 10], ABF5: ['Abfüllung 5', 8], EIG1: ['Testanlage Eigene Fotos', 3],
    };
    assert.deepEqual(anlagen.map((a: any) => a.id).sort(), Object.keys(soll).sort());
    for (const a of anlagen) {
      assert.equal(a.name, soll[a.id]![0]);
      assert.equal(a.sollAnzahl, soll[a.id]![1]);
      assert.equal((await labelsVon(s, a.id)).length, soll[a.id]![1], a.id);
      assert.equal(a.gesperrt, true);
      assert.equal(a.bestaetigt, 0);
    }
  }));

  test('Presse 3: alle 12 Deutsch/Polnisch, keines auffällig, keines unsicher (alle korrekt)', () => mitDemo(async (s) => {
    for (const l of await labelsVon(s, 'PRE3')) {
      assert.equal(sprachen(l), 'de+pl', l.id);
      assert.equal(l.auffaellig, false, l.id);
      assert.equal(l.status, 'offen', l.id);
      assert.ok(l.sprachKonfidenz >= 0.9, `${l.id} Sprache ${l.sprachKonfidenz}`);
      assert.ok(l.ocrKonfidenz >= 0.8, `${l.id} OCR ${l.ocrKonfidenz}`);
    }
  }));

  test('Montagelinie 1: genau eines ohne zweite Sprache, auffällig mit Grund; die übrigen 14 zweisprachig und unauffällig', () => mitDemo(async (s) => {
    const labels = await labelsVon(s, 'MON1');
    const einsprachig = labels.filter((l) => l.sprachen.length < 2);
    assert.equal(einsprachig.length, 1);
    const [x] = einsprachig;
    assert.equal(x.auffaellig, true);
    assert.ok(x.gruende.length > 0 && x.gruende.every((g: any) => g.text.length > 0));
    for (const l of labels.filter((y) => y !== x)) {
      assert.equal(l.sprachen.length, 2, l.id);
      assert.equal(l.auffaellig, false, `${l.id}: zweisprachig ohne weitere Auffälligkeit (AK-19)`);
    }
  }));

  test('Montagelinie 1 Durchlauf: melden → fehlerhaft, Freigabe gesperrt → nachgebessert (zwei Sprachen) → bestätigt → freigegeben', () => mitDemo(async (s) => {
    const labels = await labelsVon(s, 'MON1');
    const x = labels.find((l) => l.sprachen.length < 2);
    assert.equal((await alsMax(s, `/api/labels/${x.id}/fehler`, sprachFalsch)).status, 200);
    for (const l of labels) if (l !== x) assert.equal((await alsMax(s, `/api/labels/${l.id}/bestaetigen`)).status, 200, l.id);
    assert.equal((await ruf(s, `/api/labels/${x.id}`)).daten.status, 'fehlerhaft');
    assert.equal((await alsMax(s, '/api/anlagen/MON1/freigeben')).status, 409);
    assert.equal((await anlage(s, 'MON1')).gesperrt, true);

    assert.equal((await alsMax(s, `/api/labels/${x.id}/nachbessern`)).status, 200);
    const n = (await ruf(s, `/api/labels/${x.id}`)).daten;
    assert.equal(n.status, 'nachgebessert');
    assert.equal(n.sprachen.length, 2, 'nach der Nachbesserung zweisprachig');
    assert.equal((await alsMax(s, '/api/anlagen/MON1/freigeben')).status, 409, 'nachgebessert ist noch nicht bestätigt');
    assert.equal((await alsMax(s, `/api/labels/${x.id}/bestaetigen`)).status, 200, 'erneut geprüft');
    assert.equal((await alsMax(s, '/api/anlagen/MON1/freigeben')).status, 200);
    assert.equal((await anlage(s, 'MON1')).gesperrt, false);
  }));

  test('Lackierung 2: genau eines unter 90 % Sprachsicherheit (unsicher, genau prüfen), genau eines Deutsch/Russisch (auffällig, Grund nennt Russisch), Rest Deutsch/Französisch', () => mitDemo(async (s) => {
    const labels = await labelsVon(s, 'LAC2');
    const unter90 = labels.filter((l) => l.sprachKonfidenz < 0.9);
    assert.equal(unter90.length, 1);
    assert.equal(unter90[0].status, 'unsicher');
    assert.equal(unter90[0].prioritaet, 'genau_pruefen');
    assert.equal(sprachen(unter90[0]), 'de+fr');
    const ru = labels.filter((l) => sprachen(l) === 'de+ru');
    assert.equal(ru.length, 1);
    assert.notEqual(ru[0], unter90[0]);
    assert.equal(ru[0].auffaellig, true);
    assert.match(ru[0].gruende.map((g: any) => g.text).join(' '), /Russisch/);
    for (const l of labels.filter((y) => y !== ru[0])) assert.equal(sprachen(l), 'de+fr', l.id);
    for (const l of labels.filter((y) => y !== ru[0] && y !== unter90[0])) assert.equal(l.auffaellig, false, l.id);
  }));

  test('Lackierung 2 Durchlauf: unsicheres Label bestätigen, Russisch melden, nachbessern (dann Deutsch/Französisch), bestätigen, freigeben', () => mitDemo(async (s) => {
    const labels = await labelsVon(s, 'LAC2');
    const ru = labels.find((l) => sprachen(l) === 'de+ru');
    for (const l of labels) {
      const r = l === ru ? await alsMax(s, `/api/labels/${l.id}/fehler`, sprachFalsch) : await alsMax(s, `/api/labels/${l.id}/bestaetigen`);
      assert.equal(r.status, 200, l.id);
    }
    assert.equal((await alsMax(s, '/api/anlagen/LAC2/freigeben')).status, 409);
    assert.equal((await alsMax(s, `/api/labels/${ru.id}/nachbessern`)).status, 200);
    const n = (await ruf(s, `/api/labels/${ru.id}`)).daten;
    assert.equal(sprachen(n), 'de+fr');
    assert.equal(n.status, 'nachgebessert');
    assert.equal((await alsMax(s, `/api/labels/${ru.id}/bestaetigen`)).status, 200);
    assert.equal((await alsMax(s, '/api/anlagen/LAC2/freigeben')).status, 200);
  }));

  test('Marie-Szenario: „Ist alles geprüft?“ mit vier Zahlen, die immer die Gesamtzahl ergeben; am Ende 45 erledigt, nur die Testanlage „Eigene Fotos“ gesperrt', () => mitDemo(async (s) => {
    const pruefe = async (wo: string) => {
      const z = (await marie(s)).zahlen;
      assert.equal(z.gesamt, 48, wo);
      assert.equal(z.offen + z.erledigt + z.fehlerhaft, z.gesamt, `${wo}: Summe (AK-40)`);
      return z;
    };
    await pruefe('Start');
    for (const a of ['PRE3', 'MON1', 'LAC2', 'ABF5']) {
      for (const l of await labelsVon(s, a)) {
        const bad = (a === 'MON1' && l.sprachen.length < 2) || sprachen(l) === 'de+ru';
        if (bad) {
          await alsMax(s, `/api/labels/${l.id}/fehler`, sprachFalsch); await pruefe(`${l.id} gemeldet`);
          await alsMax(s, `/api/labels/${l.id}/nachbessern`); await pruefe(`${l.id} nachgebessert`);
        }
        assert.equal((await alsMax(s, `/api/labels/${l.id}/bestaetigen`)).status, 200, l.id);
        await pruefe(l.id);
      }
      assert.equal((await alsMax(s, `/api/anlagen/${a}/freigeben`)).status, 200, a);
    }
    assert.deepEqual(await pruefe('Ende'), { gesamt: 48, offen: 0, erledigt: 45, fehlerhaft: 3 });
    assert.deepEqual((await marie(s)).anlagen.filter((a: any) => a.gesperrt).map((a: any) => a.id), ['EIG1']);
  }));

  test('Demo-Modus erzwingt die simulierte Spracherkennung, auch wenn LLM_MODUS=echt gesetzt ist', async () => {
    const ordner = mkdtempSync(join(tmpdir(), 'ak50-'));
    const vorher = { ...process.env };
    try {
      Object.assign(process.env, { DATENSATZ: 'demo', DB_PFAD: join(ordner, 'x.sqlite'), LLM_MODUS: 'echt', LLM_API_KEY: 'test' });
      const sys = await bereiteSystemVor(WURZEL);
      assert.equal(sys.konfiguration.modus, 'mock');
      assert.equal(sys.datensatz, 'demo');
      sys.db.close();
    } finally {
      for (const k of ['DATENSATZ', 'DB_PFAD', 'LLM_MODUS', 'LLM_API_KEY']) {
        if (vorher[k] === undefined) delete process.env[k]; else process.env[k] = vorher[k];
      }
      rmSync(ordner, { recursive: true, force: true });
    }
  });

  test('AK-61: keine Notiz oder Erwartung aus testdaten/demo/erwartung.json in einer Antwort der Schnittstelle', () => mitDemo(async (s) => {
    const erw = JSON.parse(readFileSync(join(DEMO, 'erwartung.json'), 'utf8'));
    const notizen: string[] = [];
    for (const [k, v] of Object.entries<any>(erw)) {
      if (k.startsWith('_')) notizen.push(String(v));
      else if (v && typeof v === 'object' && typeof v.notiz === 'string') notizen.push(v.notiz);
    }
    assert.ok(notizen.length > 0, 'Notizen gefunden');
    const text = await zustand(s);
    for (const n of notizen) assert.ok(!text.includes(n), n.slice(0, 60));
    assert.doesNotMatch(text, /erwart|_hinweis|nachKorrektur|nachSimulation/i);
  }));
});

// ---------------------------------------------------------------- AK-51 und AK-46 mit Zusatz

describe('AK-51: Rückmeldung speichert Szenario, Zeitstempel und Kommentar in SQLite', () => {
  const SZ = ['presse3', 'montagelinie1', 'lackierung2', 'marie', 'allgemein'];

  test('jede Rolle der Seiten (max, marie, testleitung) kann zu jedem Szenario eine Rückmeldung speichern; Zeitpunkt vom Server', () => mitDemo(async (s, db) => {
    for (const rolle of ['max', 'marie', 'testleitung']) {
      for (const szenario of SZ) {
        const vor = Date.now();
        const r = await ruf(s, '/api/feedback', { methode: 'POST', rolle, koerper: { szenario, kommentar: `  ${rolle} zu ${szenario}  `, zeitpunkt: '2000-01-01T00:00:00Z' } });
        assert.equal(r.status, 200, `${rolle} ${szenario}: ${r.text}`);
        const t = Date.parse(r.daten.zeitpunkt);
        assert.ok(t >= vor - 1000 && t <= Date.now() + 1000, 'Zeitpunkt vom Server, nicht aus der Anfrage');
      }
    }
    const zeilen = db.prepare('SELECT * FROM feedback ORDER BY id').all() as any[];
    assert.equal(zeilen.length, 15);
    assert.deepEqual(Object.keys(zeilen[0]).sort(), ['id', 'kommentar', 'szenario', 'zeitpunkt'], 'nur Szenario, Zeit, Kommentar');
    assert.equal(zeilen[0].kommentar, 'max zu presse3', 'Leerraum am Rand entfernt');
    const liste = (await ruf(s, '/api/feedback', { rolle: 'testleitung' })).daten;
    assert.equal(liste.length, 15);
    assert.equal(liste[0].kommentar, 'testleitung zu allgemein', 'neueste zuerst');
  }));

  test('zusätzliche Felder (Name, Rolle, E-Mail) werden nicht gespeichert', () => mitDemo(async (s, db) => {
    const r = await ruf(s, '/api/feedback', { methode: 'POST', rolle: 'marie', koerper: { szenario: 'marie', kommentar: 'ok', name: 'Erika Muster', rolle: 'marie', email: 'e@x.de' } });
    assert.equal(r.status, 200);
    const roh = JSON.stringify(db.prepare('SELECT * FROM feedback').all());
    for (const w of ['Erika', 'e@x.de']) assert.ok(!roh.includes(w), w);
    const spalten = (db.prepare('PRAGMA table_info(feedback)').all() as any[]).map((c) => c.name).sort();
    assert.deepEqual(spalten, ['id', 'kommentar', 'szenario', 'zeitpunkt']);
  }));

  test('ungültige Eingaben → 400 mit Meldung, nichts gespeichert; 1000 Zeichen gehen, 1001 nicht', () => mitDemo(async (s, db) => {
    const falsch: unknown[] = [
      {}, { kommentar: 'x' }, { szenario: 'presse4', kommentar: 'x' }, { szenario: 'Presse3', kommentar: 'x' },
      { szenario: 'marie' }, { szenario: 'marie', kommentar: '' }, { szenario: 'marie', kommentar: '   \n ' },
      { szenario: 'marie', kommentar: 42 }, { szenario: 'marie', kommentar: 'x'.repeat(1001) },
      { szenario: 'marie', kommentar: 'a\u0000b' }, { szenario: ['marie'], kommentar: 'x' }, 'kein json', '[]', 'null',
    ];
    for (const k of falsch) {
      const r = await ruf(s, '/api/feedback', { methode: 'POST', rolle: 'max', koerper: k });
      assert.equal(r.status, 400, `${JSON.stringify(k).slice(0, 40)} → ${r.status} ${r.text.slice(0, 80)}`);
      assert.ok(r.daten?.fehler, 'Fachmeldung');
    }
    assert.equal((db.prepare('SELECT COUNT(*) n FROM feedback').get() as any).n, 0);
    assert.equal((await ruf(s, '/api/feedback', { methode: 'POST', rolle: 'max', koerper: { szenario: 'marie', kommentar: 'ä'.repeat(1000) } })).status, 200);
    assert.equal((await ruf(s, '/api/feedback', { methode: 'POST', rolle: 'max', koerper: { szenario: 'marie', kommentar: 'Zeile 1\nZeile 2\tTab' } })).status, 200);
    assert.equal((await ruf(s, '/api/feedback', { methode: 'POST', rolle: 'max', koerper: { szenario: 'marie', kommentar: '<script>alert(1)</script> 😀' } })).status, 200);
  }));

  test('ohne Rolle, mit fremder Rolle oder von fremder Seite (Origin, Sec-Fetch-Site) → 403', () => mitDemo(async (s, db) => {
    const k = JSON.stringify({ szenario: 'marie', kommentar: 'x' });
    for (const rolle of [undefined, 'admin', 'Marie', 'MAX', 'max,marie', '']) {
      const r = await ruf(s, '/api/feedback', { methode: 'POST', rolle, koerper: k });
      assert.equal(r.status, 403, `Rolle ${rolle}`);
    }
    // Typangabe ergänzt durch den Build-Agent (npm run typecheck).
    for (const kopf of [{ Origin: 'http://boese.example' }, { 'Sec-Fetch-Site': 'cross-site' }, { 'Sec-Fetch-Site': 'same-site' }] as Record<string, string>[]) {
      const res = await fetch(s.url + '/api/feedback', { method: 'POST', headers: { 'X-Rolle': 'marie', 'Content-Type': 'application/json', ...kopf }, body: k });
      assert.equal(res.status, 403, JSON.stringify(kopf));
    }
    assert.equal((db.prepare('SELECT COUNT(*) n FROM feedback').get() as any).n, 0);
  }));

  test('Rückmeldungen ansehen nur als Testleitung', () => mitDemo(async (s) => {
    for (const rolle of [undefined, 'max', 'marie']) assert.equal((await ruf(s, '/api/feedback', { rolle })).status, 403, String(rolle));
    assert.equal((await ruf(s, '/api/feedback', { rolle: 'testleitung' })).status, 200);
  }));

  test('Rückmeldungen bleiben nach Neustart in der SQLite-Datei; „löschen“ entfernt sie auch aus der Datei', async () => {
    const ordner = mkdtempSync(join(tmpdir(), 'ak51-'));
    const pfad = join(ordner, 'demo.sqlite');
    try {
      let db = await demoDb(pfad);
      let s = await srv(db);
      const geheim = 'Einmaliger-Kommentar-7f3a9';
      assert.equal((await ruf(s, '/api/feedback', { methode: 'POST', rolle: 'marie', koerper: { szenario: 'marie', kommentar: geheim } })).status, 200);
      await s.zu(); db.close();
      db = oeffneDatenbankMitStand(pfad).db;
      s = await srv(db);
      const liste = (await ruf(s, '/api/feedback', { rolle: 'testleitung' })).daten;
      assert.equal(liste.length, 1);
      assert.equal(liste[0].kommentar, geheim);
      assert.equal(liste[0].szenario, 'marie');
      for (const rolle of [undefined, 'max', 'marie']) assert.equal((await ruf(s, '/api/feedback/loeschen', { methode: 'POST', rolle })).status, 403);
      assert.equal((await ruf(s, '/api/feedback', { rolle: 'testleitung' })).daten.length, 1);
      const r = await ruf(s, '/api/feedback/loeschen', { methode: 'POST', rolle: 'testleitung' });
      assert.equal(r.status, 200);
      assert.equal((await ruf(s, '/api/feedback', { rolle: 'testleitung' })).daten.length, 0);
      await s.zu(); db.close();
      for (const datei of [pfad, `${pfad}-wal`, `${pfad}-journal`]) {
        if (existsSync(datei)) assert.ok(!readFileSync(datei).includes(Buffer.from(geheim)), `${datei} enthält den Kommentar noch`);
      }
    } finally { rmSync(ordner, { recursive: true, force: true }); }
  });

  test('AK-46 mit Zusatz: Maries Rückmeldung ändert nichts an Labels, Anlagen, Protokoll und sendet kein Signal', () => mitDemo(async (s, db) => {
    const vorher = await zustand(s);
    const proto = () => (db.prepare('SELECT COUNT(*) n FROM entscheidungen').get() as any).n;
    const p0 = proto();
    const h = await hoere(s);
    try {
      const n0 = h.anzahl();
      for (const sz of SZ) assert.equal((await ruf(s, '/api/feedback', { methode: 'POST', rolle: 'marie', koerper: { szenario: sz, kommentar: 'bestätigen freigeben' } })).status, 200);
      assert.equal(await h.warte(n0 + 1, 400), n0, 'kein Signal');
    } finally { h.zu(); }
    assert.equal(await zustand(s), vorher);
    assert.equal(proto(), p0);
  }));

  test('AK-46: Marie (und alle außer Testleitung) kann weder Daten zurücksetzen noch Rückmeldungen löschen (neue Pfade der Stufe 4)', () => mitDemo(async (s) => {
    await alsMax(s, '/api/labels/PRE3-01/bestaetigen');
    await ruf(s, '/api/feedback', { methode: 'POST', rolle: 'max', koerper: { szenario: 'presse3', kommentar: 'bleibt' } });
    const vorher = await zustand(s);
    for (const rolle of [undefined, 'marie', 'max', 'Testleitung', 'admin']) {
      for (const pfad of ['/api/demo/zuruecksetzen', '/api/feedback/loeschen']) {
        assert.equal((await ruf(s, pfad, { methode: 'POST', rolle })).status, 403, `${rolle} ${pfad}`);
      }
    }
    for (const methode of ['PUT', 'PATCH', 'DELETE']) {
      for (const pfad of ['/api/feedback', '/api/demo/zuruecksetzen', '/api/feedback/loeschen']) {
        const r = await ruf(s, pfad, { methode, rolle: 'testleitung' });
        assert.ok(r.status >= 400 && r.status < 500, `${methode} ${pfad} → ${r.status}`);
      }
    }
    assert.equal(await zustand(s), vorher);
    assert.equal((await ruf(s, '/api/feedback', { rolle: 'testleitung' })).daten.length, 1);
  }));
});

// ---------------------------------------------------------------- AK-52

describe('AK-52: Daten zurücksetzen für den nächsten Durchlauf', () => {
  async function arbeite(s: Srv) {
    await alsMax(s, '/api/labels/MON1-11/fehler', sprachFalsch);
    await alsMax(s, '/api/labels/MON1-11/nachbessern');
    for (const l of await labelsVon(s, 'PRE3')) await alsMax(s, `/api/labels/${l.id}/bestaetigen`);
    assert.equal((await alsMax(s, '/api/anlagen/PRE3/freigeben')).status, 200);
    await alsMax(s, '/api/labels/LAC2-04/bestaetigen');
    await alsMax(s, '/api/labels/LAC2-07/fehler', sprachFalsch);
    await alsMax(s, '/api/labels/LAC2-01/bestaetigen');
    await alsMax(s, '/api/labels/LAC2-01/zuruecknehmen');
  }

  test('nach einem halben Durchlauf: Zurücksetzen ergibt genau den Ausgangsstand (alle Antworten gleich), Protokoll leer, Rückmeldungen bleiben', () => mitDemo(async (s, db) => {
    const frisch = await zustand(s);
    await ruf(s, '/api/feedback', { methode: 'POST', rolle: 'marie', koerper: { szenario: 'marie', kommentar: 'bleibt erhalten' } });
    await arbeite(s);
    assert.notEqual(await zustand(s), frisch);
    const r = await ruf(s, '/api/demo/zuruecksetzen', { methode: 'POST', rolle: 'testleitung' });
    assert.equal(r.status, 200, r.text);
    assert.equal(await zustand(s), frisch);
    assert.equal((db.prepare('SELECT COUNT(*) n FROM entscheidungen').get() as any).n, 0);
    const fb = (await ruf(s, '/api/feedback', { rolle: 'testleitung' })).daten;
    assert.deepEqual(fb.map((f: any) => f.kommentar), ['bleibt erhalten']);
    // Danach geht ein zweiter Durchlauf genauso.
    await arbeite(s);
    assert.equal((await ruf(s, '/api/demo/zuruecksetzen', { methode: 'POST', rolle: 'testleitung' })).status, 200);
    assert.equal((await ruf(s, '/api/demo/zuruecksetzen', { methode: 'POST', rolle: 'testleitung' })).status, 200, 'zweimal hintereinander');
    assert.equal(await zustand(s), frisch);
  }));

  test('genau ein Signal, Marie liest danach den Ausgangsstand; während des Zurücksetzens sieht Marie nie einen leeren Zwischenstand', () => mitDemo(async (s) => {
    await arbeite(s);
    const h = await hoere(s);
    try {
      const n0 = h.anzahl();
      const gesehen: number[] = [];
      let fertig = false;
      const leser = (async () => { while (!fertig) gesehen.push((await marie(s)).zahlen.gesamt); })();
      const r = await ruf(s, '/api/demo/zuruecksetzen', { methode: 'POST', rolle: 'testleitung' });
      fertig = true; await leser;
      assert.equal(r.status, 200);
      assert.equal(await h.warte(n0 + 1), n0 + 1, 'ein Signal');
      assert.equal(await h.warte(n0 + 2, 300), n0 + 1, 'nicht mehr als eins');
      assert.ok(gesehen.length > 0 && gesehen.every((g) => g === 48), `Zwischenstände: ${[...new Set(gesehen)]}`);
      assert.deepEqual((await marie(s)).zahlen, { gesamt: 48, offen: 44, erledigt: 0, fehlerhaft: 4 });
    } finally { h.zu(); }
  }));

  test('auch mit den Basisdaten (npm start) setzt es auf den Ausgangsstand der 20 Labels zurück', async () => {
    const db = oeffneDatenbank(':memory:');
    await spieleTestdatenEin(db, ladeTestdaten(TESTDATEN));
    const s = await srv(db, TESTDATEN);
    try {
      const frisch = await zustand(s);
      await alsMax(s, '/api/labels/STA4-01/bestaetigen');
      await alsMax(s, '/api/labels/SWR5-05/nacherfassen');
      assert.notEqual(await zustand(s), frisch);
      assert.equal((await ruf(s, '/api/demo/zuruecksetzen', { methode: 'POST', rolle: 'testleitung' })).status, 200);
      assert.equal(await zustand(s), frisch);
    } finally { await s.zu(); db.close(); }
  });
});

// ---------------------------------------------------------------- AK-53

describe('AK-53: README mit Start in höchstens 5 Schritten', () => {
  const readme = readFileSync(join(WURZEL, 'README.md'), 'utf8');
  const pkg = JSON.parse(readFileSync(join(WURZEL, 'package.json'), 'utf8'));
  const start = readme.split(/^## /m).find((t) => t.startsWith('Starten'))!;

  test('Abschnitt „Starten“ hat höchstens 5 nummerierte Schritte', () => {
    assert.ok(start, 'Abschnitt Starten');
    const schritte = start.split('\n').filter((z) => /^\d+\.\s/.test(z));
    assert.ok(schritte.length >= 1 && schritte.length <= 5, `${schritte.length} Schritte`);
  });

  test('jedes genannte npm-Skript existiert, die Adresse passt zum Standardport, die Rollen heißen wie in der Oberfläche', () => {
    for (const [, name] of readme.matchAll(/npm run ([a-z]+)/g)) assert.ok(pkg.scripts[name!], `npm run ${name}`);
    assert.match(start, /npm ci/);
    assert.match(start, /npm run demo/);
    assert.match(start, /http:\/\/127\.0\.0\.1:3000/);
    assert.match(readFileSync(join(WURZEL, 'src/server/start.ts'), 'utf8'), /PORT \?\? 3000/);
    const startseite = readFileSync(join(WURZEL, 'src/ui/start/Startseite.tsx'), 'utf8');
    // Angepasst durch den Build-Agent (Bram, 11.10.2026): keine Karte „Instandhaltung“ mehr in der Rollenwahl;
    // die Simulation ist über den Verweis auf Max' Seiten erreichbar.
    for (const rolle of ['Max', 'Marie']) {
      assert.match(start, new RegExp(rolle));
      assert.match(startseite, new RegExp(rolle));
    }
    assert.doesNotMatch(startseite, /Instandhaltung/);
    assert.match(readFileSync(join(WURZEL, 'src/ui/rahmen.tsx'), 'utf8'), /Simulation: Instandhaltung \(nur im Prototyp\)/);
    const node = /ab Version (\d+)\.(\d+)/.exec(start)!;
    assert.ok(node, 'Node-Version genannt');
    assert.equal(`>=${node[1]}.${node[2]}`, pkg.engines.node, 'gleiche Version wie engines in package.json');
  });

  test('Schritt 3 wirklich ausgeführt: `npm run demo` startet mit Demo-Daten und liefert Oberfläche und Anlagen aus', async () => {
    const { spawn } = await import('node:child_process');
    const ordner = mkdtempSync(join(tmpdir(), 'ak53-'));
    const p = spawn('npm', ['run', 'demo'], {
      cwd: WURZEL, env: { ...process.env, PORT: '0', DB_PFAD: join(ordner, 'demo.sqlite'), DATENSATZ: '' }, stdio: ['ignore', 'pipe', 'pipe'], detached: true,
    });
    let aus = '';
    p.stdout.on('data', (d) => { aus += d; });
    p.stderr.on('data', (d) => { aus += d; });
    try {
      const ende = Date.now() + 90_000;
      let m: RegExpExecArray | null = null;
      while (!(m = /läuft auf (http:\/\/127\.0\.0\.1:\d+)/.exec(aus)) && Date.now() < ende && p.exitCode === null) await new Promise((r) => setTimeout(r, 200));
      assert.ok(m, `Server gestartet:\n${aus.slice(-600)}`);
      assert.match(aus, /Demo-Daten/);
      assert.match(aus, /mock/);
      const html = await (await fetch(m[1]!)).text();
      assert.match(html, /<div id="root">|<script/);
      const anlagen = await (await fetch(`${m[1]}/api/anlagen`)).json();
      assert.deepEqual(anlagen.map((a: any) => a.name).sort(), ['Abfüllung 5', 'Lackierung 2', 'Montagelinie 1', 'Presse 3', 'Testanlage Eigene Fotos']);
    } finally {
      // npm startet node als Kindprozess: die ganze Prozessgruppe beenden, sonst bleibt der Server offen.
      try { process.kill(-p.pid!, 'SIGTERM'); } catch { /* schon beendet */ }
      p.stdout.destroy(); p.stderr.destroy();
      await new Promise((r) => setTimeout(r, 300));
      rmSync(ordner, { recursive: true, force: true });
    }
  });

  test('docs/testablauf.md ist verlinkt; was „richtig“ wäre, steht dort und nicht in der Oberfläche (AK-61)', () => {
    assert.match(readme, /docs\/testablauf\.md/);
    assert.ok(existsSync(join(WURZEL, 'docs/testablauf.md')));
  });
});
