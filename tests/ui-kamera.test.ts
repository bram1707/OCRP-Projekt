// Kamera-Seite (nur im Prototyp, U-B6): Plätze, Hinweis zu Personen, Abtippen ohne Texterkennung, Ergebnis.

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { ViteDevServer } from 'vite';
import { lade, rendere, starteVite, text } from './ui-hilfe.ts';

let vite: ViteDevServer;
let K: Record<string, any>;
let L: Record<string, any>;
before(async () => {
  vite = await starteVite();
  K = await lade(vite, '/kamera/KameraSeite.tsx');
  L = await lade(vite, '/kamera/logik.ts');
});
after(() => vite.close());

const platz = (id: string, status: string, extra: Record<string, unknown> = {}) => ({
  id, anlageId: 'EIG1', bildUrl: null, ocrText: '', ocrKonfidenz: 0, sprachen: [], sprachKonfidenz: 0, hinweis: null,
  prioritaet: 'genau_pruefen', begruendung: '', status, statusText: status, letzterFehlergrund: null, letzterFehlergrundText: null,
  auffaellig: false, gruende: [], belege: [], bedeutungen: [], ...extra,
});
const anlage = { id: 'EIG1', name: 'Testanlage Eigene Fotos', sollAnzahl: 3, bestaetigt: 1, freigegebenAm: null };
const ohne = () => {};
const ansicht = (stand: Record<string, unknown>, mehr: Record<string, unknown> = {}) => rendere(K.KameraAnsicht, {
  stand: { texterkennung: true, upload: true, anlage, plaetze: [platz('EIG1-01', 'fehlt'), platz('EIG1-02', 'fehlerhaft', { letzterFehlergrundText: 'Unleserlich' }), platz('EIG1-03', 'bestaetigt')], ...stand },
  gewaehlt: 'EIG1-02', datei: null, text: '', tippen: false, sendet: false, ergebnis: null, fehler: null,
  onPlatz: ohne, onDatei: ohne, onText: ohne, onTippen: ohne, onSenden: ohne, ...mehr,
});

