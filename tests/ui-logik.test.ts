// Oberfläche, reine Funktionen (logik.ts, status.ts, route.ts) mit echten Antworten des Servers.

import assert from 'node:assert/strict';
import { before, describe, test } from 'node:test';
import type { AnlageMitLabels } from '../src/ui/api.ts';
import {
  ablauf, ersteWoerter, filtere, hauptgrund, naechstesLabel, ordneStabil, prozent, sichereBildUrl, sperrgrund, sprachenKurz,
  sprachZeile, textStuecke, einzelneBuchstaben, zaehlzeile, fortschritt, unsichereSprachen, FEHLERGRUENDE, type Ablauf,
  type AblaufEreignis,
} from '../src/ui/pruefung/logik.ts';
import { leseRoute, zumLabel, zurAnlage } from '../src/ui/route.ts';
import { PRUEFBAR, sperreAnzeige, STATUS_ANZEIGE } from '../src/ui/status.ts';
import { prozent as prozentServer } from '../src/ai/auffaelligkeit.ts';
import { STATUS } from '../src/db/status.ts';
import { json, mitServer } from './ui-hilfe.ts';

let sta4: AnlageMitLabels;
let swr5: AnlageMitLabels;
let sta4NachSta407: AnlageMitLabels;
const label = (d: AnlageMitLabels, id: string) => [...d.labels, ...d.ausserhalbDerPruefung].find((l) => l.id === id)!;

before(async () => {
  await mitServer(async (s) => {
    sta4 = await json(s, '/api/anlagen/STA4/labels');
    swr5 = await json(s, '/api/anlagen/SWR5/labels');
    await json(s, '/api/labels/STA4-07/bestaetigen', 'POST');
    sta4NachSta407 = await json(s, '/api/anlagen/STA4/labels');
  });
});

describe('AK-14 Status: Wort und eigene Farbe', () => {
  test('alle sechs Status haben ein eigenes Wort und eine eigene Farbe', () => {
    assert.deepEqual(Object.keys(STATUS_ANZEIGE).sort(), [...STATUS].sort());
    const woerter = Object.values(STATUS_ANZEIGE).map((a) => a.wort);
    const farben = Object.values(STATUS_ANZEIGE).map((a) => a.klasse.match(/\bbg-[a-z]+-\d+/)![0]);
    assert.equal(new Set(woerter).size, 6);
    assert.equal(new Set(farben).size, 6, 'jede Farbe nur einmal');
    assert.deepEqual(woerter, ['Offen', 'Unsicher', 'Nachgebessert', 'Fehlerhaft', 'Bestätigt', 'Fehlt']);
  });
  test('Gesperrt und Freigegeben folgen nur dem Wert des Servers (AK-01)', () => {
    assert.equal(sperreAnzeige(true).wort, 'Gesperrt');
    assert.equal(sperreAnzeige(false).wort, 'Freigegeben');
  });
  test('prüfbar sind dieselben Status wie auf dem Server', () => {
    assert.deepEqual([...PRUEFBAR], ['offen', 'unsicher', 'nachgebessert']);
  });
});

describe('AK-17, AK-12 Zählzeile und Fortschritt', () => {
  test('Stanzanlage 4 zu Beginn: „10 Labels: 3 auffällig, 6 unauffällig, 1 bestätigt“', () => {
    assert.equal(zaehlzeile(sta4.anlage), '10 Labels: 3 auffällig, 6 unauffällig, 1 bestätigt');
    assert.equal(fortschritt(sta4.anlage).text, '1 von 10 bestätigt');
    assert.equal(fortschritt(sta4.anlage).prozent, 10);
  });
  test('Schweißroboter 5: Nachbesserung und fehlendes Foto stehen mit in der Zeile, die Summe ist 5', () => {
    const zeile = zaehlzeile(swr5.anlage);
    assert.equal(zeile, '5 Labels: 1 auffällig, 1 unauffällig, 1 bestätigt, 1 wartet auf Nachbesserung, 1 ohne Foto');
    const summe = [...zeile.split(':')[1]!.matchAll(/(\d+) /g)].reduce((s, m) => s + Number(m[1]), 0);
    assert.equal(summe, swr5.anlage.sollAnzahl);
  });
  // Ob Nachgebessertes als offen zählt, prüft ui-ansichten mit echten Serverdaten („der Fortschritt zählt Nachgebessertes als offen“).
  test('der Fortschrittstext entsteht nur aus den Zahlen des Servers', () => {
    const a = { ...sta4.anlage, bestaetigt: 14, sollAnzahl: 15 };
    assert.equal(fortschritt(a).text, '14 von 15 bestätigt');
  });
});

