// Akzeptanztests des Test-Agents für Maries Übersicht im echten Browser (Stufe 3, AK-40 bis AK-46).
// Unabhängig von tests/browser/marie.browser.ts des Build-Agents: Max ändert hier über seine
// eigene Oberfläche in einem zweiten Fenster (nicht über die Schnittstelle), Marie klickt mit der Maus.
// Läuft NICHT mit `npm test` (Playwright ist kein Paket des Projekts, AK-60). Aufruf nach `npm run build`:
//   node --disable-warning=ExperimentalWarning --test tests/akzeptanz/browser/marie.browser.ts
// Optional: PLAYWRIGHT_PFAD (Standard: globales Playwright), BILDER=<ordner> für Screenshots.

import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { erstelleServer } from '../../../src/server/app.ts';
import { basisDb, TESTDATEN, WURZEL } from '../hilfe.ts';

const PW: string = process.env.PLAYWRIGHT_PFAD ?? '/opt/node22/lib/node_modules/playwright/index.mjs';
const BILDER = process.env.BILDER ?? null;
const DIST = join(WURZEL, 'dist');

let url = '';
let schliessen: () => Promise<void> = async () => undefined;
let browser: any;
let marie: any;
let max: any;
let marieLadungen = 0;
const marieAufrufe: { methode: string; pfad: string; rolle: string | null }[] = [];
const konsole: string[] = [];
let nr = 0;

async function bild(p: any, name: string): Promise<void> {
  if (!BILDER) return;
  mkdirSync(BILDER, { recursive: true });
  await p.screenshot({ path: join(BILDER, `${String(++nr).padStart(2, '0')}-${name}.png`), fullPage: true });
}
const api = async (pfad: string) => (await fetch(url + pfad)).json() as Promise<any>;
const zahl = async (z: string) => (await marie.locator(`[data-zahl="${z}"] a`).innerText()).match(/\d+/)?.[0];
const zahlen = async () => `${await zahl('gesamt')}/${await zahl('offen')}/${await zahl('erledigt')}/${await zahl('fehlerhaft')}`;
const sollZahlen = async () => { const z = (await api('/api/marie')).zahlen; return `${z.gesamt}/${z.offen}/${z.erledigt}/${z.fehlerhaft}`; };
async function warteAuf(f: () => Promise<boolean>, ms = 3000): Promise<boolean> {
  const ende = Date.now() + ms;
  while (Date.now() < ende) { if (await f()) return true; await new Promise((r) => setTimeout(r, 25)); }
  return false;
}
const zeilen = () => marie.locator('[data-auswahl] [data-marie-label]');
const zeilenIds = async (): Promise<string[]> => zeilen().evaluateAll((l: Element[]) => l.map((e) => e.getAttribute('data-marie-label')));

before(async () => {
  assert.ok(existsSync(join(DIST, 'index.html')), 'Vorher `npm run build` ausführen (dist/ fehlt).');
  const s = erstelleServer({ db: await basisDb(), bilderOrdner: join(TESTDATEN, 'bilder'), oberflaecheOrdner: DIST });
  await new Promise<void>((r) => s.listen(0, '127.0.0.1', r));
  url = `http://127.0.0.1:${(s.address() as AddressInfo).port}`;
  schliessen = () => new Promise((r) => s.close(() => r()));
  const { chromium } = await import(PW);
  browser = await chromium.launch();
  // Zwei getrennte Fenster: Marie und Max.
  marie = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  max = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  marie.on('console', (m: any) => { if (m.type() === 'error') konsole.push(m.text()); });
  marie.on('pageerror', (e: Error) => konsole.push(`pageerror: ${e.message}`));
  marie.on('load', () => { marieLadungen += 1; });
  marie.on('request', (r: any) => {
    if (!r.url().startsWith(url + '/api')) return;
    marieAufrufe.push({ methode: r.method(), pfad: r.url().replace(url, ''), rolle: r.headers()['x-rolle'] ?? null });
  });
});

after(async () => {
  await browser?.close();
  await schliessen();
});

