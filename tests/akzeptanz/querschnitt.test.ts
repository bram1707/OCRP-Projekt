// Test-Agent Stufe 1 · AK-34, AK-40 (Vorstufe), AK-60, AK-61, AK-62

import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { leseKonfiguration, waehleModell } from '../../src/ai/konfiguration.ts';
import { mockModell } from '../../src/ai/mock.ts';
import { basisDb, ruf, server, TESTDATEN, WURZEL } from './hilfe.ts';

const summe = (z: Record<string, number>) => Object.values(z).reduce((a, b) => a + b, 0);

describe('AK-40 Vorstufe: jede Anlage zählt jedes Label genau einmal', () => {
  test('Ausgangslage und nach jeder Aktion: Summe der Status = Soll-Anzahl', async () => {
    const s = await server(await basisDb());
    try {
      const pruefe = async (wann: string) => {
        for (const a of (await ruf(s, '/api/anlagen')).daten) assert.equal(summe(a.zaehlung), a.sollAnzahl, `${a.id} ${wann}`);
      };
      await pruefe('am Anfang');
      await ruf(s, '/api/labels/STA4-01/bestaetigen', { methode: 'POST', rolle: 'max' });
      await pruefe('nach Bestätigen');
      await ruf(s, '/api/labels/STA4-02/fehler', { methode: 'POST', rolle: 'max', koerper: { grund: 'unleserlich' } });
      await pruefe('nach Melden');
      await ruf(s, '/api/labels/STA4-02/nachbessern', { methode: 'POST', rolle: 'max' });
      await pruefe('nach Nachbessern');
      await ruf(s, '/api/labels/SWR5-02/nachbessern', { methode: 'POST', rolle: 'max' });
      await pruefe('nach Nachbessern mit neuem Foto');
    } finally { await s.zu(); }
  });

  test('Maries Zählweise (offen + erledigt + fehlerhaft inkl. unsicher und fehlend = gesamt) aus den Daten ableitbar', async () => {
    const s = await server(await basisDb());
    try {
      let gesamt = 0, offen = 0, erledigt = 0, fehlerhaft = 0;
      for (const a of (await ruf(s, '/api/anlagen')).daten) {
        const z = a.zaehlung;
        gesamt += a.sollAnzahl;
        offen += z.offen + z.nachgebessert;
        erledigt += z.bestaetigt;
        fehlerhaft += z.fehlerhaft + z.unsicher + z.fehlt;
      }
      assert.equal(offen + erledigt + fehlerhaft, gesamt);
      assert.equal(gesamt, 20);
    } finally { await s.zu(); }
  });
});

describe('AK-61 Erwartungswerte nie in der Ansicht', () => {
  test('keine Antwort enthält Felder oder Notizen aus erwartung.json', async () => {
    const erw = JSON.parse(readFileSync(join(TESTDATEN, 'erwartung.json'), 'utf8')) as Record<string, any>;
    const notizen = Object.values(erw).flatMap((e) => (typeof e === 'object' && e?.notiz ? [e.notiz as string] : []));
    const s = await server(await basisDb());
    try {
      const pfade = ['/api/anlagen'];
      for (const a of ['STA4', 'FOE2', 'SWR5']) {
        pfade.push(`/api/anlagen/${a}/labels`, `/api/anlagen/${a}/zusammenfassung`);
      }
      for (const id of Object.keys(erw).filter((k) => !k.startsWith('_'))) pfade.push(`/api/labels/${id}`);
      for (const p of pfade) {
        const { text } = await ruf(s, p);
        for (const wort of ['"lesbar"', '"notiz"', '"erwartung', '"tatsaechlich', '"nachKorrektur"', '"korrektur"']) {
          assert.ok(!text.includes(wort), `${p} enthält ${wort}`);
        }
        for (const n of notizen) assert.ok(!text.includes(n), `${p} enthält Notiz`);
      }
      assert.equal((await ruf(s, '/testdaten/erwartung.json')).status, 404);
      assert.equal((await ruf(s, '/bilder/../erwartung.json')).status, 404);
      assert.equal((await ruf(s, '/bilder/%2e%2e%2ferwartung.json')).status, 404);
    } finally { await s.zu(); }
  });

  test('kein Code unter src/ erwähnt erwartung.json', () => {
    const dateien = (o: string): string[] => readdirSync(o).flatMap((f) => {
      const p = join(o, f);
      return statSync(p).isDirectory() ? dateien(p) : [p];
    });
    for (const d of dateien(join(WURZEL, 'src'))) assert.ok(!readFileSync(d, 'utf8').includes('erwartung'), d);
  });
});

