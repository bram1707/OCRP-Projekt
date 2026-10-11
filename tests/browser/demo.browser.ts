// Demo-Durchlauf im echten Browser, nur mit der Tastatur (Stufe 4, AK-50 bis AK-53): genau die Schritte der README.
// Rollenwahl, Max prüft Presse 3, Montagelinie 1 und Lackierung 2 bis „Freigegeben“, die Instandhaltung bessert nach,
// Marie verfolgt alles in einem zweiten Fenster, dazu Rückmeldung, Rückmeldungen ansehen und Daten zurücksetzen.
// Läuft NICHT mit `npm test` (Playwright ist kein Paket des Projekts, AK-60). Aufruf nach `npm run build`:
//   node --disable-warning=ExperimentalWarning --test tests/browser/demo.browser.ts
// Optional: PLAYWRIGHT_PFAD (Standard: globales Playwright), BILDER_AUSGABE=<ordner> für Screenshots.

import assert from 'node:assert/strict';
import { existsSync, mkdirSync } from 'node:fs';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { erstelleServer } from '../../src/server/app.ts';
import { DEMO, DEMO_BILDER, demoErwartungen, neueDemoDatenbank, WURZEL } from '../hilfen.ts';

const PW: string = process.env.PLAYWRIGHT_PFAD ?? '/opt/node22/lib/node_modules/playwright/index.mjs';
const AUSGABE = process.env.BILDER_AUSGABE ?? null;
const DIST = join(WURZEL, 'dist');

let server: Server;
let url = '';
let browser: any;
/** Fenster der Testperson: Rollenwahl, Max, Instandhaltung, Testleitung */
let page: any;
/** zweites Fenster mit Maries Übersicht */
let marie: any;
const konsole: string[] = [];
const anfragen: { fenster: string; methode: string; pfad: string; rolle: string | null }[] = [];
const texte: string[] = [];

async function bild(seite: any, name: string): Promise<void> {
  if (!AUSGABE) return;
  mkdirSync(AUSGABE, { recursive: true });
  await seite.screenshot({ path: join(AUSGABE, `${name}.png`), fullPage: true });
}
const fokus = (seite = page): Promise<{ tag: string; text: string }> =>
  seite.evaluate(() => {
    const e = document.activeElement;
    return { tag: e?.tagName ?? '', text: (e?.textContent ?? '').replace(/\s+/g, ' ').trim() };
  });
/** Drückt Tab (oder Shift+Tab), bis das fokussierte Element den Text enthält. */
async function tabZu(text: string | RegExp, { rueckwaerts = false, seite = page } = {}): Promise<void> {
  for (let i = 0; i < 250; i++) {
    await seite.keyboard.press(rueckwaerts ? 'Shift+Tab' : 'Tab');
    const t = (await fokus(seite)).text;
    if (typeof text === 'string' ? t.includes(text) : text.test(t)) return;
  }
  throw new Error(`Fokus nicht gefunden: ${text}`);
}
async function merkeText(seite = page): Promise<void> {
  texte.push(await seite.locator('body').innerText());
}
const ueberschrift = (seite = page): Promise<string> => seite.locator('h1').first().innerText();
const zahl = async (z: string): Promise<string> => (await marie.locator(`[data-zahl="${z}"] a span`).nth(1).innerText()).trim();
const zahlen = async (): Promise<string> => `${await zahl('gesamt')}/${await zahl('offen')}/${await zahl('erledigt')}/${await zahl('fehlerhaft')}`;
async function warteAufZahlen(soll: string, ms = 8000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < ms) {
    if ((await zahlen().catch(() => '')) === soll) return;
    await marie.waitForTimeout(50);
  }
  assert.fail(`Marie: erwartet ${soll}, angezeigt ${await zahlen()}`);
}