describe('Marie im Browser', () => {
  test('AK-40, AK-41, AK-21: vier Zahlen wie der Server, Anlagen mit Sperre und Fortschritt, dringendste oben', async () => {
    await marie.goto(`${url}/#/marie`);
    await marie.locator('[data-zahl="gesamt"]').waitFor();
    // Kein networkidle: die offene Signal-Verbindung bleibt absichtlich bestehen.
    await warteAuf(async () => (await marie.locator('[data-marie-anlage]').count()) === 3);
    await bild(marie, 'marie-start');
    assert.equal(await zahlen(), '20/9/7/4');
    assert.equal(await zahlen(), await sollZahlen());
    const ids = await marie.locator('[data-marie-anlage]').evaluateAll((l: Element[]) => l.map((e) => e.getAttribute('data-marie-anlage')));
    assert.deepEqual(ids, ['SWR5', 'STA4', 'FOE2']);
    for (const a of await api('/api/anlagen')) {
      const t = await marie.locator(`[data-marie-anlage="${a.id}"]`).innerText();
      assert.match(t, a.gesperrt ? /Gesperrt/ : /Freigegeben/, a.id);
      assert.match(t, new RegExp(`${a.bestaetigt} von ${a.id === 'SWR5' ? 5 : a.sollAnzahl} bestätigt`), a.id);
    }
    const text = await marie.locator('body').innerText();
    assert.match(text, /simuliert/i, 'Hinweis auf simulierte Erkennung');
    for (const wort of ['OCR', 'Konfidenz', 'API', 'JSON', 'Datensatz', 'erwart', 'Soll-Sprache']) assert.ok(!text.includes(wort), wort);
  });

  test('AK-46: auf Maries Seite gibt es keinen Knopf und kein Eingabefeld zum Entscheiden', async () => {
    const anzahl = await marie.locator('button, input, textarea, select, [contenteditable="true"]').count();
    assert.equal(anzahl, 0);
    const text = await marie.locator('main').innerText();
    for (const w of ['Ja, bestätigen', 'Fehler melden', 'Anlage freigeben', 'Nachbessern', 'Zurücknehmen']) assert.ok(!text.includes(w), w);
  });

  test('AK-42, AK-43: Klick auf „Fehlerhaft“ zeigt 4 Labels mit Foto/„Kein Foto“, Statuswort und Grund; „Warum?“ nennt alle', async () => {
    await marie.locator('[data-zahl="fehlerhaft"] a').click();
    await marie.locator('[data-auswahl]').waitFor();
    assert.deepEqual(await zeilenIds(), ['SWR5-05', 'SWR5-02', 'STA4-08', 'STA4-09']);
    for (const id of await zeilenIds()) {
      const z = marie.locator(`[data-auswahl] [data-marie-label="${id}"]`);
      const t = await z.innerText();
      if (id === 'SWR5-05') assert.match(t, /Kein Foto/);
      else assert.equal(await z.locator('img').evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0), true, `Foto ${id}`);
      assert.match(t, /Fehlt|Fehlerhaft|Unsicher/, `Status ${id}`);
    }
    const sw2 = await marie.locator('[data-auswahl] [data-marie-label="SWR5-02"]').innerText();
    assert.match(sw2, /gemeldet \(Label beschädigt\)/);
    await marie.locator('[data-warum-zahl="fehlerhaft"] summary').click();
    const w = await marie.locator('[data-warum-zahl="fehlerhaft"]').innerText();
    for (const id of ['SWR5-05', 'SWR5-02', 'STA4-08', 'STA4-09']) assert.ok(w.includes(id), `Warum nennt ${id}`);
    await bild(marie, 'marie-fehlerhaft-warum');
  });

  test('AK-14: jeder Status in Maries Liste hat Wort und eigene Farbe', async () => {
    await marie.locator('[data-zahl="gesamt"] a').click();
    await warteAuf(async () => (await zeilen().count()) === 20);
    const farben: Record<string, Set<string>> = {};
    for (const id of await zeilenIds()) {
      const marke = marie.locator(`[data-auswahl] [data-marie-label="${id}"] [data-marke]`).first();
      const wort = (await marke.innerText()).trim();
      const farbe = await marke.evaluate((e: Element) => getComputedStyle(e).backgroundColor);
      (farben[wort] ??= new Set()).add(farbe);
    }
    assert.deepEqual(Object.keys(farben).sort(), ['Bestätigt', 'Fehlerhaft', 'Fehlt', 'Nachgebessert', 'Offen', 'Unsicher']);
    for (const [w, f] of Object.entries(farben)) assert.equal(f.size, 1, `${w} hat eine Farbe`);
    const alle = Object.values(farben).map((f) => [...f][0]);
    assert.equal(new Set(alle).size, alle.length, 'verschiedene Status, verschiedene Farben');
    for (const f of alle) assert.notEqual(f, 'rgba(0, 0, 0, 0)');
  });

  test('AK-42, AK-43: Klick auf Stanzanlage 4 zeigt ihre 10 Labels; „Warum?“ bei STA4-09 zeigt Sprachbelege', async () => {
    await marie.locator('[data-marie-anlage="STA4"] h3 a').click();
    await warteAuf(async () => (await zeilen().count()) === 10);
    const ids = await zeilenIds();
    assert.equal(ids.length, 10);
    assert.deepEqual(ids.slice(0, 2), ['STA4-08', 'STA4-09'], 'Unsichere zuerst');
    assert.equal(ids[9], 'STA4-10', 'Bestätigtes zuletzt');
    await marie.locator('[data-warum-label="STA4-09"] summary').click();
    const w = await marie.locator('[data-warum-label="STA4-09"]').innerText();
    assert.match(w, /90 %/);
    assert.match(w, /Russisch|Polnisch/);
    assert.ok((await marie.locator('[data-warum-label="STA4-09"] mark').count()) > 0, 'Stellen im Text markiert');
    await marie.locator('[data-warum-anlage="STA4"] summary').click();
    const wa = await marie.locator('[data-warum-anlage="STA4"]').innerText();
    for (const id of ['STA4-01', 'STA4-07', 'STA4-08', 'STA4-09']) assert.ok(wa.includes(id), `Warum gesperrt nennt ${id}`);
    await bild(marie, 'marie-sta4-warum');
  });

  test('AK-44: Max bestätigt in seinem Fenster STA4-01 → Maries Zahlen springen ohne Neuladen um', async () => {
    const ladungen = marieLadungen;
    await max.goto(`${url}/#/anlage/STA4/label/STA4-01`);
    const knopf = max.getByRole('button', { name: 'Ja, bestätigen' });
    await knopf.waitFor();
    await warteAuf(async () => knopf.isEnabled());
    const start = Date.now();
    await knopf.click();
    assert.ok(await warteAuf(async () => (await zahlen()) === '20/8/8/4'), `Zahlen: ${await zahlen()}`);
    const dauer = Date.now() - start;
    assert.equal(marieLadungen, ladungen, 'Maries Seite wurde nicht neu geladen');
    assert.equal(await zahlen(), await sollZahlen());
    assert.ok(dauer < 3000, `Dauer ${dauer} ms`);
    assert.match(await marie.locator('[data-auswahl] [data-marie-label="STA4-01"]').innerText(), /Bestätigt/);
    assert.match(await marie.locator('[data-marie-anlage="STA4"]').innerText(), /2 von 10 bestätigt/);
    await bild(marie, 'marie-nach-bestaetigen');
    await bild(max, 'max-hat-bestaetigt');
  });

  test('AK-44: Max meldet in seinem Fenster STA4-02 → bei Marie „Fehlerhaft“ mit Grund', async () => {
    await max.goto(`${url}/#/anlage/STA4/label/STA4-02`);
    const melden = max.getByRole('button', { name: 'Nein, Fehler melden' });
    await melden.waitFor();
    await warteAuf(async () => melden.isEnabled());
    await melden.click();
    await max.getByRole('button', { name: /Unleserlich/ }).click();
    assert.ok(await warteAuf(async () => (await zahlen()) === '20/7/8/5'), `Zahlen: ${await zahlen()}`);
    const z = await marie.locator('[data-auswahl] [data-marie-label="STA4-02"]').innerText();
    assert.match(z, /Fehlerhaft/);
    assert.match(z, /Unleserlich/);
    await bild(marie, 'marie-nach-melden');
  });

  test('AK-44: Nachbessern auf der Simulationsseite → bei Marie „Nachgebessert“, zählt als offen', async () => {
    await max.goto(`${url}/#/simulation`);
    const knopf = max.locator('p', { hasText: 'Label STA4-02' }).locator('xpath=../..').getByRole('button', { name: 'Nachbesserung simulieren' });
    await knopf.waitFor();
    await knopf.click();
    assert.ok(await warteAuf(async () => (await zahlen()) === '20/8/8/4'), `Zahlen: ${await zahlen()}`);
    assert.match(await marie.locator('[data-auswahl] [data-marie-label="STA4-02"]').innerText(), /Nachgebessert/);
  });

  test('AK-46: Maries Seite hat nur GET ohne Rolle geschickt; keine Fehler in der Konsole', async () => {
    assert.ok(marieAufrufe.length > 0);
    assert.deepEqual(marieAufrufe.filter((a) => a.methode !== 'GET' || a.rolle !== null), []);
    assert.deepEqual(konsole, []);
  });
});
