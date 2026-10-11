// Erweiterung „Eigenes Foto“ (Plan erweiterung-upload-plan.md, U-B1 bis U-B7): Kamera lädt ein Foto für einen Platz der
// Testanlage „Eigene Fotos“ hoch, der Server liest den Text, schätzt die Sprachen, und das Label geht in Max' Prüfung.
// Die Texterkennung ist hier ein Test-Leser mit festen Antworten; tesseract.js selbst prüft tests/upload-ocr.test.ts.

import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { describe, test } from 'node:test';
import { mockAntwort } from '../src/ai/mock.ts';
import { erkenneBildtyp } from '../src/ocr/bild.ts';
import { leseOcrModus, type TextLeser } from '../src/ocr/textLeser.ts';
import { erstelleServer, type ServerOptionen } from '../src/server/app.ts';
import { antwort } from '../src/ui/marie/logik.ts';
import type { MarieUebersicht } from '../src/server/marie.ts';
import { anfrage, DEMO, DEMO_BILDER, hoere, neueDemoDatenbank, type TestServer, WURZEL } from './hilfen.ts';

const PNG = readFileSync(join(WURZEL, 'tests', 'bilder', 'label-de-pl.png'));
const JPEG = readFileSync(join(WURZEL, 'tests', 'bilder', 'label-de-pl.jpg'));
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
const PDF = Buffer.from('%PDF-1.4\n%');
const TEXT_DE_PL = 'ACHTUNG: Heiße Oberfläche\nNicht berühren!\nUWAGA: Gorąca powierzchnia';

/** Test-Leser: liefert feste Antworten und zählt, wie oft er gelesen hat. */
function testLeser(ergebnis = { text: TEXT_DE_PL, konfidenz: 0.94 }) {
  const leser = (async () => {
    leser.aufrufe += 1;
    return ergebnis;
  }) as unknown as TextLeser & { aufrufe: number };
  leser.aufrufe = 0;
  return leser;
}

interface Umgebung {
  s: TestServer;
  db: DatabaseSync;
  ordner: string;
}

async function mitUpload(arbeit: (u: Umgebung) => Promise<void>, optionen: Partial<ServerOptionen> = {}): Promise<void> {
  const db = await neueDemoDatenbank();
  const ordner = mkdtempSync(join(tmpdir(), 'uploads-'));
  const server = erstelleServer({ db, bilderOrdner: DEMO_BILDER, datenOrdner: DEMO, uploadOrdner: ordner, textLeser: testLeser(), ...optionen });
  await new Promise<void>((fertig) => server.listen(0, '127.0.0.1', fertig));
  const { port } = server.address() as AddressInfo;
  const s: TestServer = { url: `http://127.0.0.1:${port}`, schliessen: () => new Promise((f) => server.close(() => f())) };
  try {
    await arbeit({ s, db, ordner });
  } finally {
    await s.schliessen();
    db.close();
    rmSync(ordner, { recursive: true, force: true });
  }
}

function lade(s: TestServer, id: string, bild: Buffer, { rolle = 'kamera', text, kopf = {} }: { rolle?: string; text?: string; kopf?: Record<string, string> } = {}) {
  const suche = text === undefined ? '' : `?text=${encodeURIComponent(text)}`;
  return fetch(`${s.url}/api/labels/${id}/foto${suche}`, {
    method: 'POST',
    headers: { 'X-Rolle': rolle, 'Content-Type': 'application/octet-stream', ...kopf },
    body: new Uint8Array(bild),
  }).then(async (res) => ({ status: res.status, daten: (await res.json()) as any }));
}

const max = { methode: 'POST' as const, rolle: 'max' };
const dateien = (ordner: string) => readdirSync(ordner).sort();

