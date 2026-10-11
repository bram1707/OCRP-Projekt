// Akzeptanztests des Test-Agents für Max' Oberfläche im echten Browser (Stufe 2).
// Läuft NICHT mit `npm test` (Dateiname endet nicht auf .test.ts), weil Playwright kein Paket des
// Projekts ist (AK-60). Aufruf nach `npm run build`:
//   node --disable-warning=ExperimentalWarning --test tests/akzeptanz/browser/oberflaeche.browser.ts
// Optional: PLAYWRIGHT_PFAD (Standard: globales Playwright), BILDER=<ordner> für Screenshots.

import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
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
let page: any;
let schritt = 'start';
const schreibend: { schritt: string; methode: string; pfad: string }[] = [];
const konsole: string[] = [];
const seitenTexte: { schritt: string; text: string }[] = [];
let nr = 0;

async function bild(name: string): Promise<void> {
  if (!BILDER) return;
  mkdirSync(BILDER, { recursive: true });
  await page.screenshot({ path: join(BILDER, `${String(++nr).padStart(2, '0')}-${name}.png`), fullPage: true });
}
async function geheZu(hash: string, name: string): Promise<void> {
  schritt = name;
  await page.goto(`${url}/${hash}`);
  await page.locator('h1').first().waitFor();
  await page.waitForLoadState('networkidle');
  await merkeText(name);
}
async function merkeText(name: string): Promise<void> {
  seitenTexte.push({ schritt: name, text: await page.locator('body').innerText() });
}
const aufrufeIn = (s: string) => schreibend.filter((a) => a.schritt === s);
const api = async (pfad: string) => (await fetch(url + pfad)).json() as Promise<any>;
const kacheln = () => page.locator('[data-kachel]');
const kachelIds = async (): Promise<string[]> => kacheln().evaluateAll((els: Element[]) => els.map((e) => e.getAttribute('data-kachel')));

before(async () => {
  assert.ok(existsSync(join(DIST, 'index.html')), 'Vorher `npm run build` ausführen (dist/ fehlt).');
  const db = await basisDb();
  const s = erstelleServer({ db, bilderOrdner: join(TESTDATEN, 'bilder'), oberflaecheOrdner: DIST });
  await new Promise<void>((r) => s.listen(0, '127.0.0.1', r));
  url = `http://127.0.0.1:${(s.address() as AddressInfo).port}`;
  schliessen = () => new Promise((r) => s.close(() => r()));
  const { chromium } = await import(PW);
  browser = await chromium.launch();
  page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on('console', (m: any) => { if (m.type() === 'error' || m.type() === 'warning') konsole.push(`${m.type()}: ${m.text()}`); });
  page.on('pageerror', (e: Error) => konsole.push(`pageerror: ${e.message}`));
  page.on('request', (r: any) => {
    if (r.method() !== 'GET') schreibend.push({ schritt, methode: r.method(), pfad: r.url().replace(url, '') });
  });
});

after(async () => {
  await browser?.close();
  await schliessen();
});

describe('Startseite', () => {
  test('AK-01, AK-21: jede Anlage mit „Gesperrt“/„Freigegeben“ wie der Server, Fortschritt, Hinweis Testversion', async () => {
    // Angepasst nach Stufe 4 (B5): #/ ist die Rollenwahl, Max' Anlagen stehen unter #/anlagen.
    await geheZu('#/anlagen', 'start');
    await bild('startseite');
    const text = await page.locator('body').innerText();
    assert.match(text, /Testversion: Spracherkennung simuliert\. Texterkennung echt nur bei eigenen Fotos/);
    for (const a of await api('/api/anlagen')) {
      const zeile = page.locator('li, article, a', { hasText: a.name }).last();
      const t = await zeile.innerText();
      assert.match(t, a.gesperrt ? /Gesperrt/ : /Freigegeben/, a.name);
      assert.ok(t.includes(`${a.bestaetigt} von ${a.sollAnzahl} bestätigt`), `${a.name}: Fortschritt in „${t}“`);
    }
    assert.equal(aufrufeIn('start').length, 0, 'AK-03: Laden schreibt nicht');
  });
});

