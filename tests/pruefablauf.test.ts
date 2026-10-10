// AK-01, AK-02, AK-03, AK-10 bis AK-13, AK-19, AK-22, AK-45: Sperre, Prüfablauf, Reihenfolge, Auffälligkeit.

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { holeAnlage, holeEntscheidungen, holeLabel, holeLabels } from '../src/db/abfragen.ts';
import { bessereNach, bestaetigeLabel, Fachfehler, gebeAnlageFrei, meldeFehler } from '../src/db/aktionen.ts';
import { istGesperrt, PRUEFBAR, pruefeFreigabe, STATUS, type Status } from '../src/db/status.ts';
import { anlageAnsicht, bewerteLabels, labelsFuerMax, zusammenfassung } from '../src/server/ansichten.ts';
import { erwartungen, neueDatenbank, WURZEL } from './hilfen.ts';

const erwartet = erwartungen();
const fachfehler = (status: number) => (f: unknown) => f instanceof Fachfehler && f.status === status;

describe('AK-01 Sperre, solange ein Label nicht bestätigt ist', () => {
  for (const status of STATUS.filter((s) => s !== 'bestaetigt')) {
    test(`„${status}“ hält die Anlage gesperrt`, () => {
      const labels = [
        { id: 'A-1', status: 'bestaetigt' as Status },
        { id: 'A-2', status },
      ];
      assert.equal(pruefeFreigabe(2, labels).moeglich, false);
      assert.equal(istGesperrt('2026-10-10T10:00:00Z', 2, labels), true, 'auch mit gespeichertem Freigabedatum');
    });
  }
  test('alle bestätigt und vollständig erfasst: Freigabe möglich', () => {
    const labels = [{ id: 'A-1', status: 'bestaetigt' as Status }, { id: 'A-2', status: 'bestaetigt' as Status }];
    assert.equal(pruefeFreigabe(2, labels).moeglich, true);
    assert.equal(istGesperrt(null, 2, labels), true, 'bis Max freigibt, bleibt sie gesperrt');
    assert.equal(istGesperrt('2026-10-10T10:00:00Z', 2, labels), false);
  });
  test('AK-45 weniger Labels als laut Anlagenliste: gesperrt', () => {
    const pruefung = pruefeFreigabe(3, [{ id: 'A-1', status: 'bestaetigt' }, { id: 'A-2', status: 'bestaetigt' }]);
    assert.equal(pruefung.moeglich, false);
    assert.match(pruefung.hinderungsgruende[0]!.text, /nicht erfasst/);
  });
  test('Ausgangslage: nur die vollständig bestätigte Anlage ist freigegeben', async () => {
    const db = await neueDatenbank();
    const gesperrt = Object.fromEntries(
      ['STA4', 'FOE2', 'SWR5'].map((id) => [id, anlageAnsicht(holeAnlage(db, id)!, holeLabels(db, id)).gesperrt]),
    );
    assert.deepEqual(gesperrt, { STA4: true, FOE2: false, SWR5: true });
  });
  test('das Label ohne Foto steht auf „Fehlt“ und hält Schweißroboter 5 gesperrt', async () => {
    const db = await neueDatenbank();
    assert.equal(holeLabel(db, 'SWR5-05')!.status, 'fehlt');
    assert.throws(() => gebeAnlageFrei(db, 'SWR5', 'max'), fachfehler(409));
  });
});

