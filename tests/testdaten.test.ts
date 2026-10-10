// AK-61, AK-62: fiktive Testdaten, vollständige Abdeckung, Erwartungswerte getrennt.

import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { BILDER, erwartungen, TESTDATEN, testdaten, WURZEL } from './hilfen.ts';

const daten = testdaten();
const erwartet = erwartungen();

describe('AK-62 Testdaten decken alle Fälle ab', () => {
  test('20 Labels auf 3 Anlagen, Soll-Anzahl passt zur Anlagenliste', () => {
    assert.equal(daten.labels.length, 20);
    assert.equal(daten.anlagen.length, 3);
    for (const a of daten.anlagen) {
      assert.equal(daten.labels.filter((l) => l.anlageId === a.id).length, a.sollAnzahl, a.id);
    }
  });

  test('zu jedem Label gibt es genau einen Erwartungswert', () => {
    assert.deepEqual(Object.keys(erwartet).sort(), daten.labels.map((l) => l.id).sort());
  });

  test('Deutsch, Englisch, Polnisch, Französisch und kyrillische Schrift kommen vor', () => {
    const sprachen = new Set(Object.values(erwartet).flatMap((e) => e.sprachen));
    for (const code of ['de', 'en', 'pl', 'fr', 'ru']) assert.ok(sprachen.has(code), code);
    assert.ok(daten.labels.some((l) => /[Ѐ-ӿ]/u.test(l.ocrText)));
  });

  test('die meisten Labels sind zweisprachig', () => {
    const zweisprachig = Object.values(erwartet).filter((e) => e.sprachen.length === 2).length;
    assert.ok(zweisprachig > daten.labels.length / 2, `${zweisprachig} von ${daten.labels.length}`);
  });

  test('je ein Label unleserlich, falsch erkannt, abweichend, nachgebessert, ohne Foto', () => {
    const werte = Object.entries(erwartet);
    assert.equal(werte.filter(([, e]) => e.auffaellig.includes('text_unleserlich')).length, 1, 'unleserlich');
    assert.equal(werte.filter(([, e]) => e.lesbar === false && e.unsicher && !e.auffaellig.includes('text_unleserlich')).length, 1, 'falsch erkannt');
    assert.equal(werte.filter(([, e]) => e.auffaellig.includes('abweichende_sprachen')).length, 1, 'abweichend');
    assert.equal(werte.filter(([, e]) => e.status === 'nachgebessert').length, 1, 'nachgebessert');
    assert.equal(daten.labels.filter((l) => l.bild === null).length, 1, 'ohne Foto');
  });

  test('eine Anlage mit mindestens 10 Labels, eine vollständig bestätigt, eine mit fehlerhaftem Label', () => {
    const jeAnlage = (id: string) => daten.labels.filter((l) => l.anlageId === id).map((l) => erwartet[l.id]!);
    assert.ok(daten.anlagen.some((a) => jeAnlage(a.id).length >= 10));
    assert.ok(daten.anlagen.some((a) => jeAnlage(a.id).every((e) => e.status === 'bestaetigt')));
    assert.ok(daten.anlagen.some((a) => jeAnlage(a.id).some((e) => e.status === 'fehlerhaft')));
  });
});

describe('AK-61 nur fiktive Daten, Erwartungswerte nur für Tests', () => {
  test('zu jedem Label mit Foto gibt es ein Platzhalter-SVG ohne Skript', () => {
    for (const l of daten.labels) {
      if (l.bild === null) continue;
      const pfad = join(BILDER, l.bild);
      assert.ok(existsSync(pfad), l.bild);
      const svg = readFileSync(pfad, 'utf8');
      assert.ok(svg.startsWith('<svg'), l.bild);
      assert.ok(svg.includes('Platzhalterfoto'), l.bild);
      assert.doesNotMatch(svg, /<script|on\w+=/i, l.bild);
    }
  });

  test('Labeldaten enthalten keine Erwartungswerte', () => {
    const roh = readFileSync(join(TESTDATEN, 'labels.json'), 'utf8') + readFileSync(join(TESTDATEN, 'anlagen.json'), 'utf8');
    for (const wort of ['erwart', 'lesbar', 'auffaellig', 'tatsaechlich', 'notiz']) {
      assert.ok(!roh.includes(wort), wort);
    }
  });

  test('kein Code außerhalb der Tests liest erwartung.json', () => {
    const dateien = (ordner: string): string[] =>
      readdirSync(ordner, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? dateien(join(ordner, e.name)) : [join(ordner, e.name)],
      );
    for (const datei of [...dateien(join(WURZEL, 'src')), join(TESTDATEN, 'erzeuge-bilder.ts')]) {
      assert.ok(!readFileSync(datei, 'utf8').includes('erwartung.json'), datei);
    }
  });
});