describe('Stanzanlage 4: Übersicht', () => {
  test('AK-17: Zählzeile, Fortschrittsbalken, Kachelinhalt', async () => {
    await geheZu('#/anlage/STA4', 'sta4');
    await bild('sta4-uebersicht');
    assert.equal(await page.locator('[data-zaehlzeile]').innerText(), '10 Labels: 3 auffällig, 6 unauffällig, 1 bestätigt');
    assert.ok(await page.locator('[role=progressbar]').count() >= 1);
    assert.match(await page.locator('body').innerText(), /1 von 10 bestätigt/);
    // Optimierung 2: Das bestätigte Label steht nicht mehr als Kachel da, sondern in der Zeile „1 Label bestätigt“.
    assert.equal(await kacheln().count(), 9);
    assert.match(await page.locator('[data-bestaetigt] summary').innerText(), /1 Label bestätigt/);
    for (const id of await kachelIds()) {
      const k = page.locator(`[data-kachel="${id}"]`);
      const t = await k.innerText();
      assert.ok((await k.locator('img').count()) === 1, `${id}: Vorschaubild`);
      assert.match(t, /Offen|Unsicher|Nachgebessert|Bestätigt/, `${id}: Statuswort`);
      assert.match(t, /\d+ %|Keine Sprache erkannt/, `${id}: Sprachvorschlag`);
    }
  });

  test('AK-13: Auffällige/Unsichere zuerst, Bestätigtes zuletzt; H2: kein Fehlerhaft/Fehlt', async () => {
    const ids = await kachelIds();
    assert.deepEqual(ids.slice(0, 3).sort(), ['STA4-07', 'STA4-08', 'STA4-09']);
    assert.deepEqual(ids.slice(0, 2).sort(), ['STA4-08', 'STA4-09'], 'Unsicher vor Offen');
    assert.ok(!ids.includes('STA4-10'), 'Bestätigtes steht nicht zwischen den offenen Kacheln');
    assert.equal(await page.locator('[data-bestaetigt-zeile="STA4-10"]').count(), 1, 'sondern in der Zeile „bestätigt“');
    const text = await page.locator('main, body').first().innerText();
    assert.ok(!/\bFehlerhaft\b/.test(await kacheln().allInnerTexts().then((t: string[]) => t.join(' '))));
    assert.ok(text.length > 0);
  });

  test('AK-19: zweisprachig allein nicht auffällig; abweichende Kombination auffällig mit einem Satz', async () => {
    const t01 = await page.locator('[data-kachel="STA4-01"]').innerText();
    assert.match(t01, /Deutsch \d+ %, Polnisch \d+ %/);
    assert.ok(!t01.includes('Auffällig'), 'STA4-01 (de/pl) ist nicht auffällig');
    const t07 = await page.locator('[data-kachel="STA4-07"]').innerText();
    assert.ok(t07.includes('Auffällig'));
    assert.match(t07, /Englisch/);
    assert.match(t07, /Polnisch/);
    for (const id of ['STA4-07', 'STA4-08', 'STA4-09']) {
      const t = await page.locator(`[data-kachel="${id}"]`).innerText();
      assert.match(t, /Auffällig\n[^\n]+\.[^\n]*\n|Auffällig[\s\S]*\./, `${id}: Grund als Satz`);
    }
  });

  test('AK-14: jedes Statuswort hat eine eigene Hintergrundfarbe', async () => {
    const marken: { wort: string; farbe: string }[] = await page.evaluate(() => {
      const woerter = ['Offen', 'Unsicher', 'Nachgebessert', 'Fehlerhaft', 'Bestätigt', 'Fehlt'];
      return [...document.querySelectorAll('span, div')]
        .filter((e) => woerter.includes((e.textContent ?? '').trim()) && e.children.length === 0)
        .map((e) => ({ wort: (e.textContent ?? '').trim(), farbe: getComputedStyle(e).backgroundColor }));
    });
    const jeWort = new Map<string, Set<string>>();
    for (const m of marken) jeWort.set(m.wort, (jeWort.get(m.wort) ?? new Set()).add(m.farbe));
    // Bestätigte Labels haben keine Kachel mehr (Optimierung 2); sichtbar sind Unsicher und Offen.
    assert.ok(jeWort.size >= 2, `mindestens zwei Status sichtbar: ${[...jeWort.keys()]}`);
    for (const [w, f] of jeWort) assert.equal(f.size, 1, `${w} hat genau eine Farbe`);
    const farben = [...jeWort.values()].map((f) => [...f][0]);
    assert.equal(new Set(farben).size, farben.length, 'verschiedene Status, verschiedene Farben');
    assert.ok(farben.every((f) => f !== 'rgba(0, 0, 0, 0)'));
  });

  test('AK-18: „Nur auffällige“ zeigt 3 Kacheln und „6 Labels ausgeblendet“, „Alle“ wieder 9 (das bestätigte steht unter „bestätigt“)', async () => {
    schritt = 'filter';
    await page.getByRole('button', { name: /Nur auffällige/ }).click();
    assert.equal(await kacheln().count(), 3);
    assert.equal(await page.locator('[data-ausgeblendet]').innerText(), '6 Labels ausgeblendet');
    await bild('sta4-nur-auffaellige');
    await page.getByRole('button', { name: /^Alle/ }).click();
    assert.equal(await kacheln().count(), 9);
    assert.equal(aufrufeIn('filter').length, 0, 'AK-03: Filtern schreibt nicht');
  });

  test('AK-11: kein „Alle bestätigen“; Doppelklick auf der Kachel bestätigt genau ein Label', async () => {
    const knoepfe: string[] = await page.locator('button').allInnerTexts();
    assert.ok(!knoepfe.some((k) => /alle.*(bestätig|freigeb)/i.test(k)), knoepfe.join(' | '));
    assert.ok(!knoepfe.some((k) => /bestätigen/.test(k) && !/^STA4-\d\d bestätigen$/.test(k.trim())));
    schritt = 'kachel-doppel';
    await page.locator('[data-kachel="STA4-01"] button').dblclick();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(300);
    assert.deepEqual(aufrufeIn('kachel-doppel').map((a) => a.pfad), ['/api/labels/STA4-01/bestaetigen']);
    assert.equal((await api('/api/labels/STA4-01')).status, 'bestaetigt');
    assert.equal((await api('/api/labels/STA4-02')).status, 'offen');
    assert.equal((await kachelIds())[0], 'STA4-08', 'Kacheln bleiben an ihrem Platz');
    assert.equal(await page.locator('[data-bestaetigt-zeile="STA4-01"]').count(), 1, 'STA4-01 steht jetzt unter „bestätigt“');
  });
});