describe('AK-02 Freigabe nur durch Max und nur nach Serverprüfung', () => {
  test('Freigabe scheitert, solange Labels offen sind, und nennt die offenen Punkte', async () => {
    const db = await neueDatenbank();
    assert.throws(
      () => gebeAnlageFrei(db, 'STA4', 'max'),
      (f: unknown) => f instanceof Fachfehler && f.status === 409 && Array.isArray(f.details) && f.details.length === 9,
    );
    assert.equal(holeAnlage(db, 'STA4')!.freigegebenAm, null);
  });
  test('Zusammenfassung vor der Freigabe, dann Freigabe mit Protokoll', async () => {
    const db = await neueDatenbank();
    for (const l of holeLabels(db, 'STA4').filter((l) => PRUEFBAR.includes(l.status))) bestaetigeLabel(db, l.id, 'max');
    const z = zusammenfassung(holeAnlage(db, 'STA4')!, holeLabels(db, 'STA4'));
    assert.equal(z.freigabeMoeglich, true);
    assert.equal(z.anzahlLabels, 10);
    assert.deepEqual(z.sprachen.map((s) => s.code), ['de', 'en', 'pl']);
    assert.equal(z.auffaellig, 3);
    assert.equal(z.nachgebessert, 0);
    assert.deepEqual(z.offenePunkte, []);

    const anlage = gebeAnlageFrei(db, 'STA4', 'max', new Date('2026-10-10T12:00:00Z'));
    assert.equal(anlage.freigegebenVon, 'max');
    assert.equal(anlageAnsicht(anlage, holeLabels(db, 'STA4')).gesperrt, false);
    const eintrag = db.prepare("SELECT * FROM entscheidungen WHERE anlage_id = 'STA4' AND ergebnis = 'freigegeben'").get() as Record<string, unknown>;
    assert.equal(eintrag.wer, 'max');
    assert.equal(eintrag.wann, '2026-10-10T12:00:00.000Z');
    assert.throws(() => gebeAnlageFrei(db, 'STA4', 'max'), fachfehler(409), 'nicht doppelt');
  });
});

