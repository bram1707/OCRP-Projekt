// Maries Übersicht im echten Browser (Stufe 3, AK-41 bis AK-46): Laden, Signal, Fokus und Ansage in
// MarieSeite, die `npm test` nur statisch prüft. Bedient wird nur mit der Tastatur; Max' Änderungen
// kommen „aus einem zweiten Fenster“ direkt über die Schnittstelle.
// Läuft NICHT mit `npm test` (Dateiname endet nicht auf .test.ts), weil Playwright kein Paket des
// Projekts ist (AK-60). Aufruf nach `npm run build`:
//   node --disable-warning=ExperimentalWarning --test tests/browser/marie.browser.ts
// Optional: PLAYWRIGHT_PFAD (Standard: globales Playwright), BILDER_AUSGABE=<ordner> für Screenshots.

import assert from 'node:assert/strict';
import { existsSync, mkdirSync } from 'node:fs';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { erstelleServer } from '../../src/server/app.ts';
import { BILDER, neueDatenbank, WURZEL } from '../hilfen.ts';

const PW: string = process.env.PLAYWRIGHT_PFAD ?? '/opt/node22/lib/node_modules/playwright/index.mjs';
const AUSGABE = process.env.BILDER_AUSGABE ?? null;
const DIST = join(WURZEL, 'dist');

let server: Server;
let port = 0;
let url = '';
let browser: any;
let page: any;
const konsole: string[] = [];
const anfragen: { methode: string; pfad: string; rolle: string | null; seite: string }[] = [];

/** Startet den Server mit frischen Testdaten, beim Neustart auf demselben Port. */
async function starte(): Promise<void> {
  server = erstelleServer({ db: await neueDatenbank(), bilderOrdner: BILDER, oberflaecheOrdner: DIST });
  await new Promise<void>((r) => server.listen(port, '127.0.0.1', r));
  port = (server.address() as AddressInfo).port;
  url = `http://127.0.0.1:${port}`;
}
const stoppe = () => new Promise<void>((r) => server.close(() => r()));

async function bild(name: string, ganz = true): Promise<void> {
  if (!AUSGABE) return;
  mkdirSync(AUSGABE, { recursive: true });
  await page.screenshot({ path: join(AUSGABE, `${name}.png`), fullPage: ganz });
}
const fokus = (): Promise<{ tag: string; text: string }> =>
  page.evaluate(() => {
    const e = document.activeElement;
    return { tag: e?.tagName ?? '', text: (e?.textContent ?? '').replace(/\s+/g, ' ').trim() };
  });
async function tabZu(text: string): Promise<void> {
  for (let i = 0; i < 200; i++) {
    await page.keyboard.press('Tab');
    if ((await fokus()).text.includes(text)) return;
  }
  throw new Error(`Fokus nicht gefunden: ${text}`);
}
const zahl = async (z: string): Promise<string> => (await page.locator(`[data-zahl="${z}"] a span`).nth(1).innerText()).trim();
const zahlen = async (): Promise<string> => `${await zahl('gesamt')}/${await zahl('offen')}/${await zahl('erledigt')}/${await zahl('fehlerhaft')}`;
const ansage = (): Promise<string> => page.locator('[role="status"]').innerText();
const reihenfolge = (): Promise<string[]> => page.locator('[data-marie-anlage]').evaluateAll((l: Element[]) => l.map((e) => e.getAttribute('data-marie-anlage')));
async function vonMax(pfad: string, koerper?: unknown): Promise<void> {
  const res = await fetch(url + pfad, {
    method: 'POST',
    headers: { 'X-Rolle': 'max', ...(koerper ? { 'Content-Type': 'application/json' } : {}) },
    body: koerper ? JSON.stringify(koerper) : undefined,
  });
  assert.ok(res.ok, `${pfad}: ${res.status}`);
}
/** Wartet, bis oben diese Zahlen stehen (gesamt/offen/erledigt/fehlerhaft); ohne Neuladen der Seite. */
async function warteAufZahlen(soll: string, ms = 5000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < ms) {
    if ((await zahlen().catch(() => '')) === soll) return;
    await page.waitForTimeout(50);
  }
  assert.fail(`erwartet ${soll}, angezeigt ${await zahlen()}`);
}
const breite = (): Promise<number> => page.evaluate(() => document.documentElement.scrollWidth);

