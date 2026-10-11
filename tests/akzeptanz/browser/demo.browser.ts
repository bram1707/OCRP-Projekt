// Akzeptanztest des Test-Agents für Stufe 4 im echten Browser: AK-50 bis AK-53, AK-46 mit Zusatz, AK-61.
// Unabhängig von tests/browser/demo.browser.ts des Build-Agents: Hier klickt eine Testperson mit der Maus,
// so wie es README und docs/testablauf.md beschreiben; Marie schaut in einem zweiten Fenster zu.
// Dazu Rückmeldung von verschiedenen Seiten, Sonderzeichen in Kommentaren, schmaler Bildschirm, Zurücksetzen.
// Läuft NICHT mit `npm test` (Playwright ist kein Paket des Projekts). Aufruf nach `npm run build`:
//   node --disable-warning=ExperimentalWarning --test tests/akzeptanz/browser/demo.browser.ts
// Optional: PLAYWRIGHT_PFAD (Standard: globales Playwright), BILDER=<ordner> für Screenshots.

import assert from 'node:assert/strict';
import { existsSync, mkdirSync } from 'node:fs';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { ladeTestdaten, oeffneDatenbank, spieleTestdatenEin } from '../../../src/db/datenbank.ts';
import { erstelleServer } from '../../../src/server/app.ts';
import { TESTDATEN, WURZEL } from '../hilfe.ts';

const PW: string = process.env.PLAYWRIGHT_PFAD ?? '/opt/node22/lib/node_modules/playwright/index.mjs';
const BILDER = process.env.BILDER ?? null;
const DEMO = join(TESTDATEN, 'demo');

let server: Server;
let url = '';
let browser: any;
let page: any;
let marie: any;
const konsole: string[] = [];
const anfragen: { fenster: string; methode: string; pfad: string; rolle: string | null }[] = [];
const texte: string[] = [];

async function bild(seite: any, name: string): Promise<void> {
  if (!BILDER) return;
  mkdirSync(BILDER, { recursive: true });
  await seite.screenshot({ path: join(BILDER, `${name}.png`), fullPage: true });
}
const merke = async (seite = page) => { texte.push(await seite.locator('body').innerText()); };
const zahl = async (z: string) => (await marie.locator(`[data-zahl="${z}"]`).innerText()).match(/\d+/)![0];
const zahlen = async () => `${await zahl('gesamt')}/${await zahl('offen')}/${await zahl('erledigt')}/${await zahl('fehlerhaft')}`;
async function warteZahlen(soll: string, ms = 5000): Promise<number> {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if ((await zahlen().catch(() => '')) === soll) return Date.now() - t0;
    await marie.waitForTimeout(50);
  }
  assert.fail(`Marie zeigt ${await zahlen()}, erwartet ${soll}`);
}
const klick = (text: string | RegExp, seite = page) => seite.getByRole('button', { name: text }).first().click();
const link = (text: string | RegExp, seite = page) => seite.getByRole('link', { name: text }).first().click();

async function rolle(name: RegExp): Promise<void> {
  await link('Startseite');
  await page.getByRole('heading', { name: 'Wer sind Sie?' }).waitFor();
  await link(name);
  await page.locator('main h1').first().waitFor();
}
async function oeffneAnlage(name: string): Promise<void> {
  if (!page.url().endsWith('#/anlagen')) await page.goto(`${url}/#/anlagen`);
  await page.getByRole('heading', { name: 'Anlagen', level: 1 }).waitFor();
  await page.locator('main a', { hasText: name }).first().click();
  await page.getByRole('heading', { name, level: 1 }).waitFor();
}
/** Klickt sich durch alle Labels: meldet `melden` mit „Sprache falsch“, bestätigt den Rest. Gibt die Reihenfolge zurück. */
async function pruefe(melden: string[] = []): Promise<string[]> {
  await klick(/Prüfung (starten|fortsetzen)/);
  const ids: string[] = [];
  for (let i = 0; i < 20 && /\/label\//.test(page.url()); i++) {
    await page.locator('button:has-text("Ja, bestätigen"):not([disabled])').waitFor({ timeout: 10000 });
    const id = (await page.locator('h1').first().innerText()).replace('Label', '').trim();
    ids.push(id);
    await merke();
    const vorher = page.url();
    if (melden.includes(id)) {
      await klick('Nein, Fehler melden');
      await klick(/^Sprache falsch/);
    } else {
      await klick('Ja, bestätigen');
    }
    await page.waitForFunction((a: string) => location.href !== a, vorher, { timeout: 10000 });
    await page.locator('h1').first().waitFor();
  }
  return ids;
}
async function freigeben(name: string): Promise<void> {
  await page.getByRole('heading', { name, level: 1 }).waitFor();
  await klick('Anlage freigeben');
  await klick('Ja, freigeben');
  await page.locator('main [data-marke]:has-text("Freigegeben")').first().waitFor({ timeout: 10000 });
}
async function nachbessern(id: string): Promise<void> {
  // Angepasst durch den Build-Agent (Bram, 11.10.2026: keine Karte „Instandhaltung“ in der Rollenwahl):
  // Die Simulation ist über den Verweis unten auf Max' Seiten erreichbar.
  await link('Simulation: Instandhaltung (nur im Prototyp)');
  await page.locator('main h1').first().waitFor();
  await merke();
  await page.locator(`[data-wartend="${id}"]`).getByRole('button', { name: /Nachbesserung simulieren/ }).click();
  await page.locator(`[data-wartend="${id}"]`).waitFor({ state: 'detached', timeout: 10000 });
}
async function rueckmeldung(seite: any, kommentar: string): Promise<string> {
  await klick('Rückmeldung geben', seite);
  const szenario = await seite.locator('select').inputValue();
  await seite.locator('textarea').fill(kommentar);
  await klick('Rückmeldung senden', seite);
  await seite.getByText('Danke! Ihre Rückmeldung ist gespeichert.').waitFor();
  return szenario;
}

