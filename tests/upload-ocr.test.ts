// Echte lokale Texterkennung (U-B2): tesseract.js liest ein eingechecktes, klares Foto ohne Internet.
// Die Sprachdaten kommen aus node_modules/@tesseract.js-data und liegen danach in einem lokalen Ordner.

import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, test } from 'node:test';
import { bereiteSprachdatenVor, erstelleTesseractLeser, OCR_SPRACHEN } from '../src/ocr/tesseract.ts';
import { waehleTextLeser } from '../src/ocr/textLeser.ts';
import { detectLanguage } from '../src/ai/detectLanguage.ts';
import { WURZEL } from './hilfen.ts';

const ordner = mkdtempSync(join(tmpdir(), 'ocr-sprachen-'));
after(() => rmSync(ordner, { recursive: true, force: true }));

describe('U-B2 tesseract.js lokal', () => {
  test('die Sprachdaten für Deutsch, Englisch, Polnisch, Französisch, Russisch, Türkisch, Bulgarisch und Chinesisch liegen lokal vor', () => {
    bereiteSprachdatenVor(ordner);
    assert.deepEqual(readdirSync(ordner).sort(), OCR_SPRACHEN.map((c) => `${c}.traineddata.gz`).sort());
  });

  test('liest das deutsch-polnische Testfoto (PNG und JPEG) mit Sicherheit ≥ 80 %, ohne fetch', async () => {
    const leser = erstelleTesseractLeser({ sprachOrdner: ordner });
    // Ein Zugriff übers Netz würde hier auffallen.
    const echtesFetch = globalThis.fetch;
    globalThis.fetch = (() => Promise.reject(new Error('kein Netz im Test'))) as typeof fetch;
    try {
      for (const datei of ['label-de-pl.png', 'label-de-pl.jpg']) {
        const { text, konfidenz } = await leser(readFileSync(join(WURZEL, 'tests', 'bilder', datei)), datei.endsWith('png') ? 'png' : 'jpeg');
        assert.match(text, /ACHTUNG/, datei);
        assert.match(text, /Oberfläche/, datei);
        assert.match(text, /UWAGA/, datei);
        assert.ok(konfidenz >= 0.8 && konfidenz <= 1, `${datei}: ${konfidenz}`);
      }
    } finally {
      globalThis.fetch = echtesFetch;
      await leser.beende();
    }
  });

  // Optimierung 2, Punkt 8: Hochgeladene zweisprachige Labels ergaben nur Deutsch oder eine falsche Sprache.
  test('zweisprachige Testfotos: beide Sprachen werden erkannt, auch Türkisch, Bulgarisch und Chinesisch', async () => {
    const leser = erstelleTesseractLeser({ sprachOrdner: ordner });
    const faelle: [string, string[]][] = [
      ['label-de-tr.png', ['de', 'tr']], ['label-de-bg.png', ['bg', 'de']], ['label-de-zh.png', ['de', 'zh']],
      ['label-it-es.png', ['es', 'it']], ['label-en-fr.png', ['en', 'fr']], ['label-de-pl.png', ['de', 'pl']],
    ];
    try {
      for (const [datei, sprachen] of faelle) {
        const { text, konfidenz } = await leser(readFileSync(join(WURZEL, 'tests', 'bilder', datei)), 'png');
        const antwort = await detectLanguage(text, konfidenz);
        assert.deepEqual([...antwort.sprachen].sort(), sprachen, `${datei}: ${text}`);
      }
    } finally {
      await leser.beende();
    }
  });

  test('Zeitlimit greift, der hängende Worker wird verworfen', async () => {
    const leser = erstelleTesseractLeser({ sprachOrdner: ordner, zeitlimitMs: 1 });
    try {
      await assert.rejects(leser(readFileSync(join(WURZEL, 'tests', 'bilder', 'label-de-pl.png')), 'png'), /Zeitlimit/);
    } finally {
      await leser.beende();
    }
  });

  test('OCR_MODUS=aus: keine Texterkennung, kein Absturz', async () => {
    assert.equal(await waehleTextLeser('aus', ordner), null);
  });
});
