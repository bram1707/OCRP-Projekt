// „Rückmeldung geben“ im echten Browser: Fälle aus der eigenen Gegenprüfung der Stufe 4 (Escape, Fokus nach
// einem Fehler, Vorauswahl beim Seitenwechsel, Liste der Testleitung).
// Läuft NICHT mit `npm test` (Playwright ist kein Paket des Projekts, AK-60). Aufruf nach `npm run build`:
//   node --disable-warning=ExperimentalWarning --test tests/browser/rueckmeldung.browser.ts

import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { after, before, beforeEach, describe, test } from 'node:test';
import { erstelleServer } from '../../src/server/app.ts';
import { DEMO, DEMO_BILDER, neueDemoDatenbank, WURZEL } from '../hilfen.ts';

const PW: string = process.env.PLAYWRIGHT_PFAD ?? '/opt/node22/lib/node_modules/playwright/index.mjs';
const DIST = join(WURZEL, 'dist');

let server: Server;
let url = '';
let browser: any;
let page: any;
const konsole: string[] = [];

const fokus = (): Promise<{ tag: string; text: string }> =>
  page.evaluate(() => ({ tag: document.activeElement?.tagName ?? '', text: (document.activeElement?.textContent ?? '').trim() }));
async function warteBis(bedingung: () => Promise<boolean>, was: string, ms = 5000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < ms) {
    if (await bedingung()) return;
    await page.waitForTimeout(25);
  }
  assert.fail(`nicht erreicht: ${was}`);
}
const formular = () => page.locator('form[data-rueckmeldung]');

/** Lädt die Seite neu (nicht nur die Adresse nach #), damit jeder Test mit geschlossenem Formular beginnt. */
async function oeffne(adresse: string, ueberschrift: string): Promise<void> {
  await page.goto('about:blank');
  await page.goto(`${url}/${adresse}`);
  await page.getByRole('heading', { name: ueberschrift, level: 1 }).waitFor();
}
async function rueckmeldungOeffnen(text: string): Promise<void> {
  await page.getByRole('button', { name: 'Rückmeldung geben' }).click();
  await formular().waitFor();
  await page.keyboard.type(text);
}

before(async () => {
  assert.ok(existsSync(join(DIST, 'index.html')), 'Vorher `npm run build` ausführen (dist/ fehlt).');
  server = erstelleServer({ db: await neueDemoDatenbank(), bilderOrdner: DEMO_BILDER, datenOrdner: DEMO, oberflaecheOrdner: DIST });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const { chromium } = await import(PW).catch((e: unknown) => {
    throw new Error(`Playwright nicht gefunden unter ${PW}. Den Pfad mit PLAYWRIGHT_PFAD angeben.`, { cause: e });
  });
  browser = await chromium.launch();
  page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  page.on('pageerror', (e: Error) => konsole.push(`pageerror: ${e.message}`));
});
beforeEach(async () => {
  await page.unrouteAll({ behavior: 'ignoreErrors' });
});
after(async () => {
  await browser?.close();
  await new Promise<void>((r) => server?.close(() => r()));
});

