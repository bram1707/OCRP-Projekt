// Fehlergrund „Sonstiges“ mit Pflicht-Freitext (Server, Max, Marie) und der Schließen-Knopf oben in Maries Liste.

import assert from 'node:assert/strict';
import type { DatabaseSync } from 'node:sqlite';
import { after, before, describe, test } from 'node:test';
import type { ViteDevServer } from 'vite';
import { holeEntscheidungen, holeLabel } from '../src/db/abfragen.ts';
import { meldeFehler } from '../src/db/aktionen.ts';
import { bereinigeFehlertext, FEHLERTEXT_MAX, fehlergrundAnzeige } from '../src/db/status.ts';
import type { MarieUebersicht } from '../src/server/marie.ts';
import { anfrage, neueDatenbank, starteServer, type TestServer } from './hilfen.ts';
import { lade, rendere, starteVite, text } from './ui-hilfe.ts';

const melde = (koerper: unknown) => ({ methode: 'POST', rolle: 'max', koerper: JSON.stringify(koerper) }) as const;

async function mitServer(arbeit: (s: TestServer, db: DatabaseSync) => Promise<void>): Promise<void> {
  const db = await neueDatenbank();
  const s = await starteServer(db);
  try {
    await arbeit(s, db);
  } finally {
    await s.schliessen();
  }
}

describe('„Sonstiges“: der Freitext ist Pflicht', () => {
  test('ohne, leer, nur Leerzeichen, kein Text oder zu lang: 400, das Label bleibt offen', async () => {
    await mitServer(async (s, db) => {
      for (const k of [
        { grund: 'sonstiges' },
        { grund: 'sonstiges', text: '' },
        { grund: 'sonstiges', text: '   \n ' },
        { grund: 'sonstiges', text: 42 },
        { grund: 'sonstiges', text: ['Schild verdeckt'] },
        { grund: 'sonstiges', text: 'x'.repeat(FEHLERTEXT_MAX + 1) },
      ]) {
        const r = await anfrage(s, '/api/labels/STA4-01/fehler', melde(k));
        assert.equal(r.status, 400, JSON.stringify(k).slice(0, 60));
        assert.match(r.daten.fehler, /Sonstiges/);
      }
      assert.equal(holeLabel(db, 'STA4-01')!.status, 'offen');
      assert.equal(holeEntscheidungen(db, 'STA4-01').length, 0);
    });
  });

  test('mit Text: fehlerhaft, Text bereinigt gespeichert und im Protokoll', async () => {
    await mitServer(async (s, db) => {
      const r = await anfrage(s, '/api/labels/STA4-01/fehler', melde({ grund: 'sonstiges', text: '  Schild von\n Kabelkanal   verdeckt ' }));
      assert.equal(r.status, 200);
      assert.equal(r.daten.status, 'fehlerhaft');
      assert.equal(r.daten.letzterFehlergrund, 'sonstiges');
      assert.equal(r.daten.letzterFehlergrundText, 'Sonstiges: „Schild von Kabelkanal verdeckt“');
      assert.equal(holeLabel(db, 'STA4-01')!.letzterFehlertext, 'Schild von Kabelkanal verdeckt');
      const z = db.prepare("SELECT grund, notiz FROM entscheidungen WHERE label_id = 'STA4-01' AND ergebnis = 'fehler'").get() as any;
      assert.deepEqual({ ...z }, { grund: 'sonstiges', notiz: 'Schild von Kabelkanal verdeckt' });
    });
  });

  test('genau 300 Zeichen gehen noch', async () => {
    const db = await neueDatenbank();
    assert.equal(meldeFehler(db, 'STA4-02', 'sonstiges', 'max', new Date(), 'a'.repeat(FEHLERTEXT_MAX)).status, 'fehlerhaft');
  });

  test('bei den festen Gründen wird ein mitgeschickter Text nicht gespeichert', async () => {
    await mitServer(async (s, db) => {
      const r = await anfrage(s, '/api/labels/STA4-03/fehler', melde({ grund: 'beschaedigt', text: 'soll nicht erscheinen' }));
      assert.equal(r.status, 200);
      assert.equal(r.daten.letzterFehlergrundText, 'Label beschädigt');
      assert.equal(holeLabel(db, 'STA4-03')!.letzterFehlertext, null);
      assert.ok(!JSON.stringify((await anfrage(s, '/api/marie')).daten).includes('soll nicht erscheinen'));
    });
  });

  test('eine neue Meldung mit festem Grund ersetzt den alten Text', async () => {
    await mitServer(async (s, db) => {
      await anfrage(s, '/api/labels/STA4-04/fehler', melde({ grund: 'sonstiges', text: 'alt' }));
      assert.equal((await anfrage(s, '/api/labels/STA4-04/nachbessern', { methode: 'POST', rolle: 'max' })).status, 200);
      assert.equal((await anfrage(s, '/api/labels/STA4-04/fehler', melde({ grund: 'unleserlich' }))).status, 200);
      assert.equal(holeLabel(db, 'STA4-04')!.letzterFehlertext, null);
      assert.equal(holeLabel(db, 'STA4-04')!.letzterFehlergrund, 'unleserlich');
    });
  });

  test('Hilfsfunktionen', () => {
    assert.equal(bereinigeFehlertext(' a \t b '), 'a b');
    assert.equal(bereinigeFehlertext(''), null);
    assert.equal(bereinigeFehlertext(undefined), null);
    assert.equal(fehlergrundAnzeige('sonstiges', 'Text fehlt'), 'Sonstiges: „Text fehlt“');
    assert.equal(fehlergrundAnzeige('unleserlich', 'egal'), 'Unleserlich');
    assert.equal(fehlergrundAnzeige('quatsch', null), null);
  });
});