describe('AK-34 Schlüssel nur aus der Umgebung, Mock ist Standard', () => {
  test('ohne Umgebung: Mock', () => {
    assert.equal(waehleModell(leseKonfiguration({})), mockModell);
  });
  test('echter Modus ohne Schlüssel bricht ab', () => {
    assert.throws(() => waehleModell(leseKonfiguration({ LLM_MODUS: 'echt' })));
  });
  test('Datenbankschema hat keine Spalte für Schlüssel', async () => {
    const db = await basisDb();
    const spalten = ['anlagen', 'labels', 'entscheidungen'].flatMap((t) =>
      (db.prepare(`PRAGMA table_info(${t})`).all() as { name: string }[]).map((c) => c.name));
    assert.ok(!spalten.some((c) => /key|schluessel|token/i.test(c)));
  });
});

describe('AK-60 keine weiteren Abhängigkeiten', () => {
  test('package.json: als dependencies nur die Texterkennung mit ihren Sprachdaten (Ausnahme vom 11.10.2026, Optimierung 2: Türkisch, Bulgarisch, Chinesisch), sonst der Stack aus AK-60 mit Typangaben (Stufe 2, F1)', () => {
    const p = JSON.parse(readFileSync(join(WURZEL, 'package.json'), 'utf8'));
    assert.deepEqual(Object.keys(p.dependencies).sort(), [
      '@tesseract.js-data/bul', '@tesseract.js-data/chi_sim', '@tesseract.js-data/deu', '@tesseract.js-data/eng', '@tesseract.js-data/fra',
      '@tesseract.js-data/pol', '@tesseract.js-data/rus', '@tesseract.js-data/tur', 'tesseract.js',
    ]);
    assert.deepEqual(Object.keys(p.devDependencies).sort(), [
      '@tailwindcss/vite', '@types/node', '@types/react', '@types/react-dom', 'react', 'react-dom', 'tailwindcss', 'typescript', 'vite',
    ]);
  });
});

describe('AK-62 Testdaten', () => {
  test('20 Labels, Abdeckung der geforderten Fälle', async () => {
    const db = await basisDb();
    const l = db.prepare('SELECT id, anlage_id, bild_pfad, sprachen, status FROM labels').all() as any[];
    assert.equal(l.length, 20);
    const sprachen = new Set(l.flatMap((x) => JSON.parse(x.sprachen)));
    for (const c of ['de', 'en', 'pl', 'fr', 'ru']) assert.ok(sprachen.has(c), c);
    assert.ok(l.filter((x) => JSON.parse(x.sprachen).length >= 2).length > 10, 'die meisten zweisprachig');
    assert.ok(l.some((x) => x.status === 'nachgebessert'));
    assert.ok(l.some((x) => x.status === 'fehlerhaft'));
    assert.ok(l.some((x) => x.bild_pfad === null));
    const jeAnlage = new Map<string, any[]>();
    for (const x of l) jeAnlage.set(x.anlage_id, [...(jeAnlage.get(x.anlage_id) ?? []), x]);
    assert.ok([...jeAnlage.values()].some((v) => v.length >= 10));
    assert.ok([...jeAnlage.values()].some((v) => v.every((x) => x.status === 'bestaetigt')));
  });
});
