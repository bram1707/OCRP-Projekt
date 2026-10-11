// Test-Agent Stufe 1 · AK-16, AK-19, AK-20, AK-30 bis AK-35

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { detectLanguage } from '../../src/ai/detectLanguage.ts';
import { mockAntwort } from '../../src/ai/mock.ts';
import { anfangsstatus } from '../../src/db/status.ts';
import { holeLabels } from '../../src/db/abfragen.ts';
import type { Testdaten } from '../../src/db/datenbank.ts';
import { basisDb, DE_EN, DE_FR, DE_PL, DE_RU, eigeneDb, festesModell, NUR_DE, ruf, server } from './hilfe.ts';

const antwort = (k: number, je?: Record<string, number>) => ({
  sprachen: Object.keys(je ?? { de: k }), konfidenz: k, konfidenzJeSprache: je ?? { de: k }, prioritaet: 'normal', begruendung: 'Test.',
});

describe('AK-16, AK-32 Schwellen genau an der Grenze', () => {
  test('Sprache 0,89 → genau_pruefen / unsicher; 0,90 → normal / offen', async () => {
    const a = await detectLanguage(DE_PL, 0.95, festesModell(antwort(0.89)));
    assert.equal(a.prioritaet, 'genau_pruefen');
    assert.equal(anfangsstatus(true, 0.95, a.konfidenz, a.sprachen), 'unsicher');
    const b = await detectLanguage(DE_PL, 0.95, festesModell(antwort(0.9)));
    assert.equal(b.prioritaet, 'normal');
    assert.equal(anfangsstatus(true, 0.95, b.konfidenz, b.sprachen), 'offen');
  });

  test('OCR 0,79 → genau_pruefen / unsicher; 0,80 → normal / offen', async () => {
    const a = await detectLanguage(DE_PL, 0.79, festesModell(antwort(0.95)));
    assert.equal(a.prioritaet, 'genau_pruefen');
    assert.equal(anfangsstatus(true, 0.79, a.konfidenz, a.sprachen), 'unsicher');
    const b = await detectLanguage(DE_PL, 0.8, festesModell(antwort(0.95)));
    assert.equal(b.prioritaet, 'normal');
    assert.equal(anfangsstatus(true, 0.8, b.konfidenz, b.sprachen), 'offen');
  });

  test('zweisprachig: eine Sprache 0,89 reicht für „unsicher“, Gesamtsicherheit = schwächste', async () => {
    const a = await detectLanguage(DE_PL, 0.95, festesModell({ ...antwort(0.95, { de: 0.95, pl: 0.89 }), konfidenz: 0.95 }));
    assert.equal(a.konfidenz, 0.89);
    assert.equal(a.prioritaet, 'genau_pruefen');
  });

  test('über die Schnittstelle: 0,79 OCR zeigt Status Unsicher, Hinweis, Sprache nicht als sicher', async () => {
    const daten: Testdaten = {
      anlagen: [{ id: 'G', name: 'Grenze', sollAnzahl: 2 }],
      labels: [
        { id: 'G-1', anlageId: 'G', bild: 'STA4-01.svg', ocrText: DE_PL, ocrKonfidenz: 0.79 },
        { id: 'G-2', anlageId: 'G', bild: 'STA4-02.svg', ocrText: DE_PL, ocrKonfidenz: 0.8 },
      ],
    };
    const s = await server(await eigeneDb(daten));
    try {
      const g1 = (await ruf(s, '/api/labels/G-1')).daten;
      assert.equal(g1.status, 'unsicher');
      assert.equal(g1.statusText, 'Unsicher');
      assert.match(g1.hinweis, /schlecht lesbar/);
      assert.equal(g1.prioritaet, 'genau_pruefen');
      assert.ok(g1.gruende.some((x: any) => x.code === 'unsicher_ocr'));
      const g2 = (await ruf(s, '/api/labels/G-2')).daten;
      assert.equal(g2.status, 'offen');
      assert.equal(g2.hinweis, null);
    } finally { await s.zu(); }
  });

  test('über die Schnittstelle: Sprache 0,89 → „Sprache nicht sicher erkannt“, sicher=false', async () => {
    const daten: Testdaten = {
      anlagen: [{ id: 'G', name: 'Grenze', sollAnzahl: 1 }],
      labels: [{ id: 'G-1', anlageId: 'G', bild: 'STA4-01.svg', ocrText: DE_PL, ocrKonfidenz: 0.95 }],
    };
    const s = await server(await eigeneDb(daten, festesModell(antwort(0.89, { de: 0.95, pl: 0.89 }))));
    try {
      const g = (await ruf(s, '/api/labels/G-1')).daten;
      assert.equal(g.status, 'unsicher');
      assert.match(g.hinweis, /Sprache nicht sicher erkannt/);
      assert.deepEqual(g.sprachen.map((x: any) => [x.code, x.sicher]), [['de', true], ['pl', false]]);
    } finally { await s.zu(); }
  });
});