describe('U-B1 Bildtyp und Modus der Texterkennung', () => {
  test('Typ nur aus den ersten Bytes: PNG und JPEG ja, SVG, PDF, leer und Text nein', () => {
    assert.equal(erkenneBildtyp(PNG), 'png');
    assert.equal(erkenneBildtyp(JPEG), 'jpeg');
    for (const b of [SVG, PDF, Buffer.alloc(0), Buffer.from('GIF89a'), PNG.subarray(0, 8)]) assert.equal(erkenneBildtyp(b), null);
  });
  test('OCR_MODUS: Standard tesseract, „aus“ schaltet ab, Unbekanntes bricht mit klarer Meldung ab', () => {
    assert.equal(leseOcrModus({}), 'tesseract');
    assert.equal(leseOcrModus({ OCR_MODUS: 'tesseract' }), 'tesseract');
    assert.equal(leseOcrModus({ OCR_MODUS: ' aus ' }), 'aus');
    assert.throws(() => leseOcrModus({ OCR_MODUS: 'cloud' }), /OCR_MODUS=cloud ist unbekannt/);
  });
});

describe('U-B8 Wörter echter Warnschilder (U5)', () => {
  test('je Sprache ein typischer Satz echter Schilder wird sicher erkannt', () => {
    const saetze: Record<string, string> = {
      de: 'Lebensgefahr! Schutzhandschuhe tragen. Rauchen verboten.',
      en: 'Risk of injury. Protective gloves must be worn.',
      pl: 'Zakaz palenia. Obowiązek stosowania rękawic ochronnych.',
      fr: 'Défense de fumer. Port de gants obligatoire.',
      ru: 'Курить запрещается. Опасная зона.',
    };
    for (const [code, satz] of Object.entries(saetze)) {
      const a = mockAntwort(satz);
      assert.deepEqual(a.sprachen, [code], satz);
      assert.ok(a.konfidenz >= 0.9, `${satz}: ${a.konfidenz}`);
    }
  });
});

describe('U-B3 Testanlage „Eigene Fotos“ und GET /api/kamera', () => {
  test('zu Beginn 3 leere Plätze, Anlage gesperrt; die Kamera-Seite sieht, ob gelesen werden kann', async () => {
    await mitUpload(async ({ s }) => {
      const k = (await anfrage(s, '/api/kamera')).daten;
      assert.equal(k.texterkennung, true);
      assert.equal(k.upload, true);
      assert.equal(k.anlage.name, 'Testanlage Eigene Fotos');
      assert.equal(k.anlage.gesperrt, true);
      assert.deepEqual(k.plaetze.map((p: any) => `${p.id}:${p.status}`), ['EIG1-01:fehlt', 'EIG1-02:fehlt', 'EIG1-03:fehlt']);
    });
    await mitUpload(async ({ s }) => assert.equal((await anfrage(s, '/api/kamera')).daten.texterkennung, false), { textLeser: null });
  });
});

