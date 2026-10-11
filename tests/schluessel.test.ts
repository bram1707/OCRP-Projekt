// AK-34: Mock-Modus ist Standard, der API-Schlüssel kommt nur aus .env.

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { detectLanguage } from '../src/ai/detectLanguage.ts';
import { leseKonfiguration, waehleModell } from '../src/ai/konfiguration.ts';
import { mockModell } from '../src/ai/mock.ts';
import { oeffneDatenbank, spieleTestdatenEin } from '../src/db/datenbank.ts';
import { testdaten, WURZEL } from './hilfen.ts';

function alleDateien(ordner: string): string[] {
  return readdirSync(ordner, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? alleDateien(join(ordner, e.name)) : [join(ordner, e.name)],
  );
}

describe('AK-34 Schlüssel nur aus .env, Mock ist Standard', () => {
  test('ohne Einstellungen läuft der Mock-Modus', async () => {
    const konfiguration = leseKonfiguration({});
    assert.deepEqual(konfiguration, { modus: 'mock', schluesselVorhanden: false });
    assert.equal(waehleModell(konfiguration), mockModell);
    const ergebnis = await detectLanguage('ACHTUNG! Nicht berühren. Hochspannung.', 0.95, waehleModell(konfiguration));
    assert.deepEqual(ergebnis.sprachen, ['de']);
  });

  test('echter Modus ohne Schlüssel bricht mit klarer Meldung ab', () => {
    assert.throws(() => waehleModell(leseKonfiguration({ LLM_MODUS: 'echt' })), /LLM_API_KEY/);
  });

  test('echter Modus ist im MVP nicht angebunden, auch mit Schlüssel', () => {
    assert.throws(() => waehleModell(leseKonfiguration({ LLM_MODUS: 'echt', LLM_API_KEY: 'x' })), /nicht angebunden/);
  });

  test('der Schlüssel landet nie in der Datenbank', async () => {
    const geheim = 'test-geheim-7f3a9c';
    const vorher = process.env.LLM_API_KEY;
    process.env.LLM_API_KEY = geheim;
    try {
      const db = oeffneDatenbank(':memory:');
      await spieleTestdatenEin(db, testdaten());
      for (const tabelle of ['anlagen', 'labels', 'entscheidungen']) {
        assert.ok(!JSON.stringify(db.prepare(`SELECT * FROM ${tabelle}`).all()).includes(geheim), tabelle);
      }
    } finally {
      if (vorher === undefined) delete process.env.LLM_API_KEY;
      else process.env.LLM_API_KEY = vorher;
    }
  });

  test('nur die Konfiguration liest LLM_API_KEY, kein Schlüssel im Code', () => {
    for (const datei of alleDateien(join(WURZEL, 'src'))) {
      const code = readFileSync(datei, 'utf8');
      if (!datei.endsWith('konfiguration.ts')) assert.ok(!code.includes('LLM_API_KEY'), datei);
      assert.doesNotMatch(code, /sk-[A-Za-z0-9]{10,}/, datei);
    }
  });

  test('.env steht in .gitignore, die Vorlage enthält keinen Schlüssel', () => {
    assert.match(readFileSync(join(WURZEL, '.gitignore'), 'utf8'), /^\.env$/m);
    assert.match(readFileSync(join(WURZEL, '.env.example'), 'utf8'), /^LLM_API_KEY=$/m);
  });
});