describe('AK-03 die KI entscheidet nie', () => {
  test('nach dem Einspielen ist nur bestätigt, was Max schon bestätigt hatte', async () => {
    const db = await neueDatenbank();
    for (const id of Object.keys(erwartet)) {
      assert.equal(holeLabel(db, id)!.status, erwartet[id]!.status, id);
    }
    const wer = db.prepare('SELECT DISTINCT wer FROM entscheidungen').all() as { wer: string }[];
    assert.deepEqual(wer.map((w) => w.wer).sort(), ['max', 'simulation']);
  });
  test('der KI-Code kann keine Entscheidungen schreiben', () => {
    const ordner = join(WURZEL, 'src', 'ai');
    for (const datei of readdirSync(ordner)) {
      const code = readFileSync(join(ordner, datei), 'utf8');
      assert.doesNotMatch(code, /from '\.\.\/(db|server)\//, datei);
      assert.doesNotMatch(code, /UPDATE|INSERT/, datei);
    }
  });
});

describe('AK-10, AK-11, AK-12, AK-22 Prüfen, Melden, Nachbessern', () => {
  test('Bestätigen ändert genau ein Label und wird protokolliert', async () => {
    const db = await neueDatenbank();
    const vorher = holeLabels(db, 'STA4').map((l) => [l.id, l.status]);
    bestaetigeLabel(db, 'STA4-01', 'max', new Date('2026-10-10T09:00:00Z'));
    const nachher = holeLabels(db, 'STA4').map((l) => [l.id, l.status]);
    const geaendert = nachher.filter(([id, s], i) => vorher[i]![1] !== s).map(([id]) => id);
    assert.deepEqual(geaendert, ['STA4-01']);
    const [eintrag] = holeEntscheidungen(db, 'STA4-01');
    assert.deepEqual(
      { wer: eintrag!.wer, wann: eintrag!.wann, ergebnis: eintrag!.ergebnis },
      { wer: 'max', wann: '2026-10-10T09:00:00.000Z', ergebnis: 'bestaetigt' },
    );
  });
  test('Fehler melden braucht einen der drei Gründe', async () => {
    const db = await neueDatenbank();
    assert.throws(() => meldeFehler(db, 'STA4-01', undefined, 'max'), fachfehler(400));
    assert.throws(() => meldeFehler(db, 'STA4-01', 'gefällt mir nicht', 'max'), fachfehler(400));
    for (const grund of ['unleserlich', 'sprache_falsch', 'beschaedigt']) {
      const db2 = await neueDatenbank();
      assert.equal(meldeFehler(db2, 'STA4-01', grund, 'max').status, 'fehlerhaft');
    }
  });
  test('Max bearbeitet keinen Text: Aktionen ändern weder OCR-Text noch Sprachvorschlag', async () => {
    const db = await neueDatenbank();
    const vorher = holeLabel(db, 'STA4-01')!;
    bestaetigeLabel(db, 'STA4-01', 'max');
    const nachher = holeLabel(db, 'STA4-01')!;
    assert.equal(nachher.ocrText, vorher.ocrText);
    assert.deepEqual(nachher.sprachen, vorher.sprachen);
  });
  test('Kreislauf: melden → fehlerhaft → nachgebessert → bestätigt', async () => {
    const db = await neueDatenbank();
    meldeFehler(db, 'STA4-02', 'sprache_falsch', 'max');
    assert.equal(holeLabel(db, 'STA4-02')!.status, 'fehlerhaft');
    const offen = labelsFuerMax(holeLabels(db, 'STA4')).filter((l) => PRUEFBAR.includes(l.status));
    assert.ok(!offen.some((l) => l.id === 'STA4-02'), 'nicht in Max\' offener Liste');
    assert.throws(() => bestaetigeLabel(db, 'STA4-02', 'max'), fachfehler(409), 'erst nachbessern');

    const label = await bessereNach(db, 'STA4-02');
    assert.equal(label.status, 'nachgebessert');
    assert.equal(label.letzterFehlergrund, 'sprache_falsch', 'Max\' Hinweis bleibt sichtbar');
    assert.equal(labelsFuerMax(holeLabels(db, 'STA4'))[0]!.id, 'STA4-02', 'steht ganz oben');
    assert.equal(anlageAnsicht(holeAnlage(db, 'STA4')!, holeLabels(db, 'STA4')).bestaetigt, 1, 'zählt als offen');

    bestaetigeLabel(db, 'STA4-02', 'max');
    const verlauf = holeEntscheidungen(db, 'STA4-02').map((e) => `${e.wer}:${e.ergebnis}:${e.grund ?? ''}`);
    assert.deepEqual(verlauf, ['max:fehler:sprache_falsch', 'simulation:nachgebessert:', 'max:bestaetigt:']);
  });
  test('Nachbesserung mit neuem Foto: Erkennung läuft neu', async () => {
    const db = await neueDatenbank();
    assert.equal(holeLabel(db, 'SWR5-02')!.ocrKonfidenz, 0.85);
    const label = await bessereNach(db, 'SWR5-02');
    assert.equal(label.ocrKonfidenz, 0.97);
    assert.equal(label.korrektur, null);
    assert.deepEqual(label.sprachen, ['de', 'ru']);
  });
  test('nur fehlerhafte Labels können nachgebessert werden', async () => {
    const db = await neueDatenbank();
    await assert.rejects(bessereNach(db, 'STA4-01'), fachfehler(409));
    await assert.rejects(bessereNach(db, 'GIBT-ES-NICHT'), fachfehler(404));
  });
  test('Bestätigte und fehlende Labels lassen sich nicht erneut prüfen', async () => {
    const db = await neueDatenbank();
    assert.throws(() => bestaetigeLabel(db, 'STA4-10', 'max'), fachfehler(409));
    assert.throws(() => meldeFehler(db, 'STA4-10', 'beschaedigt', 'max'), fachfehler(409));
    assert.throws(() => bestaetigeLabel(db, 'SWR5-05', 'max'), fachfehler(409));
  });
  test('eine Meldung hebt eine gespeicherte Freigabe auf', async () => {
    const db = await neueDatenbank();
    db.prepare("UPDATE anlagen SET freigegeben_am = '2026-10-10T10:00:00Z', freigegeben_von = 'max' WHERE id = 'STA4'").run();
    meldeFehler(db, 'STA4-01', 'beschaedigt', 'max');
    assert.equal(holeAnlage(db, 'STA4')!.freigegebenAm, null);
  });
});

describe('AK-13, AK-32 Reihenfolge in Max\' Liste', () => {
  test('R1: fehlerhafte und fehlende Labels stehen nicht in Max\' Liste', async () => {
    const db = await neueDatenbank();
    const ids = labelsFuerMax(holeLabels(db, 'SWR5')).map((l) => l.id);
    assert.deepEqual(ids, ['SWR5-03', 'SWR5-01', 'SWR5-04']);
    meldeFehler(db, 'STA4-02', 'beschaedigt', 'max');
    assert.ok(!labelsFuerMax(holeLabels(db, 'STA4')).some((l) => l.id === 'STA4-02'));
  });
  test('Nachgebessert vor Unsicher vor Offen, Erledigtes am Ende', async () => {
    const db = await neueDatenbank();
    const rang: Record<Status, number> = { nachgebessert: 0, unsicher: 1, offen: 2, bestaetigt: 3, fehlerhaft: 4, fehlt: 5 };
    for (const anlage of ['STA4', 'FOE2', 'SWR5']) {
      const liste = labelsFuerMax(holeLabels(db, anlage));
      for (let i = 1; i < liste.length; i++) assert.ok(rang[liste[i - 1]!.status] <= rang[liste[i]!.status], anlage);
    }
    assert.equal(labelsFuerMax(holeLabels(db, 'SWR5'))[0]!.id, 'SWR5-03');
  });
  test('Labels mit „genau prüfen“ stehen vor allen anderen offenen', async () => {
    const db = await neueDatenbank();
    const offen = labelsFuerMax(holeLabels(db, 'STA4')).filter((l) => PRUEFBAR.includes(l.status));
    const ersteNormale = offen.findIndex((l) => l.prioritaet === 'normal');
    assert.ok(ersteNormale > 0);
    assert.ok(offen.slice(ersteNormale).every((l) => l.prioritaet === 'normal'));
    assert.deepEqual(offen.slice(0, ersteNormale).map((l) => l.id), ['STA4-08', 'STA4-09', 'STA4-07']);
  });
});

describe('AK-19 Auffälligkeit mit Grund, ein Test je Testlabel', () => {
  for (const [id, e] of Object.entries(erwartet)) {
    test(`${id}: ${e.auffaellig.length === 0 ? 'unauffällig' : e.auffaellig.join(', ')}`, async () => {
      const db = await neueDatenbank();
      const anlageId = holeLabel(db, id)!.anlageId;
      const bewertung = bewerteLabels(holeLabels(db, anlageId)).get(id)!;
      assert.equal(bewertung.auffaellig, e.auffaellig.length > 0);
      assert.deepEqual(bewertung.gruende.map((g) => g.code).sort(), [...e.auffaellig].sort());
      for (const g of bewertung.gruende) assert.match(g.text, /^[A-ZÄÖÜ].*\.$/, 'ein ganzer Satz');
    });
  }
  test('zweisprachig allein ist nicht auffällig', async () => {
    const db = await neueDatenbank();
    const bewertung = bewerteLabels(holeLabels(db, 'STA4'));
    for (const id of ['STA4-01', 'STA4-02', 'STA4-03', 'STA4-04', 'STA4-05', 'STA4-06']) {
      assert.equal(holeLabel(db, id)!.sprachen.length, 2);
      assert.equal(bewertung.get(id)!.auffaellig, false, id);
    }
  });
  test('der Grund für die Abweichung nennt beide Sprachkombinationen', async () => {
    const db = await neueDatenbank();
    const grund = bewerteLabels(holeLabels(db, 'STA4')).get('STA4-07')!.gruende[0]!.text;
    assert.match(grund, /hier Deutsch und Englisch, sonst Deutsch und Polnisch/);
  });
});
