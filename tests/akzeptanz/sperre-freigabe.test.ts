// Test-Agent Stufe 1 · AK-01, AK-02, AK-03, AK-22, AK-45

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { Testdaten } from '../../src/db/datenbank.ts';
import { holeAnlage, holeEntscheidungen, holeLabels } from '../../src/db/abfragen.ts';
import { basisDb, DE_PL, eigeneDb, ruf, server } from './hilfe.ts';

/** Anlage X mit 3 Labels; das erste bekommt den gewünschten Ausgangszustand. */
function anlageMit(erstes: Partial<Testdaten['labels'][number]>, soll = 3): Testdaten {
  const basis = (n: number) => ({ id: `X-0${n}`, anlageId: 'X', bild: `STA4-0${n}.svg`, ocrText: DE_PL, ocrKonfidenz: 0.95,
    ausgangszustand: { status: 'bestaetigt' as const, am: '2026-10-09T10:00:00.000Z' } });
  return {
    anlagen: [{ id: 'X', name: 'Testanlage X', sollAnzahl: soll }],
    labels: [{ ...basis(1), ausgangszustand: undefined, ...erstes }, basis(2), basis(3)],
  };
}

describe('AK-01 jedes nicht bestätigte Label hält die Anlage gesperrt (Server-Aufruf)', () => {
  const faelle: [string, Partial<Testdaten['labels'][number]>, string][] = [
    ['Offen', {}, 'offen'],
    ['Unsicher (OCR 0,79)', { ocrKonfidenz: 0.79 }, 'unsicher'],
    ['Nachgebessert', { ausgangszustand: { status: 'nachgebessert', fehlergrund: 'beschaedigt', am: '2026-10-09T10:00:00.000Z' } }, 'nachgebessert'],
    ['Fehlerhaft', { ausgangszustand: { status: 'fehlerhaft', fehlergrund: 'unleserlich', am: '2026-10-09T10:00:00.000Z' } }, 'fehlerhaft'],
    ['Fehlt (kein Foto)', { bild: null, ocrText: '', ocrKonfidenz: 0 }, 'fehlt'],
  ];
  for (const [name, erstes, status] of faelle) {
    test(`${name}: gesperrt, Freigabe per POST → 409`, async () => {
      const db = await eigeneDb(anlageMit(erstes));
      const s = await server(db);
      try {
        const labels = await ruf(s, '/api/anlagen/X/labels');
        // Seit R1 stehen Fehlerhaft und Fehlt nicht in Max' Liste, sondern in „ausserhalbDerPruefung“.
        const ausserhalb = ['fehlerhaft', 'fehlt'].includes(status);
        const liste = ausserhalb ? labels.daten.ausserhalbDerPruefung : labels.daten.labels;
        const andere = ausserhalb ? labels.daten.labels : labels.daten.ausserhalbDerPruefung;
        assert.equal(liste.find((l: any) => l.id === 'X-01').status, status);
        assert.ok(!andere.some((l: any) => l.id === 'X-01'));
        assert.equal(labels.daten.anlage.gesperrt, true);
        assert.equal(labels.daten.anlage.freigabeMoeglich, false);
        const frei = await ruf(s, '/api/anlagen/X/freigeben', { methode: 'POST', rolle: 'max' });
        assert.equal(frei.status, 409);
        assert.equal(holeAnlage(db, 'X')!.freigegebenAm, null);
      } finally { await s.zu(); }
    });
  }

  test('AK-45 Label fehlt ganz (2 von 3 laut Anlagenliste): gesperrt trotz aller bestätigt', async () => {
    const daten = anlageMit({ ausgangszustand: { status: 'bestaetigt', am: '2026-10-09T10:00:00.000Z' } });
    daten.labels.pop();
    const db = await eigeneDb(daten);
    const s = await server(db);
    try {
      const a = (await ruf(s, '/api/anlagen')).daten[0];
      assert.equal(a.gesperrt, true);
      assert.equal(a.zaehlung.fehlt, 1);
      const frei = await ruf(s, '/api/anlagen/X/freigeben', { methode: 'POST', rolle: 'max' });
      assert.equal(frei.status, 409);
      assert.match(JSON.stringify(frei.daten), /nicht erfasst/);
    } finally { await s.zu(); }
  });

  test('Ausgangslage: STA4 und SWR5 gesperrt, FOE2 freigegeben', async () => {
    const s = await server(await basisDb());
    try {
      const a = Object.fromEntries((await ruf(s, '/api/anlagen')).daten.map((x: any) => [x.id, x.gesperrt]));
      assert.deepEqual(a, { STA4: true, FOE2: false, SWR5: true });
    } finally { await s.zu(); }
  });
});