before(async () => {
  assert.ok(existsSync(join(DIST, 'index.html')), 'Vorher `npm run build` ausführen (dist/ fehlt).');
  await starte();
  const { chromium } = await import(PW).catch((e: unknown) => {
    throw new Error(`Playwright nicht gefunden unter ${PW}. Den Pfad mit PLAYWRIGHT_PFAD angeben; Playwright ist kein Paket des Projekts.`, { cause: e });
  });
  browser = await chromium.launch();
  page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on('console', (m: any) => konsole.push(`${m.type()}: ${m.text()}`));
  page.on('pageerror', (e: Error) => konsole.push(`pageerror: ${e.message}`));
  page.on('request', (r: any) =>
    anfragen.push({ methode: r.method(), pfad: new URL(r.url()).pathname, rolle: r.headers()['x-rolle'] ?? null, seite: page.url() }),
  );
});

after(async () => {
  await browser?.close();
  await stoppe();
});

describe('Maries Übersicht im Browser', () => {
  test('Max\' Seiten öffnen keine Verbindung für das Signal; Fenstertitel je Rolle', async () => {
    await page.goto(`${url}/#/anlage/STA4`);
    await page.locator('[data-kachel]').first().waitFor();
    await page.waitForTimeout(300);
    assert.ok(!anfragen.some((a) => a.pfad === '/api/ereignisse'));
    assert.equal(await page.title(), 'Label-Prüfung · Max');
  });

  test('über den Fuß zu Marie: Fokus auf der Frage, vier Zahlen, Anlagen dringendste oben, kein Knopf', async () => {
    await tabZu('Übersicht für Marie');
    const ab = anfragen.length;
    await page.keyboard.press('Enter');
    await page.locator('[data-aktualisiert]').waitFor();
    await page.waitForTimeout(500);
    // Die erste Nachricht des Signals lädt; ein eigenes Laden davor wäre doppelt (R15).
    assert.equal(anfragen.slice(ab).filter((a) => a.pfad === '/api/marie').length, 1, 'die Übersicht wird beim Öffnen genau einmal geladen');
    assert.ok(page.url().endsWith('#/marie'));
    assert.equal((await fokus()).tag, 'H1');
    assert.equal(await page.title(), 'Übersicht · Marie (nur ansehen)');
    assert.equal(await zahlen(), '20/9/7/4');
    assert.equal(await page.locator('[data-antwort]').innerText(), 'Nein. 13 von 20 Labels sind noch nicht erledigt.');
    assert.deepEqual(await reihenfolge(), ['SWR5', 'STA4', 'FOE2']);
    assert.equal(await page.locator('main button').count(), 0);
    await bild('m1-start');
  });

  test('AK-42: „Fehlerhaft“ mit Enter, Fokus auf der Liste, „Warum?“ mit Enter', async () => {
    await tabZu('Fehlerhaft');
    await page.keyboard.press('Enter');
    await page.locator('#auswahl-titel').waitFor();
    await page.waitForTimeout(200);
    assert.ok(page.url().endsWith('#/marie/zahl/fehlerhaft'));
    assert.equal((await fokus()).text, 'Fehlerhaft: 4 Labels');
    assert.deepEqual(
      await page.locator('[data-marie-label]').evaluateAll((l: Element[]) => l.map((e) => e.getAttribute('data-marie-label'))),
      ['SWR5-05', 'SWR5-02', 'STA4-08', 'STA4-09'],
    );
    assert.ok(await page.locator('[data-marie-label="SWR5-02"] img').evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0));
    await tabZu('Warum? (Label STA4-09)');
    await page.keyboard.press('Enter');
    assert.ok(await page.locator('[data-warum-label="STA4-09"]').evaluate((d: HTMLDetailsElement) => d.open));
    await bild('m2-fehlerhaft-warum');
  });

  test('AK-44: Max bestätigt, Zahlen springen ohne Neuladen; Fokus und offenes „Warum?“ bleiben; Ansage', async () => {
    const navigationen: string[] = [];
    const merke = (f: any) => f === page.mainFrame() && navigationen.push(f.url());
    page.on('framenavigated', merke);
    await vonMax('/api/labels/STA4-01/bestaetigen');
    await warteAufZahlen('20/8/8/4');
    page.off('framenavigated', merke);
    assert.deepEqual(navigationen, []);
    assert.ok((await fokus()).text.startsWith('Warum? (Label STA4-09)'), (await fokus()).text);
    assert.ok(await page.locator('[data-warum-label="STA4-09"]').evaluate((d: HTMLDetailsElement) => d.open));
    assert.equal(await ansage(), 'Neuer Stand: 20 gesamt, 8 offen, 8 erledigt, 4 fehlerhaft.');
    assert.match(await page.locator('[data-aktualisiert]').innerText(), /^Aktualisiert um \d\d:\d\d:\d\d\./);
  });

  test('AK-44: Melden ändert den Status in der Liste; verlässt das fokussierte Label die Liste, Fokus auf ihre Überschrift', async () => {
    await vonMax('/api/labels/STA4-09/fehler', { grund: 'unleserlich' });
    await page.locator('[data-marie-label="STA4-09"] [data-marke]:has-text("Fehlerhaft")').waitFor({ timeout: 5000 });
    await tabZu('Warum? (Label SWR5-02)');
    await vonMax('/api/labels/SWR5-02/nachbessern');
    await warteAufZahlen('20/9/8/3');
    await page.waitForTimeout(200);
    assert.equal((await fokus()).text, 'Fehlerhaft: 3 Labels');
    await bild('m3-nach-aenderungen');
  });

  test('AK-41: rückt die fokussierte Anlagenkarte nach unten, bleibt der Fokus auf ihr; Enter wählt sie', async () => {
    await tabZu('Schweißroboter 5');
    const vorher = (await fokus()).text;
    await vonMax('/api/labels/SWR5-05/nacherfassen');
    await page.waitForFunction(() => document.querySelector('[data-marie-anlage]')?.getAttribute('data-marie-anlage') !== 'SWR5', null, { timeout: 5000 });
    await page.waitForTimeout(200);
    assert.deepEqual(await reihenfolge(), ['STA4', 'SWR5', 'FOE2']);
    assert.equal((await fokus()).text, vorher);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);
    assert.ok(page.url().endsWith('#/marie/anlage/SWR5'));
    assert.ok((await fokus()).text.startsWith('Schweißroboter 5: 5 Labels'), (await fokus()).text);
    await bild('m4-anlage-swr5');
    await tabZu('Liste schließen');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(200);
    assert.ok(page.url().endsWith('#/marie'));
    assert.equal((await fokus()).tag, 'H1');
  });

  test('neben „Warum ist … gesperrt?“ öffnet ein Klick die Karte', async () => {
    const summary = page.locator('[data-warum-anlage="STA4"] summary');
    const kasten = await summary.boundingBox();
    await page.mouse.click(kasten.x + kasten.width + 40, kasten.y + kasten.height / 2);
    await page.waitForTimeout(200);
    assert.ok(page.url().endsWith('#/marie/anlage/STA4'), page.url());
    await page.goto(`${url}/#/marie`);
    await page.locator('[data-aktualisiert]').waitFor();
  });

  test('AK-44: Server weg: Hinweis mit Ansage, alte Zahlen bleiben; Server zurück: Seite holt den Stand selbst', async () => {
    await stoppe();
    await page.locator('[data-aktualisiert][role="alert"]:has-text("Gerade keine Verbindung")').waitFor({ timeout: 10000 });
    assert.equal(await zahlen(), '20/10/8/2');
    await bild('m5-getrennt', false);
    await starte();
    await warteAufZahlen('20/9/7/4', 15000);
    await page.locator('[data-aktualisiert]:has-text("aktualisiert sich von selbst")').waitFor({ timeout: 5000 });
  });

  test('eine späte Antwort nach dem Verlassen der Seite wird nicht mehr angesagt', async () => {
    await page.route('**/api/marie', async (r: any) => {
      await new Promise((w) => setTimeout(w, 1500));
      await r.continue().catch(() => undefined);
    });
    await vonMax('/api/labels/STA4-02/bestaetigen');
    await page.waitForTimeout(200);
    await page.evaluate(() => {
      window.location.hash = '#/';
    });
    await page.waitForTimeout(2500);
    await page.unroute('**/api/marie');
    assert.doesNotMatch(await ansage(), /Neuer Stand/);
  });

  test('fehlerhafte Adresse unter #/marie: Maries Rahmen, Weg zurück zur Übersicht', async () => {
    await page.goto(`${url}/#/marie/anlage/sta4`);
    await page.getByText('Diese Seite gibt es nicht.').waitFor();
    assert.equal(await page.title(), 'Übersicht · Marie (nur ansehen)');
    const ziele = await page.locator('a').evaluateAll((l: HTMLAnchorElement[]) => l.map((a) => a.getAttribute('href')));
    assert.deepEqual(ziele, ['#/marie', '#/marie', '#/']);
    assert.equal(await page.getByText('Zur Übersicht').getAttribute('href'), '#/marie');
  });

  test('kommt die Verbindung für das Signal nicht zustande, lädt die Seite trotzdem und sagt es; später verbindet sie sich selbst', async () => {
    const ab = konsole.length;
    await page.route('**/api/ereignisse', (r: any) =>
      r.fulfill({ status: 503, contentType: 'application/json', body: '{"fehler":"Zu viele offene Verbindungen."}' }),
    );
    await page.goto(`${url}/#/marie`);
    await page.locator('[data-aktualisiert][role="alert"]').waitFor({ timeout: 5000 });
    assert.equal(await zahlen(), '20/8/8/4');
    await page.unroute('**/api/ereignisse');
    // Nach 5 s öffnet die Seite die Verbindung selbst neu; danach kommen Änderungen wieder an.
    await page.locator('[data-aktualisiert]:has-text("aktualisiert sich von selbst")').waitFor({ timeout: 10000 });
    await vonMax('/api/labels/STA4-03/bestaetigen');
    await warteAufZahlen('20/7/9/4');
    // Die gewollte Ablehnung meldet der Browser in der Konsole; sie zählt im letzten Test nicht als Fehler.
    const rest = konsole.slice(ab).filter((z) => !/503/.test(z));
    konsole.splice(ab, konsole.length - ab, ...rest);
  });

  test('schmale Bildschirme: kein seitliches Scrollen, auch mit offenem „Warum?“', async () => {
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto(`${url}/#/marie`);
    await page.locator('[data-aktualisiert]').waitFor();
    assert.ok((await breite()) <= 320, `Breite ${await breite()} bei 320 px`);
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto(`${url}/#/marie/anlage/STA4`);
    await page.locator('[data-warum-label="STA4-03"] summary').click();
    assert.ok((await breite()) <= 375, `Breite ${await breite()} bei 375 px mit offenem „Warum?“ von STA4-03`);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${url}/#/marie/zahl/fehlerhaft`);
    await page.locator('[data-marie-label]').first().waitFor();
    assert.ok((await breite()) <= 390, `Breite ${await breite()} bei 390 px`);
    await bild('m6-telefon');
    await page.setViewportSize({ width: 1280, height: 900 });
  });

  test('AK-46: Maries Seiten schicken nur GET ohne Rolle; keine Fehler in der Konsole', () => {
    const vonMarie = anfragen.filter((a) => a.seite.includes('#/marie') && (a.pfad.startsWith('/api/') || a.pfad.startsWith('/bilder/')));
    assert.ok(vonMarie.length > 0);
    for (const a of vonMarie) {
      assert.equal(a.methode, 'GET', a.pfad);
      assert.equal(a.rolle, null, a.pfad);
    }
    // Während der gewollten Unterbrechung meldet der Browser abgelehnte Verbindungen; sonst nichts.
    const fehler = konsole.filter((z) => (z.startsWith('error') || z.startsWith('warning') || z.startsWith('pageerror')) && !/ERR_CONNECTION_REFUSED|net::ERR/.test(z));
    assert.deepEqual(fehler, []);
  });
});