describe('AK-18 Filter „Nur auffällige“', () => {
  test('Stanzanlage 4: 3 auffällige sichtbar, 7 ausgeblendet', () => {
    const { sichtbar, ausgeblendet } = filtere(sta4.labels, true);
    assert.deepEqual(sichtbar.map((l) => l.id), ['STA4-08', 'STA4-09', 'STA4-07']);
    assert.equal(ausgeblendet, 7);
  });
  test('nach dem Bestätigen von STA4-07: 2 auffällig, 8 ausgeblendet', () => {
    const { sichtbar, ausgeblendet } = filtere(sta4NachSta407.labels, true);
    assert.equal(sichtbar.length, 2);
    assert.equal(ausgeblendet, 8);
  });
  test('„Alle“ blendet nichts aus', () => {
    assert.equal(filtere(sta4.labels, false).ausgeblendet, 0);
  });
});

describe('AK-13 Reihenfolge', () => {
  test('„Prüfung starten“ öffnet das relevanteste Label in der Reihenfolge des Servers', () => {
    assert.equal(naechstesLabel(sta4.labels)!.id, 'STA4-08');
    assert.equal(naechstesLabel(sta4.labels, 'STA4-08')!.id, 'STA4-09');
    assert.equal(naechstesLabel(swr5.labels)!.id, 'SWR5-03', 'Nachgebessert zuerst');
  });
  test('Kacheln behalten ihren Platz nach dem Bestätigen, bis die Übersicht neu geöffnet wird', () => {
    const vorher = sta4.labels.map((l) => l.id);
    assert.notDeepEqual(sta4NachSta407.labels.map((l) => l.id), vorher, 'der Server sortiert neu');
    assert.deepEqual(ordneStabil(sta4NachSta407.labels, vorher).map((l) => l.id), vorher);
    assert.deepEqual(ordneStabil(sta4NachSta407.labels, null).map((l) => l.id), sta4NachSta407.labels.map((l) => l.id));
  });
  test('neue Labels kommen ans Ende, verschwundene fallen weg', () => {
    const ids = ordneStabil(sta4.labels.slice(1), ['STA4-09', 'GIBT-ES-NICHT']).map((l) => l.id);
    assert.equal(ids[0], 'STA4-09');
    assert.equal(ids.length, 9);
  });
});

describe('AK-19 ein Grund je Kachel', () => {
  test('STA4-08 nennt einen Satz und „und 2 weitere Gründe“', () => {
    const g = hauptgrund(label(sta4, 'STA4-08').gruende)!;
    assert.match(g.text, /^[^.]+\.$/, 'genau ein Satz');
    assert.equal(g.weitere, 'und 2 weitere Gründe');
  });
  test('Rangfolge: nachgebessert vor Sprache vor Texterkennung vor kurzem Text vor Abweichung', () => {
    const g = (code: string) => ({ code: code as any, text: code + '.' });
    assert.equal(hauptgrund([g('abweichende_sprachen'), g('unsicher_ocr'), g('nachgebessert')])!.text, 'nachgebessert.');
    assert.equal(hauptgrund([g('text_unleserlich'), g('unsicher_sprache')])!.weitere, 'und 1 weiterer Grund');
    assert.equal(hauptgrund([]), null);
  });
});