describe('AK-02 Zusammenfassung und Freigabe nur bei allen bestätigt', () => {
  test('letztes Label bestätigt → Zusammenfassung ohne offene Punkte → Freigabe → entsperrt', async () => {
    const db = await eigeneDb(anlageMit({}));
    const s = await server(db);
    try {
      const vorher = await ruf(s, '/api/anlagen/X/zusammenfassung');
      assert.equal(vorher.daten.freigabeMoeglich, false);
      assert.equal(vorher.daten.offenePunkte.length, 1);
      assert.equal((await ruf(s, '/api/labels/X-01/bestaetigen', { methode: 'POST', rolle: 'max' })).status, 200);
      // Bestätigen allein entsperrt nicht (Freigabe per Klick, Widerspruch 1).
      assert.equal((await ruf(s, '/api/anlagen')).daten[0].gesperrt, true);
      const z = (await ruf(s, '/api/anlagen/X/zusammenfassung')).daten;
      assert.equal(z.anzahlLabels, 3);
      assert.deepEqual(z.sprachen.map((x: any) => x.code), ['de', 'pl']);
      assert.equal(typeof z.auffaellig, 'number');
      assert.equal(typeof z.nachgebessert, 'number');
      assert.deepEqual(z.offenePunkte, []);
      assert.equal(z.freigabeMoeglich, true);
      const frei = await ruf(s, '/api/anlagen/X/freigeben', { methode: 'POST', rolle: 'max' });
      assert.equal(frei.status, 200);
      assert.equal(frei.daten.gesperrt, false);
      assert.equal((await ruf(s, '/api/anlagen/X/freigeben', { methode: 'POST', rolle: 'max' })).status, 409, 'doppelte Freigabe');
    } finally { await s.zu(); }
  });

  test('Freigabe einer unbekannten Anlage → 404', async () => {
    const s = await server(await basisDb());
    try {
      assert.equal((await ruf(s, '/api/anlagen/GIBTSNICHT/freigeben', { methode: 'POST', rolle: 'max' })).status, 404);
    } finally { await s.zu(); }
  });
});

describe('AK-03 die KI entscheidet nichts', () => {
  test('nach dem Einspielen sind nur vorbelegte Ausgangszustände bestätigt, keine Freigabe durch „ki“', async () => {
    const db = await basisDb();
    for (const a of ['STA4', 'FOE2', 'SWR5']) {
      for (const l of holeLabels(db, a)) {
        for (const e of holeEntscheidungen(db, l.id)) {
          assert.ok(['max', 'simulation'].includes(e.wer), `${l.id}: ${e.wer}`);
          if (e.ergebnis === 'bestaetigt' || e.ergebnis === 'fehler') assert.equal(e.wer, 'max');
        }
      }
    }
    // Sicherer, unauffälliger Vorschlag (STA4-01) bleibt „Offen“, die KI bestätigt nicht.
    assert.equal(holeLabels(db, 'STA4').find((l) => l.id === 'STA4-01')!.status, 'offen');
  });
});

describe('AK-22 jede Entscheidung wird gespeichert', () => {
  test('Bestätigen, Melden, Nachbessern, Freigeben: wer, wann, Ergebnis, Grund', async () => {
    const db = await eigeneDb(anlageMit({}));
    const s = await server(db);
    try {
      await ruf(s, '/api/labels/X-01/fehler', { methode: 'POST', rolle: 'max', koerper: { grund: 'sprache_falsch' } });
      await ruf(s, '/api/labels/X-01/nachbessern', { methode: 'POST', rolle: 'max' });
      await ruf(s, '/api/labels/X-01/bestaetigen', { methode: 'POST', rolle: 'max' });
      await ruf(s, '/api/anlagen/X/freigeben', { methode: 'POST', rolle: 'max' });
      const e = holeEntscheidungen(db, 'X-01');
      assert.deepEqual(e.map((x) => [x.wer, x.ergebnis, x.grund]), [
        ['max', 'fehler', 'sprache_falsch'], ['simulation', 'nachgebessert', null], ['max', 'bestaetigt', null],
      ]);
      for (const x of e) assert.ok(!Number.isNaN(Date.parse(x.wann)));
      const frei = db.prepare("SELECT wer, ergebnis FROM entscheidungen WHERE label_id IS NULL AND anlage_id = 'X'").all();
      assert.deepEqual(frei.map((z: any) => [z.wer, z.ergebnis]), [['max', 'freigegeben']]);
    } finally { await s.zu(); }
  });
});
