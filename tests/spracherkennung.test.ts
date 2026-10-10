// AK-30 bis AK-35 und AK-63: Spracherkennung im Mock-Modus, ein Test je Testlabel.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { pruefeAntwort } from '../src/ai/antwortSchema.ts';
import { findeBelege } from '../src/ai/belege.ts';
import { detectLanguage, istUnsicher } from '../src/ai/detectLanguage.ts';
import { mockAntwort, sicherheitAusBelegen, type SprachModell } from '../src/ai/mock.ts';
import { SPRACHEN } from '../src/ai/sprachen.ts';
import { oeffneDatenbank } from '../src/db/datenbank.ts';
import { erwartungen, testdaten } from './hilfen.ts';

const daten = testdaten();
const erwartet = erwartungen();

/** Ein Testmodell, das genau die übergebene Rohantwort liefert. */
const antwortet = (roh: unknown): SprachModell => async () => (typeof roh === 'string' ? roh : JSON.stringify(roh));

const gueltig = {
  sprachen: ['de', 'pl'],
  konfidenz: 0.95,
  konfidenzJeSprache: { de: 0.95, pl: 0.97 },
  prioritaet: 'normal',
  begruendung: 'Deutsch und Polnisch an typischen Wörtern erkannt.',
};

describe('AK-35, AK-63: ein Test je Testlabel', () => {
  for (const label of daten.labels) {
    const e = erwartet[label.id]!;
    test(`${label.id}: ${e.notiz ?? `Vorschlag ${e.sprachen.join('/')} mit mindestens 90 %`}`, async () => {
      const text = label.bild === null ? '' : label.ocrText;
      const ergebnis = await detectLanguage(text, label.bild === null ? 0 : label.ocrKonfidenz);

      // Prompt 4: jede Antwort entspricht dem Schema.
      assert.ok(pruefeAntwort(ergebnis).gueltig, 'Antwort entspricht dem Schema');

      if (e.lesbar) {
        assert.deepEqual([...ergebnis.sprachen].sort(), [...e.sprachen].sort(), 'Sprachen wie erwartet');
        for (const code of e.sprachen) {
          assert.ok((ergebnis.konfidenzJeSprache[code] ?? 0) >= 0.9, `${code} mit mindestens 90 %`);
        }
        assert.equal(istUnsicher(label.ocrKonfidenz, ergebnis.konfidenz, ergebnis.sprachen), false);
      } else if (label.bild !== null) {
        // Unleserlich oder falsch erkannt: nie als sicher.
        assert.ok(e.unsicher);
        assert.equal(istUnsicher(label.ocrKonfidenz, ergebnis.konfidenz, ergebnis.sprachen), true, 'als unsicher markiert');
        assert.equal(ergebnis.prioritaet, 'genau_pruefen');
        const richtigUndSicher =
          [...ergebnis.sprachen].sort().join() === [...e.sprachen].sort().join() && ergebnis.konfidenz >= 0.9;
        assert.equal(richtigUndSicher, false);
      } else {
        assert.deepEqual(ergebnis.sprachen, ['unbekannt'], 'ohne Foto keine Sprache');
      }
    });
  }

  test('STA4-09 schlägt eine falsche Sprache vor, aber nur unsicher', async () => {
    const label = daten.labels.find((l) => l.id === 'STA4-09')!;
    const ergebnis = await detectLanguage(label.ocrText, label.ocrKonfidenz);
    assert.ok(ergebnis.sprachen.includes('ru'));
    assert.ok(ergebnis.konfidenzJeSprache.ru! < 0.9);
  });
});

describe('AK-30 Antwortschema', () => {
  test('gültige Antwort wird angenommen', () => {
    const ergebnis = pruefeAntwort(JSON.stringify(gueltig));
    assert.ok(ergebnis.gueltig);
  });

  test('Gesamtsicherheit ist nie höher als die schwächste Sprache', () => {
    const ergebnis = pruefeAntwort({ ...gueltig, konfidenz: 0.99, konfidenzJeSprache: { de: 0.99, pl: 0.85 } });
    assert.ok(ergebnis.gueltig);
    assert.equal(ergebnis.antwort.konfidenz, 0.85);
  });

  const kaputt: [string, unknown][] = [
    ['kein JSON', '{sprachen: de'],
    ['Liste statt Objekt', '[]'],
    ['Feld fehlt', { ...gueltig, begruendung: undefined }],
    ['Sprachen leer', { ...gueltig, sprachen: [], konfidenzJeSprache: {} }],
    ['ungültiger Code', { ...gueltig, sprachen: ['deutsch', 'pl'], konfidenzJeSprache: { deutsch: 0.9, pl: 0.9 } }],
    ['doppelte Sprache', { ...gueltig, sprachen: ['de', 'de'], konfidenzJeSprache: { de: 0.9 } }],
    ['unbekannt gemischt', { ...gueltig, sprachen: ['unbekannt', 'de'], konfidenzJeSprache: { de: 0.9 } }],
    ['Konfidenz über 1', { ...gueltig, konfidenz: 1.2 }],
    ['Konfidenz als Text', { ...gueltig, konfidenz: '0.9' }],
    ['Sicherheit je Sprache passt nicht', { ...gueltig, konfidenzJeSprache: { de: 0.95 } }],
    ['unbekannte Priorität', { ...gueltig, prioritaet: 'egal' }],
    ['leere Begründung', { ...gueltig, begruendung: '  ' }],
  ];
  for (const [name, roh] of kaputt) {
    test(`ungültig: ${name}`, () => {
      assert.equal(pruefeAntwort(typeof roh === 'string' ? roh : JSON.stringify(roh)).gueltig, false);
    });
  }
});