describe('AK-31 ungültige KI-Antwort → unbekannt, 0, genau_pruefen', () => {
  const ungueltig: [string, unknown][] = [
    ['kein JSON', 'Deutsch, ziemlich sicher'],
    ['leerer Text', ''],
    ['null', 'null'],
    ['Liste', '[]'],
    ['sprachen fehlt', { konfidenz: 0.9, konfidenzJeSprache: {}, prioritaet: 'normal', begruendung: 'x' }],
    ['sprachen leer', antwort(0.95, {})],
    ['Sprachname statt ISO', { ...antwort(0.95), sprachen: ['Deutsch'], konfidenzJeSprache: { Deutsch: 0.95 } }],
    ['konfidenz > 1', antwort(1.2)],
    ['konfidenz negativ', antwort(-0.1)],
    ['konfidenz als Text', { ...antwort(0.95), konfidenz: '0.95' }],
    ['konfidenz 95 (Prozent)', antwort(95)],
    ['prioritaet unbekannt', { ...antwort(0.95), prioritaet: 'hoch' }],
    ['begruendung leer', { ...antwort(0.95), begruendung: '' }],
    ['unbekannt plus Sprache', { ...antwort(0.95), sprachen: ['unbekannt', 'de'] }],
    ['Sprache doppelt', { ...antwort(0.95), sprachen: ['de', 'de'] }],
  ];
  for (const [name, roh] of ungueltig) {
    test(name, async () => {
      const a = await detectLanguage(DE_PL, 0.95, festesModell(roh));
      assert.deepEqual([a.sprachen, a.konfidenz, a.prioritaet], [['unbekannt'], 0, 'genau_pruefen']);
      assert.ok(a.begruendung.length > 0);
    });
  }
  test('Modell wirft eine Ausnahme', async () => {
    const a = await detectLanguage(DE_PL, 0.95, async () => { throw new Error('Zeitüberschreitung'); });
    assert.deepEqual([a.sprachen, a.konfidenz, a.prioritaet], [['unbekannt'], 0, 'genau_pruefen']);
  });
  test('Modell sagt „normal“ trotz 0,5 → wird auf genau_pruefen hochgestuft', async () => {
    const a = await detectLanguage(DE_PL, 0.95, festesModell(antwort(0.5)));
    assert.equal(a.prioritaet, 'genau_pruefen');
  });
  test('Modell sagt „unbekannt“ mit Sicherheit 0,95 → nie als sicher, Sicherheit wird 0', async () => {
    const a = await detectLanguage(DE_PL, 0.95, festesModell({ sprachen: ['unbekannt'], konfidenz: 0.95, konfidenzJeSprache: {}, prioritaet: 'normal', begruendung: 'x' }));
    assert.equal(a.prioritaet, 'genau_pruefen');
    assert.equal(anfangsstatus(true, 0.95, a.konfidenz, a.sprachen), 'unsicher');
    // Seit Korrekturrunde 1 (R6/H1) wird „unbekannt“ immer mit Sicherheit 0 gespeichert.
    assert.equal(a.konfidenz, 0);
  });
  test('leerer OCR-Text und NaN-OCR', async () => {
    const a = await detectLanguage('   ', 0.95);
    assert.deepEqual([a.sprachen, a.konfidenz, a.prioritaet], [['unbekannt'], 0, 'genau_pruefen']);
    const b = await detectLanguage(DE_PL, Number.NaN);
    assert.equal(b.prioritaet, 'genau_pruefen');
  });
});

