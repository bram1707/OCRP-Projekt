// Oberfläche, Sicherheit und Bau (AK-14, AK-61): Server-Texte erscheinen nur als Text, kein
// gefährlicher Code, schreibende Aufrufe nur in pruefung/ und simulation/, die gebaute Oberfläche
// enthält keine Erwartungswerte, Entwicklungsserver und Auslieferung geben keine Projektdateien heraus.

import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { build, createServer, type ViteDevServer } from 'vite';
import type { AnlageMitLabels, Zusammenfassung } from '../src/ui/api.ts';
import { erstelleServer } from '../src/server/app.ts';
import { CSP_OBERFLAECHE } from '../src/server/statisch.ts';
import { anfrage, BILDER, erwartungen, neueDatenbank, TESTDATEN, WURZEL, type TestServer } from './hilfen.ts';
import { json, lade, mitServer, rendere, starteVite, UI } from './ui-hilfe.ts';

const ANGRIFF = '<img src=x onerror=alert(1)>';

function dateien(ordner: string): string[] {
  return readdirSync(ordner).flatMap((name) => {
    const pfad = join(ordner, name);
    return statSync(pfad).isDirectory() ? dateien(pfad) : [pfad];
  });
}

/** Ersetzt jeden Text in den Daten durch den Angriffstext; Zahlen und Wahrheitswerte bleiben. */
function vergifte<T>(wert: T, schluessel = ''): T {
  if (typeof wert === 'string') {
    if (schluessel === 'status') return wert;
    if (schluessel === 'bildUrl') return 'javascript:alert(1)' as T;
    return ANGRIFF as T;
  }
  if (Array.isArray(wert)) return wert.map((x) => vergifte(x, schluessel)) as T;
  if (wert && typeof wert === 'object') {
    return Object.fromEntries(Object.entries(wert).map(([k, v]) => [k, vergifte(v, k)])) as T;
  }
  return wert;
}

describe('jeder Text vom Server erscheint als Text, nie als HTML', () => {
  let vite: ViteDevServer;
  let d: { sta4: AnlageMitLabels; swr5: AnlageMitLabels; zf: Zusammenfassung; anlagen: unknown[] };
  before(async () => {
    vite = await starteVite();
    d = await mitServer(async (s) => ({
      sta4: await json(s, '/api/anlagen/STA4/labels'),
      swr5: await json(s, '/api/anlagen/SWR5/labels'),
      zf: await json(s, '/api/anlagen/SWR5/zusammenfassung'),
      anlagen: await json(s, '/api/anlagen'),
    }));
  });
  after(() => vite.close());

  test('OCR-Text, Begründung, Gründe, Hinweis, Fehlergrund, offene Punkte, Meldungen, Fehler und Namen', async () => {
    const g = vergifte(d);
    const ohne = () => {};
    const { Uebersicht } = await lade(vite, '/pruefung/Uebersicht.tsx');
    const { Einzelansicht } = await lade(vite, '/pruefung/Einzelansicht.tsx');
    const { Warum } = await lade(vite, '/pruefung/Warum.tsx');
    const { StartAnsicht } = await lade(vite, '/start/Startseite.tsx');
    const { SimulationAnsicht } = await lade(vite, '/simulation/Simulation.tsx');
    const { Fehler } = await lade(vite, '/rahmen.tsx');
    const zf = { ...g.zf, offenePunkte: g.zf.offenePunkte };
    const seiten = [
      rendere(StartAnsicht, { anlagen: g.anlagen }),
      rendere(Uebersicht, {
        zustand: {
          daten: g.swr5, kacheln: g.swr5.labels, nurAuffaellige: false, speichert: false, meldung: { text: ANGRIFF, rueckgaengig: ANGRIFF },
          fehler: ANGRIFF, zusammenfassung: zf, rueckfrage: false, freigabeFehler: { text: ANGRIFF, gruende: [{ labelId: ANGRIFF, text: ANGRIFF }] },
        },
        ereignis: ohne,
      }),
      rendere(Uebersicht, {
        zustand: {
          daten: { ...g.swr5, labels: [] }, kacheln: [], nurAuffaellige: false, speichert: false, meldung: null, fehler: null,
          zusammenfassung: { ...zf, offenePunkte: [] }, rueckfrage: true, freigabeFehler: { text: ANGRIFF, gruende: [{ labelId: null, text: ANGRIFF }] },
        },
        ereignis: ohne,
      }),
      ...[...g.sta4.labels, ...g.swr5.ausserhalbDerPruefung].map((label) =>
        rendere(Einzelansicht, {
          daten: { anlage: g.sta4.anlage, label, zustand: 'bereit', warumOffen: true, fotoGross: false, fehler: ANGRIFF, meldung: { text: ANGRIFF } },
          ereignis: ohne,
        }),
      ),
      ...g.sta4.labels.map((label) => rendere(Warum, { label })),
      rendere(SimulationAnsicht, {
        wartend: g.swr5.ausserhalbDerPruefung.map((label) => ({ anlageName: ANGRIFF, label })),
        speichert: false, meldung: ANGRIFF, fehler: ANGRIFF, onNachbessern: ohne, onFotoNachreichen: ohne,
      }),
      rendere(Fehler, { text: ANGRIFF, gruende: [{ labelId: null, text: ANGRIFF }] }),
    ];
    for (const html of seiten) {
      assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'), 'Angriffstext erscheint als Text');
      assert.doesNotMatch(html, /<img[^>]*onerror|<img src=x|javascript:/i);
    }
  });
});