describe('AK-31 ungültige Antwort wird nie geraten', () => {
  for (const [name, modell] of [
    ['kaputtes JSON', antwortet('kein json')],
    ['falsches Schema', antwortet({ sprache: 'de', konfidenz: 0.99 })],
    ['Modell antwortet nicht', (async () => { throw new Error('Zeitüberschreitung'); }) as SprachModell],
  ] as const) {
    test(name, async () => {
      const ergebnis = await detectLanguage('ACHTUNG! Nicht berühren.', 0.95, modell);
      assert.deepEqual(ergebnis.sprachen, ['unbekannt']);
      assert.equal(ergebnis.konfidenz, 0);
      assert.equal(ergebnis.prioritaet, 'genau_pruefen');
    });
  }
});

describe('AK-16, AK-32 Schwellen: Sprache 90 %, OCR 80 %', () => {
  const mitSicherheit = (k: number) => antwortet({ ...gueltig, konfidenz: k, konfidenzJeSprache: { de: k, pl: k } });

  test('Sprache 90 % und OCR 80 % gelten noch als sicher', async () => {
    const ergebnis = await detectLanguage('Text', 0.8, mitSicherheit(0.9));
    assert.equal(ergebnis.prioritaet, 'normal');
  });
  test('Sprache 89 % → genau prüfen', async () => {
    assert.equal((await detectLanguage('Text', 0.95, mitSicherheit(0.89))).prioritaet, 'genau_pruefen');
  });
  test('OCR 79 % → genau prüfen', async () => {
    assert.equal((await detectLanguage('Text', 0.79, mitSicherheit(0.99))).prioritaet, 'genau_pruefen');
  });
  test('eine einzelne unsichere Sprache reicht für „genau prüfen“', async () => {
    const modell = antwortet({ ...gueltig, konfidenz: 0.97, konfidenzJeSprache: { de: 0.97, pl: 0.88 } });
    assert.equal((await detectLanguage('Text', 0.95, modell)).prioritaet, 'genau_pruefen');
  });
  test('„genau prüfen“ vom Modell wird nie heruntergestuft', async () => {
    const modell = antwortet({ ...gueltig, prioritaet: 'genau_pruefen' });
    assert.equal((await detectLanguage('Text', 0.99, modell)).prioritaet, 'genau_pruefen');
  });
});

describe('AK-20 Belege aus Zeichen und Wörtern', () => {
  test('ein einzelnes Zeichen ergibt keine Sprache', () => {
    assert.deepEqual(mockAntwort('ß').sprachen, ['unbekannt']);
    assert.deepEqual(mockAntwort('Straße 12').sprachen, ['unbekannt']);
  });
  test('nur Zeichen ohne typisches Wort bleibt immer unter 90 %', () => {
    assert.ok(sicherheitAusBelegen(0, 10) < 0.9);
    assert.equal(sicherheitAusBelegen(0, 1), 0);
  });
  test('ein einzelnes typisches Wort reicht nicht für 90 %', () => {
    assert.ok(sicherheitAusBelegen(1, 1) < 0.9);
  });
  test('Wortlisten sind überschneidungsfrei', () => {
    const gesehen = new Map<string, string>();
    for (const s of SPRACHEN) {
      for (const w of s.woerter) {
        assert.ok(!gesehen.has(w), `„${w}“ steht bei ${gesehen.get(w)} und ${s.code}`);
        gesehen.set(w, s.code);
      }
    }
  });
  test('jeder Beleg zeigt auf die richtige Stelle im Text', () => {
    for (const l of daten.labels) {
      for (const t of findeBelege(l.ocrText)) {
        for (const b of t.belege) assert.equal(l.ocrText.slice(b.start, b.ende), b.text, l.id);
      }
    }
  });
  test('die Begründung nennt die Belege in einem Satz', () => {
    const antwort = mockAntwort('ACHTUNG! Nicht berühren. UWAGA! Nie dotykać.');
    assert.match(antwort.begruendung, /„achtung“/);
    assert.match(antwort.begruendung, /„uwaga“/);
    assert.match(antwort.begruendung, /\.$/);
  });
});

describe('AK-33 keine Soll-Sprache', () => {
  test('detectLanguage bekommt keine Soll-Sprache', () => {
    assert.ok(detectLanguage.length <= 2);
  });
  test('die Datenbank hat kein Feld für eine Soll-Sprache', () => {
    const db = oeffneDatenbank(':memory:');
    for (const tabelle of ['anlagen', 'labels', 'entscheidungen']) {
      const spalten = db.prepare(`PRAGMA table_info(${tabelle})`).all() as { name: string }[];
      assert.ok(!spalten.some((s) => /soll_sprache|zielsprache|gefordert/.test(s.name)), tabelle);
    }
  });
});