describe('AK-30, AK-33 Antwortschema und keine Soll-Sprache', () => {
  test('Mock liefert genau die Schlüssel des Schemas (plus konfidenzJeSprache)', async () => {
    const a = await detectLanguage(DE_PL, 0.95);
    assert.deepEqual(Object.keys(a).sort(), ['begruendung', 'konfidenz', 'konfidenzJeSprache', 'prioritaet', 'sprachen']);
    assert.ok(a.sprachen.every((x) => /^[a-z]{2}$/.test(x)));
    assert.ok(a.konfidenz >= 0 && a.konfidenz <= 1);
  });
  test('detectLanguage nimmt nur Text und OCR-Sicherheit, keine Soll-Sprache', () => {
    assert.equal(detectLanguage.length, 2);
  });
});

describe('AK-20 Belege: Zeichen und Wörter, ein Zeichen allein reicht nicht', () => {
  test('ein einzelnes ß ohne typisches Wort → keine Sprache', () => {
    assert.deepEqual(mockAntwort('Straße 12').sprachen, ['unbekannt']);
  });
  test('nur Zeichen ohne Wort (ą ł ż) → nie sicher', () => {
    const a = mockAntwort('Wąż łąka żółw');
    assert.ok(a.konfidenz < 0.9);
    assert.equal(a.prioritaet, 'genau_pruefen');
  });
  test('kyrillische Buchstaben + typisches Wort „Внимание“ → Russisch mit Belegen beider Art', async () => {
    const s = await server(await basisDb());
    try {
      const l = (await ruf(s, '/api/labels/SWR5-01')).daten;
      const ru = l.belege.filter((b: any) => b.sprache === 'ru');
      assert.ok(ru.some((b: any) => b.art === 'wort'));
      assert.ok(ru.some((b: any) => b.art === 'zeichen'));
      for (const b of l.belege) assert.equal(l.ocrText.slice(b.start, b.ende), b.text, 'Fundstelle stimmt');
    } finally { await s.zu(); }
  });
});