describe('Rückmeldung im Browser (Gegenprüfung Stufe 4)', () => {
  test('Escape im Formular schließt nur das Formular; Max\' offene Auswahl der Gründe bleibt', async () => {
    await oeffne('#/anlage/MON1/label/MON1-11', 'Label MON1-11');
    await page.getByRole('button', { name: 'Nein, Fehler melden' }).click();
    const grund = page.getByRole('button', { name: /^Sprache falsch/ });
    await grund.waitFor();
    await rueckmeldungOeffnen('Escape-Test');
    await page.keyboard.press('Escape');
    await formular().waitFor({ state: 'detached' });
    assert.equal((await fokus()).text, 'Rückmeldung geben');
    assert.ok(await grund.isVisible(), 'die Gründe sind noch offen');
  });

  test('Escape außerhalb des Formulars schließt das Formular nicht', async () => {
    await oeffne('#/anlage/MON1/label/MON1-11', 'Label MON1-11');
    await rueckmeldungOeffnen('bleibt');
    await page.locator('h1').first().focus();
    await page.keyboard.press('Escape');
    assert.equal(await formular().count(), 1);
  });

  test('Senden scheitert: Formular bleibt offen, Fehler wird angezeigt, Fokus steht wieder im Kommentarfeld', async () => {
    await oeffne('#/anlage/PRE3', 'Presse 3');
    await page.route('**/api/feedback', (r: any) => r.abort());
    await rueckmeldungOeffnen('geht nicht');
    await page.getByRole('button', { name: 'Rückmeldung senden' }).press('Enter');
    await formular().locator('[role="alert"]').waitFor();
    await warteBis(async () => (await fokus()).tag === 'TEXTAREA', 'Fokus im Kommentarfeld');
    assert.equal(await formular().locator('textarea').inputValue(), 'geht nicht');
  });

  test('Escape während des Sendens schließt nicht; ein Fehler danach ist zu sehen', async () => {
    await oeffne('#/anlage/PRE3', 'Presse 3');
    let freigeben: () => void = () => {};
    const gehalten = new Promise<void>((r) => (freigeben = r));
    await page.route('**/api/feedback', async (r: any) => {
      await gehalten;
      await r.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ fehler: 'Interner Fehler' }) });
    });
    await rueckmeldungOeffnen('langsam');
    await page.getByRole('button', { name: 'Rückmeldung senden' }).press('Enter');
    await formular().locator('textarea[disabled]').waitFor();
    await page.keyboard.press('Escape');
    assert.equal(await formular().count(), 1, 'Formular bleibt während des Sendens offen');
    freigeben();
    await formular().locator('[role="alert"]').waitFor();
  });

  test('Seitenwechsel bei offenem Formular: die Vorauswahl folgt der Seite, der Kommentar bleibt', async () => {
    await oeffne('#/anlage/PRE3', 'Presse 3');
    await rueckmeldungOeffnen('angefangen');
    assert.equal(await formular().locator('select').inputValue(), 'presse3');
    await page.evaluate(() => { window.location.hash = '#/anlage/LAC2'; });
    await page.getByRole('heading', { name: 'Lackierung 2', level: 1 }).waitFor();
    assert.equal(await formular().locator('select').inputValue(), 'lackierung2');
    assert.equal(await formular().locator('textarea').inputValue(), 'angefangen');
  });

  test('Auf der Seite „Rückmeldungen“ erscheint eine dort gesendete Rückmeldung sofort in der Liste', async () => {
    await oeffne('#/rueckmeldungen', 'Rückmeldungen');
    await rueckmeldungOeffnen('Neu auf der Listenseite.');
    await page.getByRole('button', { name: 'Rückmeldung senden' }).click();
    await page.locator('main li', { hasText: 'Neu auf der Listenseite.' }).waitFor();
  });

  test('Löschen gelingt, Neuladen scheitert: die alte Liste verschwindet trotzdem', async () => {
    await oeffne('#/rueckmeldungen', 'Rückmeldungen');
    await rueckmeldungOeffnen('Wird gleich gelöscht.');
    await page.getByRole('button', { name: 'Rückmeldung senden' }).click();
    await page.locator('main li').first().waitFor();
    await page.route('**/api/feedback', (r: any) => (r.request().method() === 'GET' ? r.abort() : r.continue()));
    await page.getByRole('button', { name: 'Alle Rückmeldungen löschen' }).click();
    await page.getByRole('button', { name: 'Ja, alle löschen' }).click();
    await page.getByText(/sind gelöscht\.|ist gelöscht\./).waitFor();
    assert.equal(await page.locator('main li').count(), 0);
    await page.getByText('Es gibt keine Rückmeldungen.').waitFor();
  });

  test('keine Fehler auf der Seite', () => {
    assert.deepEqual(konsole, []);
  });
});