describe('U-B4 POST /api/labels/:id/foto', () => {
  test('PNG wird gelesen: Label mit Foto, Text, Sprachen; geht als „Offen“ in Max\' Prüfung; ein Protokolleintrag „kamera“', async () => {
    await mitUpload(async ({ s, db, ordner }) => {
      const r = await lade(s, 'EIG1-01', PNG);
      assert.equal(r.status, 200, JSON.stringify(r.daten));
      assert.equal(r.daten.status, 'offen');
      assert.equal(r.daten.ocrText, TEXT_DE_PL);
      assert.equal(r.daten.ocrKonfidenz, 0.94);
      assert.equal(r.daten.textGefunden, true);
      assert.deepEqual(r.daten.sprachen.map((x: any) => x.code), ['de', 'pl']);
      assert.match(r.daten.bildUrl, /^\/bilder\/uploads\/[a-f0-9]{32}\.png$/);
      assert.deepEqual(dateien(ordner), [r.daten.bildUrl.slice('/bilder/uploads/'.length)]);
      const max_ = (await anfrage(s, '/api/anlagen/EIG1/labels')).daten;
      assert.deepEqual(max_.labels.map((l: any) => l.id), ['EIG1-01']);
      const protokoll = db.prepare("SELECT wer, ergebnis FROM entscheidungen WHERE label_id = 'EIG1-01'").all();
      assert.deepEqual(protokoll.map((z: any) => `${z.wer}:${z.ergebnis}`), ['kamera:nacherfasst']);
    });
  });

  test('das Foto kommt mit dem Typ aus seinen Bytes und nosniff; fremde und erfundene Namen geben 404', async () => {
    await mitUpload(async ({ s }) => {
      const { daten } = await lade(s, 'EIG1-02', JPEG);
      assert.match(daten.bildUrl, /\.jpg$/);
      const res = await fetch(s.url + daten.bildUrl);
      assert.equal(res.status, 200);
      assert.equal(res.headers.get('content-type'), 'image/jpeg');
      assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
      assert.deepEqual(new Uint8Array(await res.arrayBuffer()), new Uint8Array(JPEG));
      for (const pfad of [`/bilder/uploads/${'0'.repeat(32)}.png`, '/bilder/uploads/../../package.json', '/bilder/uploads/x.svg']) {
        assert.equal((await fetch(s.url + pfad)).status, 404, pfad);
      }
    });
  });

  test('SVG, PDF und leere Datei → 415; über 5 MB → 413; nichts wird gespeichert, das Label bleibt „Fehlt“', async () => {
    await mitUpload(async ({ s, ordner }) => {
      for (const b of [SVG, PDF, Buffer.alloc(0)]) assert.equal((await lade(s, 'EIG1-01', b)).status, 415);
      const gross = Buffer.concat([PNG, Buffer.alloc(5 * 1024 * 1024)]);
      const r = await lade(s, 'EIG1-01', gross);
      assert.equal(r.status, 413);
      assert.match(r.daten.fehler, /höchstens 5 MB/);
      assert.deepEqual(dateien(ordner), []);
      assert.equal((await anfrage(s, '/api/labels/EIG1-01')).daten.status, 'fehlt');
    });
  });

  test('nur die Kamera und nur von der eigenen Seite: Max, Marie, Testleitung, ohne Rolle und fremde Herkunft → 403', async () => {
    await mitUpload(async ({ s, ordner }) => {
      for (const rolle of ['max', 'marie', 'testleitung', '']) assert.equal((await lade(s, 'EIG1-01', PNG, { rolle })).status, 403, rolle);
      assert.equal((await lade(s, 'EIG1-01', PNG, { kopf: { 'Sec-Fetch-Site': 'cross-site' } })).status, 403);
      assert.equal((await lade(s, 'EIG1-01', PNG, { kopf: { Origin: 'http://boese.example' } })).status, 403);
      assert.deepEqual(dateien(ordner), []);
    });
  });

  test('409 für Labels anderer Anlagen, bestätigte Labels und eine freigegebene Testanlage; 404 für unbekannte', async () => {
    await mitUpload(async ({ s }) => {
      assert.equal((await lade(s, 'PRE3-01', PNG)).status, 409);
      assert.equal((await lade(s, 'GIBTS-01', PNG)).status, 404);
      for (const id of ['EIG1-01', 'EIG1-02', 'EIG1-03']) await lade(s, id, PNG);
      assert.equal((await anfrage(s, '/api/labels/EIG1-01/bestaetigen', max)).status, 200);
      const r = await lade(s, 'EIG1-01', PNG);
      assert.equal(r.status, 409);
      assert.match(r.daten.fehler, /Bestätigt/);
      for (const id of ['EIG1-02', 'EIG1-03']) await anfrage(s, `/api/labels/${id}/bestaetigen`, max);
      assert.equal((await anfrage(s, '/api/anlagen/EIG1/freigeben', max)).status, 200);
      assert.equal((await lade(s, 'EIG1-02', PNG)).status, 409);
    });
  });

  test('schlecht gelesen → „Unsicher“; nichts gelesen → „Unsicher“ mit textGefunden=false; erneutes Foto ersetzt das alte und löscht die Datei', async () => {
    await mitUpload(async ({ s, ordner }) => {
      const r1 = await lade(s, 'EIG1-01', PNG);
      assert.equal(r1.daten.status, 'unsicher');
      assert.equal(r1.daten.textGefunden, false);
      const alt = dateien(ordner);
      const r2 = await lade(s, 'EIG1-01', JPEG, { text: 'Achtung! Nicht berühren.\nUwaga! Nie dotykać.' });
      assert.equal(r2.status, 200);
      assert.equal(r2.daten.textGefunden, true);
      assert.equal(dateien(ordner).length, 1);
      assert.notDeepEqual(dateien(ordner), alt);
    }, { textLeser: testLeser({ text: '', konfidenz: 0 }) });
    await mitUpload(async ({ s }) => {
      assert.equal((await lade(s, 'EIG1-01', PNG)).daten.status, 'unsicher');
    }, { textLeser: testLeser({ text: TEXT_DE_PL, konfidenz: 0.55 }) });
  });

  test('Rückfall: abgetippter Text statt Lesen, mit Hinweis in der Begründung; ohne Texterkennung und ohne Text → 400', async () => {
    await mitUpload(async ({ s, ordner }) => {
      const ohne = await lade(s, 'EIG1-01', PNG);
      assert.equal(ohne.status, 400);
      assert.match(ohne.daten.fehler, /eintippen/);
      assert.equal((await lade(s, 'EIG1-01', PNG, { text: '   ' })).status, 400);
      assert.equal((await lade(s, 'EIG1-01', PNG, { text: 'x'.repeat(1001) })).status, 400);
      assert.deepEqual(dateien(ordner), []);
      const r = await lade(s, 'EIG1-01', PNG, { text: TEXT_DE_PL });
      assert.equal(r.status, 200);
      assert.equal(r.daten.ocrKonfidenz, 1);
      assert.match(r.daten.begruendung, /^Text abgetippt, nicht automatisch gelesen\./);
      assert.deepEqual(r.daten.sprachen.map((x: any) => x.code), ['de', 'pl']);
    }, { textLeser: null });
  });

  test('mit Texterkennung liest der Server nicht, wenn Text mitkommt; scheitert das Lesen → 503, nichts gespeichert', async () => {
    const leser = testLeser();
    await mitUpload(async ({ s }) => {
      await lade(s, 'EIG1-01', PNG, { text: 'Achtung' });
      assert.equal(leser.aufrufe, 0);
    }, { textLeser: leser });
    await mitUpload(async ({ s, ordner }) => {
      assert.equal((await lade(s, 'EIG1-01', PNG)).status, 503);
      assert.deepEqual(dateien(ordner), []);
      assert.equal((await anfrage(s, '/api/labels/EIG1-01')).daten.status, 'fehlt');
    }, { textLeser: async () => { throw new Error('kaputt'); } });
  });

  test('gemeldetes Label: neues Foto bringt es als „Nachgebessert“ zurück zu Max, Fehlergrund bleibt', async () => {
    await mitUpload(async ({ s, db }) => {
      await lade(s, 'EIG1-01', PNG);
      assert.equal((await anfrage(s, '/api/labels/EIG1-01/fehler', { ...max, koerper: JSON.stringify({ grund: 'unleserlich' }) })).status, 200);
      const r = await lade(s, 'EIG1-01', PNG);
      assert.equal(r.daten.status, 'nachgebessert');
      assert.equal(r.daten.letzterFehlergrund, 'unleserlich');
      const protokoll = db.prepare("SELECT wer, ergebnis FROM entscheidungen WHERE label_id = 'EIG1-01' ORDER BY id").all();
      assert.deepEqual(protokoll.map((z: any) => `${z.wer}:${z.ergebnis}`), ['kamera:nacherfasst', 'max:fehler', 'kamera:nachgebessert']);
      const marie = (await anfrage(s, '/api/marie')).daten as MarieUebersicht;
      const zeile = marie.labels.find((l) => l.schluessel === 'EIG1-01')!;
      assert.equal(zeile.gruppe, 'offen');
    });
  });

  test('genau ein Signal je Foto; ein abgewiesenes Foto sendet keins', async () => {
    await mitUpload(async ({ s }) => {
      const h = await hoere(`${s.url}/api/ereignisse`);
      try {
        await h.naechste();
        const vorher = h.nachrichten.length;
        assert.equal((await lade(s, 'EIG1-01', SVG)).status, 415);
        await lade(s, 'EIG1-01', PNG);
        await h.naechste();
        await new Promise((r) => setTimeout(r, 200));
        assert.equal(h.nachrichten.length, vorher + 1);
      } finally {
        h.schliessen();
      }
    });
  });
});

