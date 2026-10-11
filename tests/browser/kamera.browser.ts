// Eigenes Foto im echten Browser mit der echten Texterkennung (tesseract.js, ohne Internet):
// Kamera lädt hoch, Max sieht Foto und gelesenen Text, meldet einen Fehler, Kamera lädt neu hoch, Max bestätigt.
// Läuft NICHT mit `npm test` (Playwright ist kein Paket des Projekts, AK-60). Aufruf nach `npm run build`:
//   node --disable-warning=ExperimentalWarning --test tests/browser/kamera.browser.ts
// Mit BILDER_AUSGABE=<ordner> speichert der Test Bildschirmfotos.

import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { erstelleTesseractLeser, type TesseractLeser } from '../../src/ocr/tesseract.ts';
import { erstelleServer } from '../../src/server/app.ts';
import { DEMO, DEMO_BILDER, neueDemoDatenbank, WURZEL } from '../hilfen.ts';

const PW: string = process.env.PLAYWRIGHT_PFAD ?? '/opt/node22/lib/node_modules/playwright/index.mjs';
const DIST = join(WURZEL, 'dist');
const FOTO = join(WURZEL, 'tests', 'bilder', 'label-de-pl.png');
const AUSGABE = process.env.BILDER_AUSGABE;

let server: Server;
let url = '';
let browser: any;
let page: any;
let leser: TesseractLeser;
const ordner = mkdtempSync(join(tmpdir(), 'kamera-browser-'));
const fehler: string[] = [];
const foto = async (name: string) => { if (AUSGABE) await page.screenshot({ path: join(AUSGABE, `${name}.png`), fullPage: true }); };

before(async () => {
  assert.ok(existsSync(join(DIST, 'index.html')), 'Vorher `npm run build` ausführen (dist/ fehlt).');
  leser = erstelleTesseractLeser({ sprachOrdner: join(ordner, 'sprachen') });
  server = erstelleServer({
    db: await neueDemoDatenbank(), bilderOrdner: DEMO_BILDER, datenOrdner: DEMO, oberflaecheOrdner: DIST,
    uploadOrdner: mkdtempSync(join(ordner, 'uploads-')), textLeser: leser,
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const { chromium } = await import(PW);
  browser = await chromium.launch();
  page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  page.on('pageerror', (e: Error) => fehler.push(e.message));
});
after(async () => {
  await browser?.close();
  await leser?.beende();
  await new Promise<void>((r) => server?.close(() => r()));
  rmSync(ordner, { recursive: true, force: true });
});

describe('Eigenes Foto: Kamera → Max → Kamera → Max', () => {
  test('Rollenwahl → Kamera; Foto hochladen; gelesener Text und Sprachvorschlag erscheinen', async () => {
    await page.goto(`${url}/#/`);
    await page.getByRole('link', { name: /Kamera · Eigenes Foto hochladen/ }).click();
    await page.getByRole('heading', { name: 'Eigenes Foto hochladen', level: 1 }).waitFor();
    assert.match(await page.locator('main').innerText(), /Bitte nur Labels fotografieren, keine Personen\./);
    assert.equal(await page.locator('[aria-pressed="true"]').innerText(), 'Label 1: vorne an der Anlage');
    await page.setInputFiles('#foto-datei', FOTO);
    await page.getByRole('button', { name: 'Foto hochladen und lesen lassen' }).click();
    const ergebnis = page.locator('[data-ergebnis="EIG1-01"]');
    await ergebnis.waitFor({ timeout: 60_000 });
    const t = await ergebnis.innerText();
    assert.match(t, /ACHTUNG/);
    assert.match(t, /UWAGA/);
    assert.match(t, /Sprachvorschlag: Deutsch/);
    // Nach dem Lesen ist der nächste leere Platz gewählt.
    assert.equal(await page.locator('[aria-pressed="true"]').innerText(), 'Label 2: links an der Anlage');
    await foto('kamera-01-gelesen');
  });

  test('Max sieht das hochgeladene Foto und den Text und meldet „Unleserlich“', async () => {
    await page.goto(`${url}/#/anlage/EIG1/label/EIG1-01`);
    const bild = page.locator('img[alt="Foto von Label EIG1-01"]');
    await bild.waitFor();
    await page.waitForFunction(() => (document.querySelector('img[alt="Foto von Label EIG1-01"]') as HTMLImageElement | null)?.naturalWidth! > 0);
    assert.match(await page.locator('main').innerText(), /ACHTUNG/);
    await foto('kamera-02-max');
    await page.getByRole('button', { name: 'Nein, Fehler melden' }).click();
    await page.getByRole('button', { name: 'Unleserlich' }).click();
    await page.waitForFunction(() => !location.hash.endsWith('EIG1-01') || document.body.innerText.includes('gemeldet'));
  });

  test('Kamera: Platz EIG1-01 zeigt die Meldung; neues Foto bringt es als „Nachgebessert“ zurück, Max bestätigt', async () => {
    await page.goto('about:blank');
    await page.goto(`${url}/#/kamera`);
    const platz = page.locator('[data-platz="EIG1-01"]');
    await platz.waitFor();
    assert.match(await platz.innerText(), /Max hat einen Fehler gemeldet \(Unleserlich\)/);
    assert.equal(await page.locator('[aria-pressed="true"]').innerText(), 'Label 1: vorne an der Anlage');
    await page.locator('label:has-text("Text selbst eintippen")').click();
    await page.fill('#foto-text', 'ACHTUNG: Heiße Oberfläche. Nicht berühren!\nUWAGA: Gorąca powierzchnia. Nie dotykać!');
    await page.setInputFiles('#foto-datei', FOTO);
    await page.getByRole('button', { name: 'Foto mit Text senden' }).click();
    await page.locator('[data-ergebnis="EIG1-01"]').waitFor();
    assert.match(await page.locator('[data-ergebnis="EIG1-01"]').innerText(), /„Nachgebessert“/);
    await foto('kamera-03-nachgebessert');
    await page.goto(`${url}/#/anlage/EIG1/label/EIG1-01`);
    await page.getByRole('button', { name: 'Ja, bestätigen' }).click();
    await page.waitForFunction(() => !location.hash.endsWith('/EIG1-01'));
    assert.deepEqual(fehler, []);
  });

  test('Upload-Ordner enthält genau das aktuelle Foto (das ersetzte ist gelöscht)', () => {
    const uploads = readdirSync(ordner).find((n) => n.startsWith('uploads-'))!;
    assert.equal(readdirSync(join(ordner, uploads)).length, 1);
  });
});