/** Über „Rolle wechseln“ zur Rollenwahl und dort eine Rolle wählen. */
async function wechsleRolle(rolle: string): Promise<void> {
  if (!page.url().endsWith('#/')) {
    await tabZu('Startseite', { rueckwaerts: true });
    await page.keyboard.press('Enter');
  }
  await page.getByRole('heading', { name: 'Wer sind Sie?' }).waitFor();
  await tabZu(rolle);
  await page.keyboard.press('Enter');
  await page.locator('main h1').first().waitFor();
  await page.waitForTimeout(150);
}

/** In Max' Anlagen eine Anlage öffnen und „Prüfung starten“. */
async function starteAnlage(name: string): Promise<void> {
  if (!page.url().endsWith('#/anlagen')) {
    await tabZu('Alle Anlagen', { rueckwaerts: true });
    await page.keyboard.press('Enter');
  }
  await page.getByRole('heading', { name: 'Anlagen' }).waitFor();
  await tabZu(name);
  await page.keyboard.press('Enter');
  await page.getByRole('heading', { name, level: 1 }).waitFor();
  await tabZu('Prüfung starten');
  await page.keyboard.press('Enter');
  await page.locator('h1:has-text("Label ")').waitFor();
}

/**
 * Geht Label für Label durch: meldet die genannten mit „Sprache falsch“, bestätigt alle anderen.
 * Endet, wenn Max wieder auf der Übersicht der Anlage steht. Gibt die Kennungen in der Reihenfolge zurück.
 */