before(async () => {
  assert.ok(existsSync(join(WURZEL, 'dist', 'index.html')), 'Vorher `npm run build` ausführen.');
  const db = oeffneDatenbank(':memory:');
  await spieleTestdatenEin(db, ladeTestdaten(DEMO));
  server = erstelleServer({ db, bilderOrdner: join(DEMO, 'bilder'), datenOrdner: DEMO, oberflaecheOrdner: join(WURZEL, 'dist') });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const { chromium } = await import(PW);
  browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  page = await ctx.newPage();
  marie = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  for (const [name, s] of [['testperson', page], ['marie', marie]] as const) {
    s.on('console', (m: any) => konsole.push(`${name} ${m.type()}: ${m.text()}`));
    s.on('pageerror', (e: Error) => konsole.push(`${name} pageerror: ${e.message}`));
    s.on('request', (r: any) => {
      const p = new URL(r.url()).pathname;
      if (p.startsWith('/api/')) anfragen.push({ fenster: name, methode: r.method(), pfad: p, rolle: r.headers()['x-rolle'] ?? null });
    });
  }
});
after(async () => {
  await browser?.close();
  await new Promise<void>((r) => server?.close(() => r()));
});

describe('Stufe 4 im Browser, mit der Maus wie eine Testperson', () => {
  test('AK-53 Schritt 4/5: Startseite fragt „Wer sind Sie?“ mit Max und Marie (ohne Instandhaltung, angepasst); unten die Testleitung', async () => {
    await page.goto(url);
    await page.getByRole('heading', { name: 'Wer sind Sie?' }).waitFor();
    const t = await page.locator('main').innerText();
    for (const w of ['Max · Labels prüfen', 'Marie · Übersicht ansehen', 'Für die Testleitung', 'Rückmeldungen ansehen', 'Daten zurücksetzen']) assert.ok(t.includes(w), w);
    assert.ok(!t.includes('Instandhaltung'), 'keine Karte „Instandhaltung“ (Bram, 11.10.2026)');
    await merke();
    await bild(page, '01-rollenwahl');
  });

  test('AK-50 Marie (zweites Fenster): Start 48 / 44 / 0 / 4, Antwort „Nein“', async () => {
    await marie.goto(url);
    await link(/^Marie/, marie);
    await marie.locator('[data-zahl="gesamt"]').waitFor();
    await warteZahlen('48/44/0/4');
    assert.match(await marie.locator('[data-antwort]').innerText(), /^Nein\./);
    await merke(marie);
    await bild(marie, '02-marie-start');
  });

  test('AK-50 Presse 3: 12 Labels einzeln bestätigen, freigeben; Marie zählt ohne Neuladen mit', async () => {
    await link(/^Max/);
    await page.getByRole('heading', { name: 'Anlagen', level: 1 }).waitFor();
    for (const n of ['Presse 3', 'Montagelinie 1', 'Lackierung 2']) assert.match(await page.locator('main li', { hasText: n }).innerText(), /Gesperrt/);
    await oeffneAnlage('Presse 3');
    assert.equal((await pruefe()).length, 12);
    await freigeben('Presse 3');
    await bild(page, '03-presse3-freigegeben');
    await warteZahlen('48/32/12/4');
  });

  test('AK-50 Montagelinie 1: MON1-11 vorn mit Hinweis, melden; Freigabe geht nicht; Instandhaltung bessert nach; bestätigen, freigeben', async () => {
    await page.goto(`${url}/#/anlagen`);
    await oeffneAnlage('Montagelinie 1');
    await klick(/Prüfung (starten|fortsetzen)/);
    await page.locator('h1:has-text("MON1-11")').waitFor();
    assert.match(await page.locator('main').innerText(), /Sprachen anders als bei 14 von 15 Labels/);
    await bild(page, '04-mon1-11-hinweis');
    // Rückmeldung auf der Einzelansicht: Szenario „Montagelinie 1“ vorausgewählt
    assert.equal(await rueckmeldung(page, 'Hinweis gut sichtbar? <b>fett</b> & "Zitat" 😀'), 'montagelinie1');
    await page.goto(`${url}/#/anlage/MON1`);
    const ids = await pruefe(['MON1-11']);
    assert.equal(ids[0], 'MON1-11');
    assert.equal(ids.length, 15);
    await page.getByRole('heading', { name: 'Montagelinie 1', level: 1 }).waitFor();
    assert.match(await page.locator('main').innerText(), /14 von 15 bestätigt/);
    assert.equal(await page.getByRole('button', { name: 'Anlage freigeben' }).count(), 0, 'kein Freigabeknopf, solange eines fehlerhaft ist');
    await bild(page, '05-mon1-gesperrt');
    await warteZahlen('48/17/26/5');
    await nachbessern('MON1-11');
    await warteZahlen('48/18/26/4');
    await rolle(/^Max/);
    await oeffneAnlage('Montagelinie 1');
    await klick(/Prüfung (starten|fortsetzen)/);
    await page.locator('h1:has-text("MON1-11")').waitFor();
    assert.match(await page.locator('main').innerText(), /Nachgebessert/);
    assert.match(await page.locator('main').innerText(), /WARNING/);
    await bild(page, '06-mon1-11-nachgebessert');
    await page.goto(`${url}/#/anlage/MON1`);
    assert.deepEqual(await pruefe(), ['MON1-11']);
    await freigeben('Montagelinie 1');
  });

  test('AK-50 Lackierung 2: LAC2-04 „Unsicher“ selbst ansehen und bestätigen, LAC2-07 (Russisch) melden, nachbessern, freigeben', async () => {
    await oeffneAnlage('Lackierung 2');
    await page.goto(`${url}/#/anlage/LAC2/label/LAC2-04`);
    await page.locator('h1:has-text("LAC2-04")').waitFor();
    assert.match(await page.locator('main').innerText(), /Unsicher/);
    await bild(page, '07-lac2-04-unsicher');
    await page.goto(`${url}/#/anlage/LAC2/label/LAC2-07`);
    await page.locator('h1:has-text("LAC2-07")').waitFor();
    assert.match(await page.locator('main').innerText(), /Russisch/);
    await bild(page, '08-lac2-07-russisch');
    await page.goto(`${url}/#/anlage/LAC2`);
    const ids = await pruefe(['LAC2-07']);
    assert.equal(ids.length, 10);
    await nachbessern('LAC2-07');
    await rolle(/^Max/);
    await oeffneAnlage('Lackierung 2');
    assert.deepEqual(await pruefe(), ['LAC2-07']);
    await freigeben('Lackierung 2');
    await bild(page, '09-lac2-freigegeben');
  });

  test('AK-50 Marie nach den drei Demo-Anlagen: 48 / 8 / 37 / 3 und „Nein. 11 von 48 Labels …“ (Testanlage „Eigene Fotos“ offen)', async () => {
    await warteZahlen('48/8/37/3');
    assert.equal(await marie.locator('[data-antwort]').innerText(), 'Nein. 11 von 48 Labels sind noch nicht erledigt.');
    await merke(marie);
    await bild(marie, '10-marie-fertig');
  });

  test('AK-51: Rückmeldung auf jeder Seite, Szenario passend vorausgewählt; Marie schreibt eine', async () => {
    const seiten: [string, string][] = [
      ['#/', 'allgemein'], ['#/anlagen', 'allgemein'], ['#/anlage/PRE3', 'presse3'], ['#/anlage/LAC2/label/LAC2-01', 'lackierung2'],
      ['#/simulation', 'allgemein'], ['#/rueckmeldungen', 'allgemein'],
    ];
    for (const [adresse, szenario] of seiten) {
      await page.goto(`${url}/${adresse}`);
      await page.locator('main h1').first().waitFor();
      await klick('Rückmeldung geben');
      assert.equal(await page.locator('select').inputValue(), szenario, adresse);
      await klick('Abbrechen');
    }
    assert.equal(await rueckmeldung(marie, 'Was heißt fehlerhaft?'), 'marie');
    await bild(marie, '11-marie-rueckmeldung');
  });

  test('Testleitung: Rückmeldungen ansehen zeigt beide, Sonderzeichen als Text (kein HTML)', async () => {
    await page.goto(url);
    await link('Rückmeldungen ansehen');
    await page.getByRole('heading', { name: 'Rückmeldungen', level: 1 }).waitFor();
    const t = await page.locator('main').innerText();
    assert.match(t, /2 Rückmeldungen/);
    assert.ok(t.includes('Hinweis gut sichtbar? <b>fett</b> & "Zitat" 😀'), 'Kommentar wörtlich');
    assert.ok(t.includes('Was heißt fehlerhaft?'));
    assert.equal(await page.locator('main b').count(), 0, 'kein HTML aus dem Kommentar');
    await bild(page, '12-rueckmeldungen');
  });

  test('AK-52: Daten zurücksetzen mit Rückfrage; „Abbrechen“ ändert nichts; danach Marie ohne Neuladen 48 / 44 / 0 / 4, Rückmeldungen bleiben', async () => {
    await page.goto(url);
    await page.getByRole('heading', { name: 'Wer sind Sie?' }).waitFor();
    await klick('Daten zurücksetzen');
    await bild(page, '13-zuruecksetzen-rueckfrage');
    await klick('Abbrechen');
    await marie.waitForTimeout(500);
    assert.equal(await zahlen(), '48/8/37/3');
    let neuGeladen = 0;
    const zaehle = (f: any) => { if (f === marie.mainFrame()) neuGeladen++; };
    marie.on('framenavigated', zaehle);
    await klick('Daten zurücksetzen');
    await klick('Ja, zurücksetzen');
    await page.getByText(/Die Daten sind zurückgesetzt/).waitFor();
    const ms = await warteZahlen('48/44/0/4');
    marie.off('framenavigated', zaehle);
    assert.equal(neuGeladen, 0, 'Marie lädt nicht neu');
    assert.ok(ms < 3000, `${ms} ms`);
    await bild(marie, '14-marie-nach-zuruecksetzen');
    await link(/^Max/);
    for (const n of ['Presse 3', 'Montagelinie 1', 'Lackierung 2']) assert.match(await page.locator('main li', { hasText: n }).innerText(), /Gesperrt/);
    await page.goto(`${url}/#/rueckmeldungen`);
    await page.getByRole('heading', { name: 'Rückmeldungen', level: 1 }).waitFor();
    assert.match(await page.locator('main').innerText(), /2 Rückmeldungen/);
  });

  test('Schmaler Bildschirm (Telefon, 390 px): Rollenwahl und Rückmeldeformular ohne waagerechtes Scrollen', async () => {
    const tel = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
    await tel.goto(url);
    await tel.getByRole('heading', { name: 'Wer sind Sie?' }).waitFor();
    const breit = () => tel.evaluate(() => document.documentElement.scrollWidth);
    assert.ok((await breit()) <= 390, `Rollenwahl ${await breit()} px`);
    await tel.goto(`${url}/#/marie`);
    await tel.locator('[data-zahl="gesamt"]').waitFor();
    await tel.getByRole('button', { name: 'Rückmeldung geben' }).click();
    await tel.locator('textarea').waitFor();
    assert.ok((await breit()) <= 390, `Formular ${await breit()} px`);
    await bild(tel, '15-telefon-rueckmeldung');
    await tel.close();
  });

  test('AK-46 mit Zusatz: Maries Fenster schreibt nur die Rückmeldung (als „marie“), alles andere GET ohne Rolle', () => {
    const m = anfragen.filter((a) => a.fenster === 'marie');
    assert.deepEqual(m.filter((a) => a.methode !== 'GET').map((a) => `${a.methode} ${a.pfad} ${a.rolle}`), ['POST /api/feedback marie']);
    assert.ok(m.filter((a) => a.methode === 'GET').every((a) => a.rolle === null));
  });

  test('AK-61 und AK-21: keine Erwartungswerte, keine Fachwörter auf den Seiten; keine Fehler in der Konsole', () => {
    assert.ok(texte.length > 30);
    for (const t of texte) assert.doesNotMatch(t, /erwart|Soll-Sprache|\b(OCR|Konfidenz|API|LLM|JSON)\b/i);
    assert.deepEqual(konsole.filter((z) => / (error|warning|pageerror)/.test(z)), []);
  });
});