describe('Einzelansicht', () => {
  test('AK-13: „Prüfung starten“ öffnet das relevanteste Label', async () => {
    const erstes = (await api('/api/anlagen/STA4/labels')).labels[0].id;
    schritt = 'starten';
    await page.getByRole('button', { name: 'Prüfung starten' }).click();
    await page.waitForURL(new RegExp(`#/anlage/STA4/label/${erstes}$`));
    assert.equal(aufrufeIn('starten').length, 0);
  });

  test('AK-15, AK-16, AK-33: STA4-09 mit Foto, ganzem Text, allen Sprachen in Prozent, unsicher markiert', async () => {
    await geheZu('#/anlage/STA4/label/STA4-09', 'sta4-09');
    await page.locator('img[alt="Foto von Label STA4-09"]').waitFor();
    const l = await api('/api/labels/STA4-09');
    const text = await page.locator('body').innerText();
    // Der ganze Text, ohne die Sprachkürzel an den Markierungen (aria-hidden) und ohne die Zusätze für Bildschirmleser.
    const angezeigt: string = await page.locator('[data-text]').first().evaluate((e: Element) => {
      const k = e.cloneNode(true) as Element;
      k.querySelectorAll('[aria-hidden=true], .sr-only').forEach((x) => x.remove());
      return k.textContent ?? '';
    });
    assert.equal(angezeigt, l.ocrText, 'ganzer OCR-Text');
    assert.match(text, /Deutsch 95 % – sicher erkannt/);
    assert.match(text, /Russisch 50 % – nicht sicher/);
    assert.match(text, /Polnisch 87 % – nicht sicher/);
    assert.ok(!/Polnisch 8\d % – sicher/.test(text), 'unter 90 % nie „sicher“');
    assert.match(text, /Sprache nicht sicher erkannt/);
    assert.ok(await page.locator('[data-text] mark').count() > 0, 'unsichere Stellen im Text markiert');
    const sprachenMarkiert: string[] = await page.locator('[data-text] mark').evaluateAll((m: Element[]) => [...new Set(m.map((e) => e.getAttribute('data-sprache')))]);
    assert.ok(sprachenMarkiert.every((s) => s === 'ru' || s === 'pl'), `nur unsichere Sprachen markiert: ${sprachenMarkiert}`);
    assert.match(text, /nur ein Vorschlag/);
    await bild('sta4-09-einzelansicht');
  });

  test('AK-20: „Warum?“ zeigt Wort- und Zeichenbelege, markiert, einzelner Buchstabe reicht nicht', async () => {
    schritt = 'warum';
    await page.getByRole('button', { name: 'Warum?' }).click();
    const bereich = page.locator('#warum-bereich');
    await bereich.locator('mark').first().waitFor();
    const arten: string[] = await bereich.locator('mark').evaluateAll((m: Element[]) => m.map((e) => `${e.getAttribute('data-sprache')}:${e.getAttribute('data-art')}`));
    assert.ok(arten.some((a) => a === 'de:wort'), `deutsches Wort: ${arten}`);
    assert.ok(arten.some((a) => a.endsWith(':zeichen')), `Zeichenbeleg: ${arten}`);
    assert.match(await bereich.innerText(), /Ein einzelner\s+Buchstabe allein reicht nie/);
    assert.equal(aufrufeIn('warum').length, 0);
    await bild('sta4-09-warum');
  });

  test('AK-10: „Fehler melden“ bietet genau drei Gründe und kein Eingabefeld', async () => {
    await geheZu('#/anlage/STA4/label/STA4-08', 'sta4-08');
    await page.getByRole('button', { name: 'Ja, bestätigen' }).and(page.locator(':enabled')).waitFor();
    schritt = 'melden-oeffnen';
    await page.getByRole('button', { name: 'Nein, Fehler melden' }).click();
    const gruende = page.locator('[role=group][aria-labelledby="gruende-titel"] button');
    const texte: string[] = await gruende.allInnerTexts();
    assert.deepEqual(texte.filter((t) => t !== 'Abbrechen').map((t) => t.split('\n')[0]), ['Unleserlich', 'Sprache falsch', 'Label beschädigt']);
    assert.equal(await page.locator('input, textarea, select, [contenteditable=true]').count(), 0);
    assert.equal(aufrufeIn('melden-oeffnen').length, 0);
    await bild('sta4-08-gruende');
    schritt = 'melden';
    await page.getByRole('button', { name: /^Unleserlich/ }).click();
    await page.waitForURL(/label\/(?!STA4-08)/);
    assert.deepEqual(aufrufeIn('melden').map((a) => a.pfad), ['/api/labels/STA4-08/fehler']);
    assert.equal((await api('/api/labels/STA4-08')).status, 'fehlerhaft');
  });

  test('H2, AK-12: gemeldetes Label nicht mehr in Max\' Kacheln, Grund unter „Warum noch gesperrt?“', async () => {
    await geheZu('#/anlage/STA4', 'sta4-nach-melden');
    assert.ok(!(await kachelIds()).includes('STA4-08'));
    await page.locator('[data-warum-gesperrt] summary').click();
    assert.match(await page.locator('[data-warum-gesperrt]').innerText(), /STA4-08 wartet auf Nachbesserung \(von Ihnen gemeldet: [^)]+\)/);
    assert.match(await page.locator('[data-zaehlzeile]').innerText(), /1 wartet auf Nachbesserung/);
  });

  test('AK-01, AK-02: alles Prüfbare bestätigt, STA4-08 fehlt noch → bleibt gesperrt, kein Freigabeknopf', async () => {
    for (let i = 0; i < 12; i++) {
      const offen = (await api('/api/anlagen/STA4/labels')).labels.filter((l: any) => ['offen', 'unsicher', 'nachgebessert'].includes(l.status));
      if (offen.length === 0) break;
      await geheZu(`#/anlage/STA4/label/${offen[0].id}`, `einzel-${offen[0].id}`);
      schritt = `bestaetigen-${offen[0].id}`;
      const knopf = page.getByRole('button', { name: 'Ja, bestätigen' });
      await knopf.and(page.locator(':enabled')).waitFor();
      await knopf.click();
      await page.waitForURL((u: URL) => !u.hash.endsWith(offen[0].id));
      assert.deepEqual(aufrufeIn(schritt).map((a) => a.pfad), [`/api/labels/${offen[0].id}/bestaetigen`]);
    }
    await geheZu('#/anlage/STA4', 'sta4-gesperrt');
    await bild('sta4-bleibt-gesperrt');
    assert.match(await page.locator('[data-bleibt-gesperrt]').innerText(), /STA4-08/);
    assert.equal(await page.getByRole('button', { name: 'Anlage freigeben' }).count(), 0);
    assert.match(await page.locator('h1 + *').first().innerText(), /Gesperrt/);
    assert.equal((await api('/api/anlagen')).find((a: any) => a.id === 'STA4').gesperrt, true);
  });

  test('AK-12: Nachbesserung auf der Simulationsseite → „Nachgebessert“ vorn, Meldung sichtbar, zählt als offen', async () => {
    await geheZu('#/simulation', 'simulation');
    schritt = 'nachbessern';
    await page.locator('li, tr, div', { hasText: 'STA4-08' }).getByRole('button', { name: 'Nachbesserung simulieren' }).last().click();
    await page.waitForLoadState('networkidle');
    assert.deepEqual(aufrufeIn('nachbessern').map((a) => a.pfad), ['/api/labels/STA4-08/nachbessern']);
    await geheZu('#/anlage/STA4', 'sta4-nachgebessert');
    assert.equal((await kachelIds())[0], 'STA4-08');
    assert.match(await page.locator('[data-kachel="STA4-08"]').innerText(), /Nachgebessert/);
    assert.match(await page.locator('body').innerText(), /9 von 10 bestätigt/);
    await geheZu('#/anlage/STA4/label/STA4-08', 'sta4-08-nachgebessert');
    assert.match(await page.locator('body').innerText(), /Von Ihnen gemeldet: Unleserlich/);
    await bild('sta4-08-nachgebessert');
  });

  test('AK-02: nach dem letzten Bestätigen Zusammenfassung, Freigabe erst nach Klick und Rückfrage', async () => {
    schritt = 'bestaetigen-STA4-08';
    const knopf = page.getByRole('button', { name: 'Ja, bestätigen' });
    await knopf.and(page.locator(':enabled')).waitFor();
    await knopf.click();
    await page.waitForURL(/#\/anlage\/STA4$/);
    await page.getByRole('heading', { name: /Zusammenfassung/ }).waitFor();
    await merkeText('zusammenfassung');
    const zf = await page.locator('section[aria-labelledby="zusammenfassung-titel"]').innerText();
    assert.match(zf, /Labels\s+10 von 10/);
    assert.match(zf, /Sicher erkannte Sprachen\s+.*Deutsch/);
    assert.match(zf, /Davon auffällig gewesen\s+\d+/);
    assert.match(zf, /Nachgebessert\s+1/);
    assert.match(zf, /Keine offenen Punkte/);
    assert.equal((await api('/api/anlagen')).find((a: any) => a.id === 'STA4').gesperrt, true, 'nicht automatisch freigegeben');
    await bild('sta4-zusammenfassung');
    schritt = 'freigeben-klick';
    await page.getByRole('button', { name: 'Anlage freigeben' }).click();
    assert.equal(aufrufeIn('freigeben-klick').length, 0, 'erst die Rückfrage, noch kein Aufruf');
    await page.getByRole('button', { name: 'Abbrechen' }).click();
    assert.equal((await api('/api/anlagen')).find((a: any) => a.id === 'STA4').gesperrt, true);
    await page.getByRole('button', { name: 'Anlage freigeben' }).click();
    schritt = 'freigeben';
    await page.getByRole('button', { name: 'Ja, freigeben' }).click();
    await page.locator('h1 + *', { hasText: 'Freigegeben' }).waitFor();
    assert.deepEqual(aufrufeIn('freigeben').map((a) => a.pfad), ['/api/anlagen/STA4/freigeben']);
    assert.equal((await api('/api/anlagen')).find((a: any) => a.id === 'STA4').gesperrt, false);
    await bild('sta4-freigegeben');
  });
});