describe('AK-15, AK-16 Sprachen und Prozent', () => {
  test('STA4-09: „Deutsch 95 % – sicher erkannt“, Russisch und Polnisch „nicht sicher“', () => {
    const l = label(sta4, 'STA4-09');
    assert.deepEqual(l.sprachen.map(sprachZeile), ['Deutsch 95 % – sicher erkannt', 'Russisch 50 % – nicht sicher', 'Polnisch 87 % – nicht sicher']);
    assert.equal(sprachenKurz(l), 'Deutsch 95 %, Russisch 50 %, Polnisch 87 %');
    assert.deepEqual([...unsichereSprachen(l)].sort(), ['pl', 'ru']);
  });
  test('STA4-08: „Keine Sprache erkannt“', () => {
    assert.equal(sprachenKurz(label(sta4, 'STA4-08')), 'Keine Sprache erkannt');
  });
  test('0,896 erscheint nie als „90 %“; Oberfläche und Server runden gleich', () => {
    for (const wert of [0, 0.29, 0.34, 0.5, 0.57, 0.796, 0.799, 0.87, 0.896, 0.8999, 0.9, 0.95, 0.99, 1]) {
      assert.equal(prozent(wert), prozentServer(wert), String(wert));
    }
    assert.equal(prozent(0.896), '89 %');
    assert.equal(prozent(0.8999), '89 %');
  });
});

describe('AK-20 Textstücke für Markierungen', () => {
  const zusammen = (s: { text: string }[]) => s.map((x) => x.text).join('');
  test('alle Labels: die Stücke ergeben genau den Text', () => {
    for (const l of [...sta4.labels, ...swr5.labels]) {
      assert.equal(zusammen(textStuecke(l.ocrText, l.belege)), l.ocrText, l.id);
      assert.equal(zusammen(textStuecke(l.ocrText, l.belege, unsichereSprachen(l))), l.ocrText, l.id);
    }
  });
  test('verschachtelt: „Hände“ bleibt ein Wort, das „ä“ darin wird nicht extra markiert', () => {
    const text = 'Hände fernhalten';
    const belege = [
      { sprache: 'de' as const, art: 'zeichen' as const, text: 'ä', start: 1, ende: 2 },
      { sprache: 'de' as const, art: 'wort' as const, text: 'Hände', start: 0, ende: 5 },
    ];
    const s = textStuecke(text, belege);
    assert.deepEqual(s.map((x) => [x.text, x.beleg?.art ?? null]), [['Hände', 'wort'], [' fernhalten', null]]);
    assert.equal(einzelneBuchstaben(s), 0);
  });
  test('mit einem Emoji davor stimmen die Positionen (UTF-16 wie auf dem Server)', () => {
    const text = '⚠️ Hände';
    const start = text.indexOf('Hände');
    const s = textStuecke(text, [{ sprache: 'de', art: 'wort', text: 'Hände', start, ende: start + 5 }]);
    assert.equal(zusammen(s), text);
    assert.equal(s.find((x) => x.beleg)!.text, 'Hände');
  });
  test('jede Markierung hat eine Sprache; STA4-09 hat einzelne kyrillische Buchstaben', () => {
    const l = label(sta4, 'STA4-09');
    const s = textStuecke(l.ocrText, l.belege);
    for (const x of s.filter((y) => y.beleg)) assert.match(x.beleg!.sprache, /^(de|en|pl|fr|ru)$/);
    assert.ok(s.some((x) => x.beleg?.sprache === 'ru' && x.beleg.art === 'zeichen'));
    assert.ok(einzelneBuchstaben(s) > 0);
  });
  test('ungültige Positionen werden übergangen', () => {
    const s = textStuecke('abc', [{ sprache: 'de', art: 'wort', text: 'x', start: 2, ende: 9 }]);
    assert.deepEqual(s, [{ text: 'abc', beleg: null }]);
  });
});