async function pruefeAlle(melden: readonly string[] = []): Promise<string[]> {
  const gesehen: string[] = [];
  for (let i = 0; i < 20; i++) {
    if (!/#\/anlage\/[A-Z0-9-]+\/label\//.test(page.url())) break;
    await page.locator('button:has-text("Ja, bestätigen"):not([disabled])').waitFor({ timeout: 10000 });
    const id = (await ueberschrift()).replace(/^Label /, '').trim();
    gesehen.push(id);
    await merkeText();
    const vorher = page.url();
    if (melden.includes(id)) {
      await tabZu('Nein, Fehler melden');
      await page.keyboard.press('Enter');
      await tabZu(/^Sprache falsch/);
      await page.keyboard.press('Enter');
    } else {
      await tabZu('Ja, bestätigen');
      await page.keyboard.press('Enter');
    }
    await page.waitForFunction((alt: string) => window.location.href !== alt, vorher, { timeout: 10000 });
    await page.locator('h1').first().waitFor();
    await page.waitForTimeout(150);
  }
  return gesehen;
}

/** Auf der Übersicht der Anlage freigeben, mit Rückfrage. */
async function gebeFrei(name: string): Promise<void> {
  await page.getByRole('heading', { name, level: 1 }).waitFor();
  await tabZu('Anlage freigeben');
  await page.keyboard.press('Enter');
  assert.equal((await fokus()).text, 'Abbrechen', 'Rückfrage: Fokus auf „Abbrechen“');
  await tabZu('Ja, freigeben');
  await page.keyboard.press('Enter');
  await page.locator('main [data-marke]:has-text("Freigegeben")').first().waitFor({ timeout: 10000 });
}

/** Instandhaltung: das gemeldete Label nachbessern. Erreichbar über den Verweis unten auf Max' Seiten (keine eigene Karte). */
async function bessereNach(labelId: string): Promise<void> {
  await tabZu('Simulation: Instandhaltung');
  await page.keyboard.press('Enter');
  await page.locator('main h1').first().waitFor();
  await page.locator(`[data-wartend="${labelId}"]`).waitFor();
  await merkeText();
  await tabZu('Nachbesserung simulieren');
  await page.keyboard.press('Enter');
  await page.getByText(labelId).first().waitFor();
  await page.locator(`[data-wartend="${labelId}"]`).waitFor({ state: 'detached', timeout: 10000 });
}

before(async () => {
  assert.ok(existsSync(join(DIST, 'index.html')), 'Vorher `npm run build` ausführen (dist/ fehlt).');
  server = erstelleServer({ db: await neueDemoDatenbank(), bilderOrdner: DEMO_BILDER, datenOrdner: DEMO, oberflaecheOrdner: DIST });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const { chromium } = await import(PW).catch((e: unknown) => {
    throw new Error(`Playwright nicht gefunden unter ${PW}. Den Pfad mit PLAYWRIGHT_PFAD angeben; Playwright ist kein Paket des Projekts.`, { cause: e });
  });
  browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  page = await context.newPage();
  marie = await context.newPage();
  for (const [name, seite] of [['testperson', page], ['marie', marie]] as const) {
    seite.on('console', (m: any) => konsole.push(`${name} ${m.type()}: ${m.text()}`));
    seite.on('pageerror', (e: Error) => konsole.push(`${name} pageerror: ${e.message}`));
    seite.on('request', (r: any) => {
      const pfad = new URL(r.url()).pathname;
      if (pfad.startsWith('/api/')) anfragen.push({ fenster: name, methode: r.method(), pfad, rolle: r.headers()['x-rolle'] ?? null });
    });
  }
});

after(async () => {
  await browser?.close();
  await new Promise<void>((r) => server?.close(() => r()));
});

describe('Demo-Durchlauf nur mit der Tastatur, wie in der README', () => {
  test('Schritt 4 und 5: Adresse öffnen, Rolle wählen; Marie öffnet ihre Übersicht im zweiten Fenster (37/36/0/1)', async () => {
    await marie.goto(url);
    await marie.getByRole('heading', { name: 'Wer sind Sie?' }).waitFor();
    assert.equal(await marie.title(), 'Rolle wählen · Label-Prüfung');
    assert.equal((await fokus(marie)).tag, 'H1');
    await tabZu('Marie · Übersicht ansehen', { seite: marie });
    await marie.keyboard.press('Enter');
    await marie.locator('[data-aktualisiert]').waitFor();
    assert.equal(await zahlen(), '40/36/0/4');
    assert.equal(await marie.locator('[data-antwort]').innerText(), 'Nein. 40 von 40 Labels sind noch nicht erledigt.');
    await bild(marie, 'd01-marie-start');

    await page.goto(url);
    await page.getByRole('heading', { name: 'Wer sind Sie?' }).waitFor();
    await merkeText();
    await bild(page, 'd02-rollenwahl');
    await tabZu('Max · Labels prüfen');
    await page.keyboard.press('Enter');
    await page.getByRole('heading', { name: 'Anlagen' }).waitFor();
    assert.ok(page.url().endsWith('#/anlagen'));
    assert.equal(await page.title(), 'Label-Prüfung · Max');
    for (const name of ['Presse 3', 'Montagelinie 1', 'Lackierung 2']) {
      assert.match(await page.locator('li', { hasText: name }).innerText(), /Gesperrt/, name);
    }
    await merkeText();
  });

  test('Presse 3: 12 Labels einzeln bestätigen, freigeben', async () => {
    await starteAnlage('Presse 3');
    const gesehen = await pruefeAlle();
    assert.equal(gesehen.length, 12);
    await gebeFrei('Presse 3');
    await warteAufZahlen('40/24/12/4');
    await bild(page, 'd03-presse3-freigegeben');
  });

  test('Montagelinie 1: das auffällige Label nur auf Deutsch melden, nachbessern lassen, bestätigen, freigeben', async () => {
    await starteAnlage('Montagelinie 1');
    assert.equal((await ueberschrift()).trim(), 'Label MON1-11', 'das auffällige Label steht vorn');
    assert.match(await page.locator('main').innerText(), /Sprachen anders als bei 14 von 15 Labels dieser Anlage: hier Deutsch, sonst Deutsch und Englisch\./);
    await bild(page, 'd04-mon1-11-auffaellig');
    const gesehen = await pruefeAlle(['MON1-11']);
    assert.equal(gesehen.length, 15);
    await page.getByRole('heading', { name: 'Montagelinie 1', level: 1 }).waitFor();
    assert.match(await page.locator('main').innerText(), /14 von 15 bestätigt/);
    // „fehlerhaft“ zählt bei Marie auch das unsichere LAC2-04 mit.
    await warteAufZahlen('40/9/26/5');

    await bessereNach('MON1-11');
    await warteAufZahlen('40/10/26/4');
    await wechsleRolle('Max');
    await starteAnlage('Montagelinie 1');
    assert.equal((await ueberschrift()).trim(), 'Label MON1-11');
    assert.match(await page.locator('main').innerText(), /Nachgebessert/);
    assert.equal(await page.locator('main img').first().getAttribute('src'), '/bilder/MON1-11-neu.svg');
    await bild(page, 'd05-mon1-11-nachgebessert');
    assert.deepEqual(await pruefeAlle(), ['MON1-11']);
    await gebeFrei('Montagelinie 1');
    await warteAufZahlen('40/9/27/4');
  });

  test('Lackierung 2: das unsichere Label bestätigen, Deutsch/Russisch melden, nachbessern lassen, bestätigen, freigeben', async () => {
    await starteAnlage('Lackierung 2');
    const gesehen = await pruefeAlle(['LAC2-07']);
    assert.equal(gesehen.length, 10);
    assert.ok(gesehen.includes('LAC2-04') && gesehen.includes('LAC2-07'));
    await bessereNach('LAC2-07');
    await wechsleRolle('Max');
    await starteAnlage('Lackierung 2');
    assert.deepEqual(await pruefeAlle(), ['LAC2-07']);
    await gebeFrei('Lackierung 2');
    await bild(page, 'd06-lac2-freigegeben');
  });

  test('Marie nach den drei Demo-Anlagen: „Nein. 3 von 40 Labels …“ (nur die Testanlage „Eigene Fotos“ fehlt), ohne Neuladen', async () => {
    await warteAufZahlen('40/0/37/3');
    assert.equal(await marie.locator('[data-antwort]').innerText(), 'Nein. 3 von 40 Labels sind noch nicht erledigt.');
    await merkeText(marie);
    await bild(marie, 'd07-marie-fertig');
  });

  test('Rückmeldung mit der Tastatur: bei Marie vorausgewählt „Marie“, bei Lackierung 2 „Lackierung 2“', async () => {
    await tabZu('Rückmeldung geben', { seite: marie });
    await marie.keyboard.press('Enter');
    assert.equal((await fokus(marie)).tag, 'TEXTAREA', 'Fokus im Kommentarfeld');
    assert.equal(await marie.locator('select').inputValue(), 'marie');
    await marie.keyboard.type('Die Zahlen sind klar. Was heißt „fehlerhaft“ genau?');
    await bild(marie, 'd08-rueckmeldung');
    await tabZu('Rückmeldung senden', { seite: marie });
    await marie.keyboard.press('Enter');
    await marie.getByText('Danke! Ihre Rückmeldung ist gespeichert.').waitFor();
    assert.equal((await fokus(marie)).text, 'Rückmeldung geben');

    await page.goto(`${url}/#/anlage/LAC2`);
    await page.getByRole('heading', { name: 'Lackierung 2', level: 1 }).waitFor();
    await tabZu('Rückmeldung geben');
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('select').inputValue(), 'lackierung2');
    // Escape schließt, der Fokus geht zurück auf den Knopf.
    await page.keyboard.press('Escape');
    assert.equal((await fokus()).text, 'Rückmeldung geben');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Russisch habe ich erst beim zweiten Hinsehen bemerkt.');
    await tabZu('Rückmeldung senden');
    await page.keyboard.press('Enter');
    await page.getByText('Danke! Ihre Rückmeldung ist gespeichert.').waitFor();
  });

  test('Daten zurücksetzen: Rückfrage mit Fokus auf „Abbrechen“; danach springt Maries Übersicht von selbst auf 37/36/0/1', async () => {
    await wechsleRolle('Max');
    await tabZu('Startseite', { rueckwaerts: true });
    await page.keyboard.press('Enter');
    await page.getByRole('heading', { name: 'Wer sind Sie?' }).waitFor();
    await tabZu('Daten zurücksetzen');
    await page.keyboard.press('Enter');
    assert.equal((await fokus()).text, 'Abbrechen');
    await bild(page, 'd09-zuruecksetzen-rueckfrage');
    await page.keyboard.press('Escape');
    assert.equal((await fokus()).text, 'Daten zurücksetzen');
    await page.keyboard.press('Enter');
    await tabZu('Ja, zurücksetzen');
    const navigationen: string[] = [];
    const merke = (f: any) => f === marie.mainFrame() && navigationen.push(f.url());
    marie.on('framenavigated', merke);
    await page.keyboard.press('Enter');
    await page.getByText('Die Daten sind zurückgesetzt. Alle Anlagen stehen wieder am Anfang.').waitFor();
    await warteAufZahlen('40/36/0/4');
    marie.off('framenavigated', merke);
    assert.deepEqual(navigationen, [], 'Maries Seite lädt nicht neu');
    assert.equal(await marie.locator('[data-antwort]').innerText(), 'Nein. 40 von 40 Labels sind noch nicht erledigt.');
  });

  test('Rückmeldungen ansehen: beide sind noch da; „Alle Rückmeldungen löschen“ mit Rückfrage', async () => {
    await tabZu('Rückmeldungen ansehen', { rueckwaerts: true });
    await page.keyboard.press('Enter');
    await page.getByRole('heading', { name: 'Rückmeldungen', level: 1 }).waitFor();
    assert.equal(await page.title(), 'Rückmeldungen · Testleitung');
    const liste = await page.locator('main').innerText();
    assert.match(liste, /2 Rückmeldungen/);
    assert.match(liste, /Lackierung 2 · \d\d\.\d\d\.\d{4}, \d\d:\d\d\s+Russisch habe ich erst beim zweiten Hinsehen bemerkt\./);
    assert.match(liste, /Marie: Ist alles geprüft\? · .*\s+Die Zahlen sind klar\./);
    await bild(page, 'd10-rueckmeldungen');
    await tabZu('Alle Rückmeldungen löschen');
    await page.keyboard.press('Enter');
    assert.equal((await fokus()).text, 'Abbrechen');
    await tabZu('Ja, alle löschen');
    await page.keyboard.press('Enter');
    await page.getByText('Es gibt keine Rückmeldungen.').waitFor();
    assert.match(await page.locator('main').innerText(), /2 Rückmeldungen sind gelöscht\./);
  });

  test('AK-46 mit Zusatz: Maries Fenster sendet nur GET ohne Rolle und die eine Rückmeldung als „marie“', () => {
    const vonMarie = anfragen.filter((a) => a.fenster === 'marie');
    const schreibend = vonMarie.filter((a) => a.methode !== 'GET');
    assert.deepEqual(schreibend.map((a) => [a.methode, a.pfad, a.rolle]), [['POST', '/api/feedback', 'marie']]);
    for (const a of vonMarie.filter((x) => x.methode === 'GET')) assert.equal(a.rolle, null, a.pfad);
  });

  test('keine Notiz der Demo-Daten auf einer Seite, keine Fehler in der Konsole', () => {
    const notizen = Object.values(demoErwartungen()).flatMap((e) => (e.notiz ? [e.notiz] : []));
    for (const t of texte) {
      for (const n of notizen) assert.ok(!t.includes(n), n);
      assert.doesNotMatch(t, /\b(OCR|Konfidenz|API|LLM|JSON)\b|Datensatz|erwart/i);
    }
    const fehler = konsole.filter((z) => / (error|warning|pageerror)/.test(z));
    assert.deepEqual(fehler, []);
  });
});
