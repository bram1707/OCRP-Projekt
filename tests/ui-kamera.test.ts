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
  auffaellig: false, gruende: [], belege: [], ...extra,
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
    assert.match(t, /Platz EIG1-01 Fehlt Noch kein Foto\./);
    assert.match(t, /Max hat einen Fehler gemeldet \(Unleserlich\)\. Bitte ein neues Foto hochladen\./);
    assert.match(t, /Von Max bestätigt\./);
    const knoepfe = [...html.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/g)].map((m) => text(m[1]!));
    assert.deepEqual(knoepfe, ['EIG1-01', 'EIG1-02', 'Foto hochladen und lesen lassen']);
    assert.match(html, /aria-pressed="true"[^>]*>EIG1-02</);
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
    assert.match(t, /Foto für Platz EIG1-01 gespeichert\. Das Label ist jetzt in Max' Prüfung \(„Offen“\)\./);
    assert.match(t, /Erkannter Text \(Lesesicherheit 94 %\): Achtung/);
    assert.match(t, /Sprachvorschlag: Deutsch 95 %/);
    assert.match(ansicht({}, { ergebnis: gelesen }), /src="\/bilder\/uploads\/a{32}\.png"/);
    const leer = text(ansicht({}, { ergebnis: { ...gelesen, textGefunden: false, statusText: 'Unsicher' } }));
    assert.match(leer, /Auf dem Foto wurde kein Text erkannt\. Max sieht das Label als „Unsicher“\./);
    assert.match(text(ansicht({}, { sendet: true })), /Das Foto wird gelesen … Das dauert einige Sekunden\./);
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
