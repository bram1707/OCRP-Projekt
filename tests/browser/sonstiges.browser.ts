// „Sonstiges“ mit Pflicht-Freitext bei Max und der Schließen-Knopf oben in Maries Liste, im echten Browser.
// Läuft NICHT mit `npm test` (Playwright ist kein Paket des Projekts, AK-60). Aufruf nach `npm run build`:
//   node --disable-warning=ExperimentalWarning --test tests/browser/sonstiges.browser.ts

import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { erstelleServer } from '../../src/server/app.ts';
import { DEMO, DEMO_BILDER, neueDemoDatenbank, WURZEL } from '../hilfen.ts';

const PW: string = process.env.PLAYWRIGHT_PFAD ?? '/opt/node22/lib/node_modules/playwright/index.mjs';
const DIST = join(WURZEL, 'dist');

let server: Server;
let url = '';
let browser: any;
let page: any;
const fehler: string[] = [];

async function oeffne(adresse: string, ueberschrift: string): Promise<void> {
  await page.goto('about:blank');
  await page.goto(`${url}/${adresse}`);
  await page.getByRole('heading', { name: ueberschrift, level: 1 }).waitFor();
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
  page.on('pageerror', (e: Error) => fehler.push(e.message));
});
after(async () => {
  await browser?.close();
  await new Promise<void>((r) => server?.close(() => r()));
});

describe('„Sonstiges“ und Schließen oben', () => {
  test('Max: „Sonstiges“ öffnet ein Pflichtfeld; leer lässt es sich nicht senden', async () => {
    await oeffne('#/anlage/MON1/label/MON1-11', 'Label MON1-11');
    await page.getByRole('button', { name: 'Ja, bestätigen' }).and(page.locator(':enabled')).waitFor();
    await page.getByRole('button', { name: 'Nein, Fehler melden' }).click();
    assert.equal(await page.locator('textarea').count(), 0, 'erst nach dem Klick auf „Sonstiges“');
    await page.getByRole('button', { name: /^Sonstiges/ }).click();
    const feld = page.getByLabel('Was stimmt nicht? (Pflichtfeld)');
    await feld.waitFor();
    assert.equal(await feld.evaluate((e: Element) => e === document.activeElement), true, 'Fokus im Feld');
    const senden = page.locator('form[data-sonstiges] button[type=submit]');
    assert.equal(await senden.isDisabled(), true);
    await feld.fill('   ');
    assert.equal(await senden.isDisabled(), true, 'nur Leerzeichen zählen nicht');
    await feld.press('Enter');
    assert.ok(page.url().endsWith('#/anlage/MON1/label/MON1-11'), 'nichts gesendet');
    await feld.fill('Schild hängt hinter dem Kabelkanal');
    assert.equal(await senden.isDisabled(), false);
    await senden.click();
    await page.waitForURL((u: URL) => !u.hash.endsWith('/MON1-11'));
    const label = await (await fetch(`${url}/api/labels/MON1-11`)).json();
    assert.equal(label.status, 'fehlerhaft');
    assert.equal(label.letzterFehlergrundText, 'Sonstiges: „Schild hängt hinter dem Kabelkanal“');
  });

  test('Marie: sieht den Text und findet „Liste schließen“ oben, ohne zu scrollen', async () => {
    await oeffne('#/marie/anlage/MON1', 'Ist alles geprüft?');
    const zeile = page.locator('[data-auswahl] [data-marie-label="MON1-11"]');
    await zeile.waitFor();
    assert.match(await zeile.innerText(), /Von Max gemeldet \(Sonstiges: „Schild hängt hinter dem Kabelkanal“\)/);
    await page.locator('#auswahl-titel').scrollIntoViewIfNeeded();
    const oben = page.locator('[data-schliessen="oben"]');
    assert.ok(await oben.isVisible());
    const titel = await page.locator('#auswahl-titel').boundingBox();
    const knopf = await oben.boundingBox();
    assert.ok(Math.abs(knopf.y + knopf.height / 2 - (titel.y + titel.height / 2)) < 30, 'auf Höhe des Titels');
    await oben.click();
    await page.waitForURL((u: URL) => u.hash === '#/marie');
    await page.locator('[data-auswahl]').waitFor({ state: 'detached' });
    assert.deepEqual(fehler, []);
  });
});