describe('U-B6 Kamera-Seite', () => {
  test('Hinweis „keine Personen“, jeder Platz mit Status und Satz; wählbar nur Plätze, die ein Foto annehmen', () => {
    const html = ansicht({});
    const t = text(html);
    assert.match(t, /Bitte nur Labels fotografieren, keine Personen\./);
    assert.match(t, /Label 1: vorne an der Anlage Platz EIG1-01 Fehlt Noch kein Foto\./);
    assert.match(t, /Max hat einen Fehler gemeldet \(Unleserlich\)\. Bitte ein neues Foto hochladen\./);
    assert.match(t, /Von Max bestätigt\./);
    const knoepfe = [...html.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/g)].map((m) => text(m[1]!));
    assert.deepEqual(knoepfe, ['Label 1: vorne an der Anlage', 'Label 2: links an der Anlage', 'Foto hochladen und lesen lassen']);
    assert.match(html, /aria-pressed="true"[^>]*>Label 2: links an der Anlage</);
    assert.match(html, /accept="image\/png,image\/jpeg"/);
    assert.doesNotMatch(t, /\b(OCR|Konfidenz|API|JSON|null|undefined)\b/);
  });

  test('ohne Texterkennung: Textfeld und „Foto mit Text senden“; freigegebene Anlage: kein Hochladen', () => {
    const ohneLesen = ansicht({ texterkennung: false });
    assert.match(text(ohneLesen), /Die Texterkennung ist ausgeschaltet\. Bitte den Text auf dem Label eintippen\./);
    assert.match(ohneLesen, /<textarea[^>]*id="foto-text"/);
    assert.match(text(ohneLesen), /Foto mit Text senden/);
    const frei = ansicht({ anlage: { ...anlage, freigegebenAm: '2026-10-11T10:00:00Z' } });
    assert.doesNotMatch(frei, /type="file"/);
    assert.match(text(frei), /Von Max freigegeben/);
  });

  test('Ergebnis mit gelesenem Text, Lesesicherheit und Sprachen; ohne gefundenen Text das Angebot zum Eintippen', () => {
    const gelesen = platz('EIG1-01', 'offen', {
      statusText: 'Offen', ocrText: 'Achtung', ocrKonfidenz: 0.94, bildUrl: `/bilder/uploads/${'a'.repeat(32)}.png`, textGefunden: true,
      sprachen: [{ code: 'de', name: 'Deutsch', konfidenz: 0.95, sicher: true }],
    });
    const t = text(ansicht({}, { ergebnis: gelesen }));
    assert.match(t, /Foto für Label 1: vorne an der Anlage gespeichert\. Das Label ist jetzt in Max' Prüfung \(„Offen“\)\./);
    assert.match(t, /Erkannter Text \(Lesesicherheit 94 %\): Achtung/);
    assert.match(t, /Sprachvorschlag: Deutsch 95 %/);
    assert.match(ansicht({}, { ergebnis: gelesen }), /src="\/bilder\/uploads\/a{32}\.png"/);
    const leer = text(ansicht({}, { ergebnis: { ...gelesen, textGefunden: false, statusText: 'Unsicher' } }));
    assert.match(leer, /Auf dem Foto wurde kein Text erkannt\. Max sieht das Label als „Unsicher“\./);
    assert.match(text(ansicht({}, { sendet: true })), /Das Foto wird gelesen … Das dauert einige Sekunden\./);
  });

  // Optimierung 2, Punkt 5: Plätze erklärt und benannt.
  test('die drei Plätze sind erklärt und haben Namen', () => {
    const t = text(ansicht({}));
    assert.match(t, /Die Testanlage hat 3 Labels an verschiedenen Stellen\. Laden Sie für jedes ein Foto hoch\. Max prüft jedes Foto einzeln; die Anlage wird freigegeben, wenn er alle 3 bestätigt hat\./);
    for (const name of ['Label 1: vorne an der Anlage', 'Label 2: links an der Anlage', 'Label 3: hinten an der Anlage']) assert.ok(t.includes(name), name);
    assert.equal(L.platzName('XYZ-01'), 'Platz XYZ-01');
  });

  // Optimierung 2, Punkt 4: „Unsicher“ mit Grund, markierten Wörtern und drei Wegen.
  test('unsicheres Ergebnis: Grund, unsicher gelesene Wörter markiert, drei Wege und ein Foto-Tipp', () => {
    const unsicher = platz('EIG1-01', 'unsicher', {
      statusText: 'Unsicher', ocrText: 'ACHTUNG\nAXE 必须 护 目镜', ocrKonfidenz: 0.61, textGefunden: true, unsichereWoerter: ['AXE', '护'],
      gruende: [{ code: 'unsicher_ocr', text: 'Text schlecht lesbar (Texterkennung 61 %).' }, { code: 'abweichende_sprachen', text: 'x' }],
    });
    const html = ansicht({}, { ergebnis: unsicher, onNochmal: ohne });
    const t = text(html);
    assert.match(t, /Warum „Unsicher“\? Text schlecht lesbar \(Texterkennung 61 %\)\./);
    assert.doesNotMatch(t, /Warum „Unsicher“\?[^W]*\bx\b/);
    assert.deepEqual([...html.matchAll(/data-unsicher-gelesen="">([^<]+)</g)].map((m) => m[1]), ['AXE', '护']);
    assert.match(t, /Besseres Foto hochladen Tipp: gerade von vorn, gut beleuchtet/);
    assert.match(t, /Selbst prüfen und bestätigen/);
    assert.match(t, /Fehler melden/);
    assert.match(html, /href="#\/anlage\/EIG1\/label\/EIG1-01"/);
    // Ein sicheres Ergebnis zeigt keine Hilfe.
    assert.doesNotMatch(ansicht({}, { ergebnis: { ...unsicher, status: 'offen' } }), /data-unsicher-hilfe/);
  });

  test('markiereWoerter: ganze Wörter, chinesische Zeichen ohne Wortgrenze', () => {
    assert.deepEqual(L.markiereWoerter('A ACHTUNG A', ['A']).filter((x: any) => x.unsicher).length, 2);
    assert.deepEqual(L.markiereWoerter('必须护目镜', ['护']).map((x: any) => x.text), ['必须', '护', '目镜']);
    assert.deepEqual(L.markiereWoerter('Text', []), [{ text: 'Text', unsicher: false }]);
  });

  // Optimierung 2, Punkt 3: deutsche Bedeutung wichtiger Wörter.
  test('Ergebnis zeigt „Wichtige Wörter auf Deutsch“ aus dem Wörterbuch', () => {
    const tr = platz('EIG1-01', 'offen', {
      statusText: 'Offen', ocrText: 'DİKKAT', textGefunden: true, sprachen: [{ code: 'tr', name: 'Türkisch', konfidenz: 0.95, sicher: true }],
      bedeutungen: [{ wort: 'DİKKAT', sprache: 'tr', deutsch: 'Achtung' }],
    });
    assert.match(text(ansicht({}, { ergebnis: tr })), /Wichtige Wörter auf Deutsch DİKKAT \(Türkisch\) = Achtung/);
  });

  test('Prüfung der Datei vorab und Vorschlag des Platzes', () => {
    assert.equal(L.dateiFehler(null), 'Bitte zuerst ein Foto wählen.');
    assert.equal(L.dateiFehler({ size: 10, type: 'image/svg+xml' }), 'Bitte ein Foto als PNG oder JPEG wählen.');
    assert.equal(L.dateiFehler({ size: 6 * 1024 * 1024, type: 'image/jpeg' }), 'Das Foto ist zu groß. Bitte höchstens 5 MB.');
    assert.equal(L.dateiFehler({ size: 10, type: 'image/png' }), null);
    assert.equal(L.vorschlag([platz('A', 'offen'), platz('B', 'fehlt'), platz('C', 'fehlerhaft')], false), 'C');
    assert.equal(L.vorschlag([platz('A', 'bestaetigt'), platz('B', 'fehlt')], false), 'B');
    assert.equal(L.vorschlag([platz('B', 'fehlt')], true), null);
    assert.equal(L.groesseText(2_500_000), '2,4 MB');
  });
});