describe('„Sonstiges“: Marie sieht Max\' Beschreibung', () => {
  test('in der Zeile und unter „Warum?“', async () => {
    await mitServer(async (s) => {
      assert.equal((await anfrage(s, '/api/labels/STA4-05/fehler', melde({ grund: 'sonstiges', text: 'Falsches Piktogramm' }))).status, 200);
      const m: MarieUebersicht = (await anfrage(s, '/api/marie')).daten;
      const l = m.labels.find((x) => x.schluessel === 'STA4-05')!;
      assert.equal(l.grund, 'Von Max gemeldet (Sonstiges: „Falsches Piktogramm“), wartet auf Nachbesserung.');
      assert.match(l.warum[0]!, /^Max hat STA4-05 am \d\d\.\d\d\.2026 gemeldet: Sonstiges: „Falsches Piktogramm“\.$/);
      // Nach der Nachbesserung bleibt der Hinweis sichtbar.
      assert.equal((await anfrage(s, '/api/labels/STA4-05/nachbessern', { methode: 'POST', rolle: 'max' })).status, 200);
      const n: MarieUebersicht = (await anfrage(s, '/api/marie')).daten;
      assert.match(n.labels.find((x) => x.schluessel === 'STA4-05')!.grund, /Sonstiges: „Falsches Piktogramm“/);
    });
  });
});

describe('Oberfläche', () => {
  let vite: ViteDevServer;
  let E: Record<string, any>;
  let A: Record<string, any>;
  let L: Record<string, any>;
  let marie: MarieUebersicht;
  let sta4: any;

  before(async () => {
    vite = await starteVite();
    E = await lade(vite, '/pruefung/Einzelansicht.tsx');
    A = await lade(vite, '/marie/MarieAnsicht.tsx');
    L = await lade(vite, '/pruefung/logik.ts');
    await mitServer(async (s) => {
      marie = (await anfrage(s, '/api/marie')).daten;
      sta4 = (await anfrage(s, '/api/anlagen/STA4/labels')).daten;
    });
  });
  after(async () => {
    await vite?.close();
  });

  test('Grenze und Prüfung der Oberfläche passen zum Server', () => {
    assert.equal(L.FEHLERTEXT_MAX, FEHLERTEXT_MAX);
    assert.equal(L.fehlertextGueltig(''), false);
    assert.equal(L.fehlertextGueltig('   '), false);
    assert.equal(L.fehlertextGueltig('ok'), true);
    assert.equal(L.fehlertextGueltig('x'.repeat(FEHLERTEXT_MAX + 1)), false);
  });

  test('Max sieht „Sonstiges“ als vierten Grund', () => {
    const label = sta4.labels.find((l: any) => l.id === 'STA4-08');
    const html = rendere(E.Einzelansicht, {
      daten: { anlage: sta4.anlage, label, zustand: 'gruende', warumOffen: false, fotoGross: false, fehler: null, meldung: null },
      ereignis: () => undefined,
    });
    assert.match(text(html), /Sonstiges etwas anderes, Sie beschreiben es kurz/);
    assert.match(html, /aria-expanded="false"/);
  });

  test('Maries Liste hat „Liste schließen“ oben neben dem Titel und unten', () => {
    const html = rendere(A.MarieAnsicht, { daten: { daten: marie, auswahl: { art: 'anlage', anlageId: 'STA4' }, verbunden: true } });
    const titel = html.indexOf('id="auswahl-titel"');
    const oben = html.indexOf('data-schliessen="oben"');
    const ersteZeile = html.indexOf('data-marie-label=');
    const unten = html.indexOf('data-schliessen="unten"');
    assert.ok(titel >= 0 && titel < oben && oben < ersteZeile && ersteZeile < unten, `${titel} ${oben} ${ersteZeile} ${unten}`);
    assert.match(html, /data-schliessen="oben"[^>]*>.*?Liste schließen<\/a>/);
    assert.match(html, /href="#\/marie"[^>]*data-schliessen="oben"/);
  });
});
