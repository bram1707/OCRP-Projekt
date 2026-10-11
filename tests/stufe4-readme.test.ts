// B10 (AK-53): Die README startet den Prototyp in höchstens 5 Schritten, und jedes genannte `npm run` gibt es.
// Ob ein Teammitglied ohne Vorwissen ohne Nachfragen durchkommt, ist manuell zu prüfen; der Browser-Durchlauf
// tests/browser/demo.browser.ts folgt genau diesen Schritten.

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { WURZEL } from './hilfen.ts';

const README = readFileSync(join(WURZEL, 'README.md'), 'utf8');
const SKRIPTE = Object.keys(JSON.parse(readFileSync(join(WURZEL, 'package.json'), 'utf8')).scripts);

function abschnitt(text: string, titel: string): string {
  const start = text.indexOf(`\n## ${titel}\n`);
  assert.ok(start >= 0, `Abschnitt „${titel}“ fehlt`);
  const ende = text.indexOf('\n## ', start + 1);
  return text.slice(start, ende < 0 ? undefined : ende);
}

describe('README (AK-53)', () => {
  const starten = abschnitt(README, 'Starten');
  const schritte = starten.split('\n').filter((z) => /^\d+\. /.test(z));

  test('Start in höchstens 5 Schritten: Node prüfen, npm ci, npm run demo, Adresse öffnen, Rolle wählen', () => {
    assert.ok(schritte.length >= 1 && schritte.length <= 5, `${schritte.length} Schritte`);
    assert.match(schritte[0] ?? '', /Node\.js ab Version 22\.18/);
    assert.ok(schritte.some((z) => z.includes('`npm ci`')));
    assert.ok(schritte.some((z) => z.includes('`npm run demo`')));
    assert.ok(schritte.some((z) => z.includes('http://127.0.0.1:3000')));
    assert.match(schritte.at(-1)!, /Rolle wählen/);
  });

  test('Für Testende nur `npm run demo`, `npm test` und Entwicklerbefehle stehen im eigenen Abschnitt', () => {
    assert.doesNotMatch(starten, /npm (start|test)|npm run (dev|build|bilder)/);
    const entwickler = abschnitt(README, 'Für Entwickler');
    for (const s of ['npm test', 'npm start', 'PLAYWRIGHT_PFAD', 'npm run bilder -- testdaten/demo']) assert.ok(entwickler.includes(s), s);
  });

  test('Jedes genannte `npm run …` und `npm start`/`npm test` gibt es in package.json', () => {
    const genannt = new Set([...README.matchAll(/npm run ([a-z:-]+)/g)].map((m) => m[1] ?? ''));
    for (const m of README.matchAll(/npm (start|test)\b/g)) genannt.add(m[1] ?? '');
    assert.ok(genannt.size >= 5);
    for (const name of genannt) assert.ok(SKRIPTE.includes(name), `npm run ${name} fehlt`);
  });

  test('Die README nennt die engine-Version aus package.json, und der Ablauf für die Testleitung existiert', () => {
    const pkg = JSON.parse(readFileSync(join(WURZEL, 'package.json'), 'utf8'));
    assert.equal(pkg.engines.node, '>=22.18');
    assert.match(README, /\(docs\/testablauf\.md\)/);
    assert.ok(existsSync(join(WURZEL, 'docs', 'testablauf.md')));
    for (const datei of [...README.matchAll(/`((?:tests|testdaten|docs)\/[^`*]+?\.(?:ts|md))`/g)].map((m) => m[1] ?? '')) {
      assert.ok(existsSync(join(WURZEL, datei)), datei);
    }
  });
});

describe('Ablauf für die Testleitung (B10, H1)', () => {
  const ablauf = readFileSync(join(WURZEL, 'docs', 'testablauf.md'), 'utf8');
  test('beschreibt alle vier Szenarien, H1 als Beobachtungspunkt bei Marie und das Zurücksetzen', () => {
    for (const s of ['Presse 3', 'Montagelinie 1', 'Lackierung 2', 'Ist alles geprüft?', 'Beobachten (H1)', 'Daten zurücksetzen']) {
      assert.ok(ablauf.includes(s), s);
    }
    assert.match(ablauf, /40 Labels gesamt, 36 offen, 0 erledigt, 4 fehlerhaft/);
  });
});