describe('Schweißroboter 5 und Querschnitt', () => {
  test('AK-45: Label ohne Foto hält die Anlage gesperrt, Grund sichtbar', async () => {
    await geheZu('#/anlage/SWR5', 'swr5');
    await page.locator('[data-warum-gesperrt] summary').click();
    assert.match(await page.locator('[data-warum-gesperrt]').innerText(), /SWR5-05: kein Foto vorhanden/);
    assert.match(await page.locator('[data-zaehlzeile]').innerText(), /1 ohne Foto/);
    assert.equal(await page.getByRole('button', { name: 'Anlage freigeben' }).count(), 0);
    await bild('swr5');
  });

  test('AK-21: Knöpfe mindestens 44 px hoch, Fortschritt sichtbar, keine Fachwörter', async () => {
    const hoehen: { t: string; h: number }[] = await page.locator('button:visible').evaluateAll((b: HTMLElement[]) => b.map((e) => ({ t: e.innerText, h: e.getBoundingClientRect().height })));
    for (const k of hoehen) assert.ok(k.h >= 44, `${k.t}: ${k.h}px`);
    for (const s of seitenTexte) {
      assert.ok(!/\b(OCR|Konfidenz|API|LLM|Status-Code|Endpoint|JSON|null|undefined)\b/.test(s.text), `${s.schritt}: Fachwort`);
    }
  });

  test('AK-61, AK-33: keine Erwartungswerte und keine Soll-Sprache in einer der besuchten Seiten', async () => {
    const erwartung = JSON.parse(readFileSync(join(TESTDATEN, 'erwartung.json'), 'utf8'));
    const notizen = Object.values(erwartung).flatMap((e: any) => (e && typeof e === 'object' && e.notiz ? [e.notiz] : []));
    assert.ok(notizen.length > 0);
    for (const s of seitenTexte) {
      for (const n of notizen) assert.ok(!s.text.includes(n), `${s.schritt}: Notiz „${n}“`);
      assert.ok(!/erwart|Soll-Sprache|gefordert/i.test(s.text), `${s.schritt}: Erwartungs- oder Soll-Wort`);
    }
  });

  test('AK-03: geschrieben wurde nur bei Max\' eigenen Klicks; keine Konsolenfehler', async () => {
    const erlaubt = /^(kachel-doppel|melden|bestaetigen-.*|nachbessern|freigeben)$/;
    const fremd = schreibend.filter((a) => !erlaubt.test(a.schritt));
    assert.deepEqual(fremd, []);
    assert.deepEqual(konsole, []);
  });
});