describe('Prüfung M1: die simulierte Instandhaltung lässt die Testanlage in Ruhe', () => {
  test('„Foto nachreichen“ und „Nachbessern“ für EIG1 → 409 mit Hinweis auf die Kamera-Seite; das Label bleibt, wie es ist', async () => {
    await mitUpload(async ({ s }) => {
      const r = await anfrage(s, '/api/labels/EIG1-01/nacherfassen', max);
      assert.equal(r.status, 409);
      assert.match(r.daten.fehler, /Kamera-Seite/);
      await lade(s, 'EIG1-02', PNG);
      await anfrage(s, '/api/labels/EIG1-02/fehler', { ...max, koerper: JSON.stringify({ grund: 'unleserlich' }) });
      assert.equal((await anfrage(s, '/api/labels/EIG1-02/nachbessern', max)).status, 409);
      assert.equal((await anfrage(s, '/api/labels/EIG1-02')).daten.status, 'fehlerhaft');
    });
  });
});

describe('U-B7 Daten zurücksetzen löscht die eigenen Fotos', () => {
  test('nach dem Zurücksetzen keine Datei mehr, EIG1 wieder 3 × „Fehlt“, das alte Foto gibt es nicht mehr', async () => {
    await mitUpload(async ({ s, ordner }) => {
      const { daten } = await lade(s, 'EIG1-01', PNG);
      await lade(s, 'EIG1-02', JPEG);
      writeFileSync(join(ordner, 'liegengeblieben.png'), PNG);
      assert.equal(dateien(ordner).length, 3);
      assert.equal((await anfrage(s, '/api/demo/zuruecksetzen', { methode: 'POST', rolle: 'testleitung' })).status, 200);
      assert.deepEqual(dateien(ordner), []);
      assert.equal(existsSync(ordner), true);
      const k = (await anfrage(s, '/api/kamera')).daten;
      assert.deepEqual(k.plaetze.map((p: any) => p.status), ['fehlt', 'fehlt', 'fehlt']);
      assert.equal((await fetch(s.url + daten.bildUrl)).status, 404);
    });
  });
});