describe('AK-11 Entscheidungsablauf sperrt Doppelentscheidungen', () => {
  const lauf = (start: Ablauf, ereignisse: AblaufEreignis[]) => {
    let z = start;
    let gesendet = 0;
    for (const e of ereignisse) {
      const r = ablauf(z, e);
      z = r.zustand;
      if (r.senden) gesendet++;
    }
    return { z, gesendet };
  };
  test('zwei Bestätigungen hintereinander senden genau einmal', () => {
    assert.equal(lauf('bereit', ['bestaetigen', 'bestaetigen']).gesendet, 1);
  });
  test('Bestätigen, bevor das nächste Label angezeigt ist, sendet nichts', () => {
    assert.equal(lauf('bereit', ['bestaetigen', 'gespeichert', 'bestaetigen', 'bestaetigen']).gesendet, 1);
    assert.equal(lauf('laedt', ['bestaetigen', 'melden', 'grundGewaehlt', 'zuruecknehmen']).gesendet, 0);
  });
  test('Melden: erst Grund wählen; Abbrechen sendet nichts; zweiter Grund sendet nicht noch einmal', () => {
    assert.deepEqual(lauf('bereit', ['melden', 'abbrechen']), { z: 'bereit', gesendet: 0 });
    assert.deepEqual(lauf('bereit', ['melden', 'grundGewaehlt', 'grundGewaehlt', 'bestaetigen']), { z: 'speichert', gesendet: 1 });
  });
  test('nach einem Fehler des Servers ist wieder eine Entscheidung möglich', () => {
    assert.equal(lauf('bereit', ['bestaetigen', 'fehlgeschlagen', 'bestaetigen']).gesendet, 2);
  });
  test('nach dem Anzeigen des nächsten Labels geht es weiter', () => {
    assert.equal(lauf('bereit', ['bestaetigen', 'gespeichert', 'angezeigt', 'bestaetigen']).gesendet, 2);
  });
});

describe('AK-10 Gründe beim Melden', () => {
  test('genau drei Gründe mit Erklärung', () => {
    assert.deepEqual(FEHLERGRUENDE.map((g) => g.grund), ['unleserlich', 'sprache_falsch', 'beschaedigt']);
    for (const g of FEHLERGRUENDE) assert.ok(g.titel.length > 0 && g.erklaerung.length > 0);
  });
});

describe('Kleinigkeiten', () => {
  test('erste Wörter und leerer Text', () => {
    assert.equal(ersteWoerter('a b c d e f g h'), 'a b c d e f …');
    assert.equal(ersteWoerter('a b'), 'a b');
    assert.equal(ersteWoerter('  '), 'Kein Text erkannt');
  });
  test('nur Fotos unter /bilder/ werden angezeigt', () => {
    assert.equal(sichereBildUrl('/bilder/STA4-01.svg'), '/bilder/STA4-01.svg');
    for (const url of ['javascript:alert(1)', 'https://example.org/x.svg', '/bilder/../x.svg', '/bilder/x.svg?a', null]) {
      assert.equal(sichereBildUrl(url), null, String(url));
    }
  });
  test('Gründe für „Warum noch gesperrt?“', () => {
    assert.equal(sperrgrund(label(swr5, 'SWR5-02')), 'Label SWR5-02 wartet auf Nachbesserung (von Ihnen gemeldet: Label beschädigt).');
    assert.equal(sperrgrund(label(swr5, 'SWR5-05')), 'Label SWR5-05: kein Foto vorhanden.');
  });
  test('Adressen', () => {
    assert.deepEqual(leseRoute(''), { seite: 'start' });
    assert.deepEqual(leseRoute(zurAnlage('STA4')), { seite: 'anlage', anlageId: 'STA4' });
    assert.deepEqual(leseRoute(zumLabel('STA4', 'STA4-03')), { seite: 'label', anlageId: 'STA4', labelId: 'STA4-03' });
    assert.deepEqual(leseRoute('#/simulation'), { seite: 'simulation' });
    for (const h of ['#/anlage/sta4', '#/anlage/STA4/label/<x>', '#/anlage/../x', '#/testdaten']) assert.deepEqual(leseRoute(h), { seite: 'unbekannt' }, h);
  });
});