describe('AK-19 Auffälligkeit', () => {
  const anlage = (texte: string[]): Testdaten => ({
    anlagen: [{ id: 'A', name: 'A', sollAnzahl: texte.length }],
    labels: texte.map((t, i) => ({ id: `A-${i + 1}`, anlageId: 'A', bild: `STA4-0${(i % 9) + 1}.svg`, ocrText: t, ocrKonfidenz: 0.95 })),
  });
  const lade = async (texte: string[]) => {
    const s = await server(await eigeneDb(anlage(texte)));
    try { return (await ruf(s, '/api/anlagen/A/labels')).daten.labels as any[]; } finally { await s.zu(); }
  };

  test('alle zweisprachig gleich: keines auffällig', async () => {
    const l = await lade([DE_PL, DE_PL, DE_PL, DE_PL]);
    assert.ok(l.every((x) => !x.auffaellig && x.gruende.length === 0));
  });
  test('Lackierung-Fall: Deutsch/Russisch statt Deutsch/Französisch ist auffällig, mit Grund', async () => {
    const l = await lade([DE_FR, DE_FR, DE_FR, DE_FR, DE_RU]);
    const ab = l.filter((x) => x.auffaellig);
    assert.equal(ab.length, 1);
    assert.equal(ab[0].id, 'A-5');
    assert.equal(ab[0].gruende[0].code, 'abweichende_sprachen');
    assert.match(ab[0].gruende[0].text, /Russisch/);
    assert.match(ab[0].gruende[0].text, /Französisch/);
    assert.equal(l[0].id, 'A-5', 'auffällige vor unauffälligen');
    assert.equal(ab[0].status, 'offen', 'Abweichung ist ein Hinweis, kein Fehler');
  });
  test('Montagelinie-Fall: Label ohne zweite Sprache ist auffällig', async () => {
    const l = await lade([DE_PL, DE_PL, DE_PL, NUR_DE]);
    const x = l.find((y) => y.id === 'A-4');
    assert.ok(x.auffaellig);
    assert.equal(x.gruende[0].code, 'abweichende_sprachen');
    assert.ok(l.filter((y) => y.id !== 'A-4').every((y) => !y.auffaellig));
  });
  test('Deutsch/Englisch unter Deutsch/Polnisch auffällig, aber Deutsch/Englisch-Anlage unauffällig', async () => {
    assert.ok((await lade([DE_PL, DE_PL, DE_EN])).find((y) => y.id === 'A-3').auffaellig);
    assert.ok((await lade([DE_EN, DE_EN, DE_EN])).every((y) => !y.auffaellig));
  });
  test('sehr kurzer Text ist auffällig mit Grund', async () => {
    const l = await lade([DE_PL, DE_PL, 'Achtung']);
    const x = l.find((y) => y.id === 'A-3');
    assert.ok(x.auffaellig);
    assert.ok(x.gruende.some((g: any) => g.code === 'text_unleserlich'));
  });
  test('jeder auffällige Grund ist ein Satz', async () => {
    const s = await server(await basisDb());
    try {
      for (const a of ['STA4', 'SWR5']) {
        for (const l of (await ruf(s, `/api/anlagen/${a}/labels`)).daten.labels) {
          for (const g of l.gruende) assert.match(g.text, /^\S.*[.!]$/, `${l.id}: ${g.text}`);
          if (l.auffaellig) assert.ok(l.gruende.length > 0);
        }
      }
    } finally { await s.zu(); }
  });
});

describe('AK-35 je Testlabel: Sprachen und Sicherheit (eigene Erwartung, nicht aus erwartung.json)', () => {
  const eigene: Record<string, string[] | 'unsicher' | 'fehlt'> = {
    'STA4-01': ['de', 'pl'], 'STA4-02': ['de', 'pl'], 'STA4-03': ['de', 'pl'], 'STA4-04': ['de', 'pl'], 'STA4-05': ['de', 'pl'],
    'STA4-06': ['de', 'pl'], 'STA4-07': ['de', 'en'], 'STA4-08': 'unsicher', 'STA4-09': 'unsicher', 'STA4-10': ['de', 'pl'],
    'FOE2-01': ['de', 'fr'], 'FOE2-02': ['de', 'fr'], 'FOE2-03': ['de', 'fr'], 'FOE2-04': ['de', 'fr'], 'FOE2-05': ['de', 'fr'],
    'SWR5-01': ['de', 'ru'], 'SWR5-02': ['de', 'ru'], 'SWR5-03': ['de', 'ru'], 'SWR5-04': ['de', 'ru'], 'SWR5-05': 'fehlt',
  };
  for (const [id, soll] of Object.entries(eigene)) {
    test(`${id}: ${Array.isArray(soll) ? soll.join('/') + ' je ≥ 90 %' : soll}`, async () => {
      const db = await basisDb();
      const l = holeLabels(db, id.split('-')[0]!).find((x) => x.id === id)!;
      if (soll === 'fehlt') {
        assert.equal(l.status, 'fehlt');
        assert.equal(l.bildPfad, null);
      } else if (soll === 'unsicher') {
        assert.equal(l.status, 'unsicher');
        assert.equal(l.prioritaet, 'genau_pruefen');
        assert.ok(l.sprachKonfidenz < 0.9 || l.ocrKonfidenz < 0.8);
      } else {
        assert.deepEqual([...l.sprachen].sort(), soll);
        for (const c of soll) assert.ok(l.konfidenzJeSprache[c]! >= 0.9, `${c} ${l.konfidenzJeSprache[c]}`);
      }
    });
  }
});