describe('Quelltext der Oberfläche', () => {
  const quellen = [...dateien(UI), join(WURZEL, 'vite.config.ts')];
  const lies = (d: string) => readFileSync(d, 'utf8');
  const name = (d: string) => relative(WURZEL, d);

  test('kein HTML aus Texten, kein eval', () => {
    for (const d of quellen) {
      assert.doesNotMatch(lies(d), /dangerouslySetInnerHTML|innerHTML|outerHTML|insertAdjacentHTML|document\.write|\beval\(|new Function/, name(d));
    }
  });
  test('kein Import aus testdaten/ oder tests/, kein import.meta.glob, keine Erwartungswerte', () => {
    for (const d of quellen) {
      const inhalt = lies(d);
      assert.doesNotMatch(inhalt, /from ['"][^'"]*(testdaten|tests)\/|import\(['"][^'"]*(testdaten|tests)\//, name(d));
      assert.doesNotMatch(inhalt, /import\.meta\.glob/, name(d));
      // „Text schlecht lesbar“ ist ein Wort der Oberfläche; verboten ist „lesbar“ als Feld der Erwartungswerte.
      assert.doesNotMatch(inhalt, /erwartung|['"]lesbar['"]|\blesbar\s*:|nachKorrektur|nachSimulation/i, name(d));
    }
  });
  test('schreibende Aufrufe nur in pruefung/ und simulation/', () => {
    for (const d of dateien(UI)) {
      const inhalt = lies(d);
      const ort = relative(UI, d).split('/')[0];
      const darfSchreiben = ort === 'pruefung' || ort === 'simulation';
      if (!darfSchreiben) {
        assert.doesNotMatch(inhalt, /X-Rolle|method:\s*['"]POST|from ['"][^'"]*aktionen\.ts['"]/, name(d));
      }
    }
    // Nur die Seiten mit Entscheidungen binden die schreibenden Aufrufe ein, nicht die reinen Ansichten.
    const binden = dateien(UI).filter((d) => /from '\.\/aktionen\.ts'|from '\.\.\/pruefung\/aktionen\.ts'/.test(lies(d))).map((d) => relative(UI, d)).sort();
    assert.deepEqual(binden, ['pruefung/AnlageSeite.tsx', 'pruefung/LabelSeite.tsx', 'simulation/Simulation.tsx', 'simulation/aktionen.ts']);
  });
  test('Server-Typen nur als Typen eingebunden, damit kein Server-Code in die Oberfläche gelangt', () => {
    for (const d of dateien(UI)) {
      for (const zeile of lies(d).split('\n').filter((z) => /from '\.\.\/(\.\.\/)?(server|db|ai)\//.test(z))) {
        assert.match(zeile, /^(import|export) type /, `${name(d)}: ${zeile}`);
      }
    }
  });
});

describe('gebaute Oberfläche (AK-14, AK-61)', () => {
  let dist: string;
  let server: TestServer;
  before(async () => {
    dist = mkdtempSync(join(tmpdir(), 'pruefsystem-bau-'));
    await build({
      configFile: join(WURZEL, 'vite.config.ts'),
      configLoader: 'native',
      logLevel: 'silent',
      build: { outDir: dist, emptyOutDir: true },
    });
    const s = erstelleServer({ db: await neueDatenbank(), bilderOrdner: BILDER, oberflaecheOrdner: dist });
    await new Promise<void>((fertig) => s.listen(0, '127.0.0.1', fertig));
    const { port } = s.address() as { port: number };
    server = { url: `http://127.0.0.1:${port}`, schliessen: () => new Promise((fertig) => s.close(() => fertig())) };
  });
  after(async () => {
    await server.schliessen();
    rmSync(dist, { recursive: true, force: true });
  });

  test('keine Datei enthält Erwartungswerte, das Wort „testdaten“ oder Server-Code', () => {
    const notizen = Object.values(erwartungen()).flatMap((e) => (e.notiz ? [e.notiz] : []));
    const inhalte = dateien(dist).map((d) => [relative(dist, d), readFileSync(d, 'utf8')] as const);
    assert.ok(inhalte.length >= 3);
    for (const [n, inhalt] of inhalte) {
      assert.doesNotMatch(inhalt, /testdaten|erwartung|"lesbar"|nachKorrektur|nacherfassung|tatsaechlich/i, n);
      assert.doesNotMatch(inhalt, /node:sqlite|DatabaseSync|LLM_API_KEY|process\.env/, n);
      for (const notiz of notizen) assert.ok(!inhalt.includes(notiz), `${n} enthält eine Notiz`);
    }
    assert.ok(!dateien(dist).some((d) => d.endsWith('.map')), 'keine Quellkarten');
  });

  test('index.html ohne eingebettete Skripte oder Stile (CSP)', () => {
    const html = readFileSync(join(dist, 'index.html'), 'utf8');
    assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>|<style|style="/);
    assert.match(html, /<script type="module" crossorigin src="\/assets\/[^"]+\.js"><\/script>/);
  });

  test('das gebaute CSS enthält die Farben aller sechs Status', async () => {
    const { STATUS_ANZEIGE } = await import('../src/ui/status.ts');
    const css = dateien(dist).filter((d) => d.endsWith('.css')).map((d) => readFileSync(d, 'utf8')).join('\n');
    for (const { klasse } of Object.values(STATUS_ANZEIGE)) {
      for (const k of klasse.split(' ')) assert.ok(css.includes(`.${k.replace(/([:/])/g, '\\$1')}`), k);
    }
  });

  test('der Server liefert die gebaute Oberfläche mit CSP, aber keine Projektdateien', async () => {
    const start = await anfrage(server, '/');
    assert.equal(start.status, 200);
    assert.equal(start.kopf.get('content-security-policy'), CSP_OBERFLAECHE);
    for (const [, pfad] of start.text.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)) {
      assert.equal((await anfrage(server, pfad!)).status, 200, pfad);
    }
    for (const pfad of ['/testdaten/erwartung.json', '/src/ui/main.tsx', '/vite.config.ts', '/package.json', '/.env', '/dist/index.html']) {
      assert.equal((await anfrage(server, pfad)).status, 404, pfad);
    }
  });
});

describe('Entwicklungsserver (npm run dev)', () => {
  let vite: ViteDevServer;
  let url: string;
  let ordner: string;
  const dbVorher = process.env.DB_PFAD;
  before(async () => {
    ordner = mkdtempSync(join(tmpdir(), 'pruefsystem-dev-'));
    process.env.DB_PFAD = join(ordner, 'dev.sqlite');
    vite = await createServer({
      configFile: join(WURZEL, 'vite.config.ts'),
      configLoader: 'native',
      logLevel: 'silent',
      server: { port: 0, strictPort: false, hmr: false, ws: false, watch: null },
      optimizeDeps: { noDiscovery: true, include: [] },
    });
    await vite.listen();
    url = vite.resolvedUrls!.local[0]!.replace(/\/$/, '');
  });
  after(async () => {
    await vite.close();
    if (dbVorher === undefined) delete process.env.DB_PFAD;
    else process.env.DB_PFAD = dbVorher;
    rmSync(ordner, { recursive: true, force: true });
  });

  test('liefert die Schnittstelle als derselbe Handler: Rolle, Fotos', async () => {
    assert.equal((await fetch(`${url}/api/anlagen`)).status, 200);
    assert.equal((await fetch(`${url}/bilder/STA4-01.svg`)).status, 200);
    assert.equal((await fetch(`${url}/bilder/SWR5-05.svg`)).status, 404, 'Foto der Simulation erst nach dem Nachreichen');
    assert.equal((await fetch(`${url}/api/labels/STA4-01/bestaetigen`, { method: 'POST' })).status, 403);
  });

  test('gibt Erwartungswerte, Tests und Projektdateien nicht heraus', async () => {
    const abgewiesen = async (pfad: string) => {
      const res = await fetch(url + pfad);
      const inhalt = await res.text();
      assert.ok(res.status === 403 || res.status === 404, `${pfad}: ${res.status}`);
      assert.ok(!inhalt.includes('"lesbar"'), pfad);
    };
    for (const pfad of [
      '/testdaten/erwartung.json',
      `/@fs${TESTDATEN}/erwartung.json`,
      `/@fs${join(WURZEL, 'tests', 'hilfen.ts')}`,
      `/@fs${join(WURZEL, 'package.json')}`,
      `/@fs${join(WURZEL, 'src', 'server', 'app.ts')}`,
      '/../testdaten/erwartung.json',
      '/%2e%2e/testdaten/erwartung.json',
    ]) {
      await abgewiesen(pfad);
    }
  });
});