describe('Ganzer Weg: Kamera → Max → Marie', () => {
  test('drei eigene Fotos, Max bestätigt und gibt frei; mit den drei Demo-Anlagen sagt Marie „Ja. Alle 40 Labels …“', async () => {
    await mitUpload(async ({ s }) => {
      for (const id of ['EIG1-01', 'EIG1-02', 'EIG1-03']) assert.equal((await lade(s, id, PNG)).status, 200, id);
      const labels = (await anfrage(s, '/api/marie')).daten.labels as { schluessel: string }[];
      for (const l of labels) await anfrage(s, `/api/labels/${l.schluessel}/bestaetigen`, max);
      for (const a of ['PRE3', 'MON1', 'LAC2', 'EIG1']) assert.equal((await anfrage(s, `/api/anlagen/${a}/freigeben`, max)).status, 200, a);
      const m = (await anfrage(s, '/api/marie')).daten as MarieUebersicht;
      assert.deepEqual(m.zahlen, { gesamt: 40, offen: 0, erledigt: 40, fehlerhaft: 0 });
      assert.equal(antwort(m), 'Ja. Alle 40 Labels sind bestätigt und alle Anlagen freigegeben.');
    });
  });

  test('ohne Upload-Ordner gibt es keinen Upload (404), der Rest des Servers läuft', async () => {
    await mitUpload(async ({ s }) => {
      assert.equal((await lade(s, 'EIG1-01', PNG)).status, 404);
      assert.equal((await anfrage(s, '/api/kamera')).daten.upload, false);
    }, { uploadOrdner: undefined });
  });
});
