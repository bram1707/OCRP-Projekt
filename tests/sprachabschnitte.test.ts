// Optimierung 2, Punkt 8: Sprache je Abschnitt. Zweisprachige Labels ergeben zwei Sprachen,
// ein einzelnes fremdes Wort in einer Zeile ergibt keine dritte Sprache.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { findeBelege, teileInAbschnitte } from '../src/ai/belege.ts';
import { mockAntwort } from '../src/ai/mock.ts';

const sprachen = (text: string) => [...mockAntwort(text).sprachen].sort();

describe('Optimierung 2, Punkt 8: Sprache je Abschnitt', () => {
  test('eine kurze Überschrift gehört zur Zeile darunter', () => {
    const text = 'A ACHTUNG\n\nHeiße Oberfläche. Nicht berühren.\nA WARNING\nHot surface. Do not touch.';
    const abschnitte = teileInAbschnitte(text).map((a) => text.slice(a.start, a.ende));
    assert.deepEqual(abschnitte, ['A ACHTUNG\n\nHeiße Oberfläche. Nicht berühren.', 'A WARNING\nHot surface. Do not touch.']);
  });

  const faelle: [string, string, string[]][] = [
    ['Deutsch und Türkisch (auch ohne Punkt auf dem großen I)', 'A ACHTUNG\nHochspannung! Lebensgefahr.\nA DIKKAT\nYüksek gerilim! Hayati tehlike.', ['de', 'tr']],
    ['Deutsch und Bulgarisch (nicht Russisch)', 'A WARNUNG\nQuetschgefahr. Hände fernhalten.\nA ВНИМАНИЕ\nОпасност OT смачкване. Дръжте ръцете далеч.', ['bg', 'de']],
    ['Deutsch und Chinesisch (mit und ohne Leerzeichen)', 'VORSICHT\nSchutzbrille tragen.\n注意\n必须佩戴护目镜。', ['de', 'zh']],
    ['Deutsch und Chinesisch, wie die Texterkennung es liest', 'A VORSICHT\nSchutzbrille tragen.\nAXE\n必须 佩戴 护 目镜 。', ['de', 'zh']],
    ['Italienisch und Spanisch (das „no“ macht kein Englisch)', 'A ATTENZIONE\nAlta tensione. Non toccare.\nA PELIGRO\nAlta tension. No tocar.', ['es', 'it']],
    ['Polnisch und Russisch', 'UWAGA\nWysokie napięcie. Nie dotykać.\nВНИМАНИЕ\nВысокое напряжение. Не прикасаться.', ['pl', 'ru']],
    ['zwei Sprachen in einer Zeile', 'ACHTUNG! Nicht berühren. UWAGA! Nie dotykać.', ['de', 'pl']],
    ['nur Englisch', 'WARNING\nHot surface. Do not touch.', ['en']],
  ];
  for (const [name, text, erwartet] of faelle) {
    test(name, () => assert.deepEqual(sprachen(text), erwartet));
  }

  test('Belege einer Sprache stammen nur aus ihren Abschnitten', () => {
    const text = 'A PELIGRO\nAlta tension. No tocar.';
    const treffer = findeBelege(text);
    assert.deepEqual(treffer.map((t) => t.code), ['es']);
    for (const b of treffer[0]!.belege) assert.equal(text.slice(b.start, b.ende), b.text);
  });

  test('chinesische Belege zeigen auf die richtige Stelle und zählen kein Zeichen doppelt', () => {
    const text = '注意：必须佩戴护目镜';
    const zh = findeBelege(text).find((t) => t.code === 'zh')!;
    for (const b of zh.belege) assert.equal(text.slice(b.start, b.ende), b.text);
    assert.ok(zh.woerter.includes('护目镜'));
    assert.equal(zh.belege.filter((b) => b.art === 'zeichen').length, 0);
  });
});
