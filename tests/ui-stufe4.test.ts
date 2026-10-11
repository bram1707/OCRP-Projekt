// Stufe 4, Oberfläche: Rollenwahl und „Rolle wechseln“ (B5), Rückmeldung auf jeder Seite (B6, AK-51),
// Rückmeldungen der Testleitung (B7), „Daten zurücksetzen“ (B8, AK-52), Marie ohne Uhrzeit und nur sichtbar verbunden (B9).

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import type { ViteDevServer } from 'vite';
import { SZENARIEN as SZENARIEN_SERVER } from '../src/db/feedback.ts';
import { demoDaten, testdaten } from './hilfen.ts';
import { lade, rendere, starteVite, text, UI } from './ui-hilfe.ts';

let vite: ViteDevServer;
let M: Record<string, Record<string, any>>;

const ANGRIFF = '<img src=x onerror=alert(1)>';
const BEREICHE = ['start', 'max', 'marie', 'simulation', 'testleitung', 'kamera'] as const;
const ohne = () => {};

before(async () => {
  vite = await starteVite();
  M = {
    rahmen: await lade(vite, '/rahmen.tsx'),
    route: await lade(vite, '/route.ts'),
    start: await lade(vite, '/start/Startseite.tsx'),
    rueckmeldung: await lade(vite, '/testleitung/Rueckmeldung.tsx'),
    liste: await lade(vite, '/testleitung/Rueckmeldungen.tsx'),
    zuruecksetzen: await lade(vite, '/testleitung/Zuruecksetzen.tsx'),
    szenarien: await lade(vite, '/testleitung/szenarien.ts'),
  };
});
after(() => vite.close());

const verweise = (html: string) => [...html.matchAll(/<a\b[^>]*\bhref="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g)].map((m) => [m[1]!, text(m[2]!)]);
const knoepfe = (html: string) => [...html.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/g)].map((m) => text(m[1]!));
const rahmen = (bereich: string) => rendere(M.rahmen!.Rahmen, { bereich, children: 'Inhalt' });

/** Kein Fachwort und kein Hinweis auf Testdaten im sichtbaren Text */
function ohneFachwoerter(html: string, name: string): void {
  assert.doesNotMatch(text(html), /\b(OCR|Konfidenz|API|LLM|JSON|null|undefined|NaN)\b|Datensatz|erwart/i, name);
}

describe('B5 Rollenwahl als Startseite', () => {
  test('„Wer sind Sie?“ mit Max, Marie und der Kamera (ohne Karte „Instandhaltung“, Bram 11.10.2026), dem Satz zur Anmeldung und dem Bereich für die Testleitung', () => {
    const html = rendere(M.start!.Startseite, {});
    assert.match(html, /<h1[^>]*>Wer sind Sie\?<\/h1>/);
    assert.match(text(html), /Im Prototyp gibt es keine Anmeldung; die Rolle wählen Sie selbst\./);
    assert.deepEqual(verweise(html), [
      ['#/anlagen', 'Max · Labels prüfen (Qualitätsmanagement)'],
      ['#/marie', 'Marie · Übersicht ansehen (Fertigungsleitung)'],
      ['#/kamera', 'Kamera · Eigenes Foto hochladen (nur im Prototyp)'],
      ['#/rueckmeldungen', 'Rückmeldungen ansehen'],
    ]);
    assert.match(html, /<h2[^>]*>Für die Testleitung<\/h2>/);
    assert.deepEqual(knoepfe(html), ['Daten zurücksetzen']);
    ohneFachwoerter(html, 'Rollenwahl');
  });

  test('Adressen: #/ ist die Rollenwahl, #/anlagen Max, #/rueckmeldungen die Testleitung', () => {
    const { leseRoute, bereichDerAdresse, STARTSEITE_DES_BEREICHS } = M.route!;
    assert.deepEqual(leseRoute('#/'), { seite: 'rollenwahl' });
    assert.deepEqual(leseRoute('#/anlagen'), { seite: 'anlagen' });
    assert.deepEqual(leseRoute('#/rueckmeldungen'), { seite: 'rueckmeldungen' });
    for (const h of ['#/anlagen/', '#/Anlagen', '#/rueckmeldungen/x', '#/start']) assert.deepEqual(leseRoute(h), { seite: 'unbekannt' }, h);
    assert.equal(bereichDerAdresse('#/rueckmeldungen'), 'testleitung');
    assert.deepEqual(STARTSEITE_DES_BEREICHS, {
      start: '#/', max: '#/anlagen', marie: '#/marie', simulation: '#/simulation', testleitung: '#/rueckmeldungen', kamera: '#/kamera',
    });
    assert.deepEqual(leseRoute('#/kamera'), { seite: 'kamera' });
    assert.equal(bereichDerAdresse('#/kamera'), 'kamera');
  });

  test('jede Seite zeigt oben links „Startseite“ (Optimierung 11.10.2026) und daneben die Rolle, außer der Rollenwahl selbst', () => {
    const titel = { start: 'Label-Prüfung · Prototyp', max: 'Label-Prüfung · Max (Qualitätsmanagement)', marie: 'Übersicht · Marie (Fertigungsleitung)',
      simulation: 'Simulation: Instandhaltung (nur im Prototyp)', testleitung: 'Testleitung (nur im Prototyp)',
      kamera: 'Kamera · Eigenes Foto (nur im Prototyp)' };
    for (const bereich of BEREICHE) {
      const html = rahmen(bereich);
      const kopf = /<header\b[\s\S]*?<\/header>/.exec(html)![0];
      const links = verweise(kopf);
      const rolle = [M.route!.STARTSEITE_DES_BEREICHS[bereich], `LP ${titel[bereich]}`];
      if (bereich === 'start') assert.deepEqual(links, [rolle], 'auf der Rollenwahl kein Verweis auf sich selbst');
      else assert.deepEqual(links, [['#/', 'Startseite'], rolle], bereich);
      assert.match(text(html), /Testversion: Spracherkennung simuliert\. Texterkennung echt nur bei eigenen Fotos, sonst simuliert\./, bereich);
    }
  });

  test('R16a: kein Rahmen führt direkt zu den Seiten einer anderen Rolle, nur über die Rollenwahl; Max\' Rahmen zusätzlich zur Simulation', () => {
    for (const bereich of BEREICHE) {
      const ziele = verweise(rahmen(bereich)).map(([ziel]) => ziel);
      // Die Instandhaltung hat keine Karte in der Rollenwahl; sie nutzt Max' Rolle (R9) und ist von seinen Seiten aus erreichbar.
      const extra = bereich === 'max' ? ['#/simulation'] : [];
      assert.deepEqual([...new Set(ziele)].sort(), [...new Set([M.route!.STARTSEITE_DES_BEREICHS[bereich], '#/', ...extra])].sort(), bereich);
    }
    assert.deepEqual(verweise(rahmen('max')).find(([z]) => z === '#/simulation'), ['#/simulation', 'Simulation: Instandhaltung (nur im Prototyp)']);
  });

  test('eigener Fenstertitel je Rolle', () => {
    const { FENSTERTITEL } = M.rahmen!;
    assert.deepEqual(Object.keys(FENSTERTITEL).sort(), [...BEREICHE].sort());
    assert.equal(new Set(Object.values(FENSTERTITEL)).size, BEREICHE.length);
    assert.equal(FENSTERTITEL.marie, 'Übersicht · Marie (nur ansehen)');
  });

  test('Max\' Anlagen liegen jetzt unter pruefung/, die Startseite enthält keine Anlagen', () => {
    const quelle = readFileSync(join(UI, 'start', 'Startseite.tsx'), 'utf8');
    assert.doesNotMatch(quelle, /ladeAnlagen|zurAnlage\(/);
    assert.match(readFileSync(join(UI, 'main.tsx'), 'utf8'), /route\.seite === 'anlagen' && <Anlagenliste \/>/);
  });
});

describe('B6 „Rückmeldung geben“ auf jeder Seite (AK-51)', () => {
  test('der Knopf steht im Rahmen jeder Seite, auch bei Marie', () => {
    for (const bereich of BEREICHE) {
      const fuss = /<footer\b[\s\S]*?<\/footer>/.exec(rahmen(bereich))![0];
      assert.deepEqual(knoepfe(fuss), ['Rückmeldung geben'], bereich);
    }
  });

  test('Formular: Szenario aus fester Liste, vorausgewählt; Kommentar bis 1000 Zeichen; Hinweis auf Angaben zu Personen', () => {
    const html = rendere(M.rueckmeldung!.RueckmeldungFormular, {
      daten: { szenario: 'lackierung2', kommentar: '', sendet: false, fehler: null },
      onSzenario: ohne, onKommentar: ohne, onSenden: ohne, onAbbrechen: ohne,
    });
    const optionen = [...html.matchAll(/<option value="([^"]*)"([^>]*)>([^<]*)<\/option>/g)].map((m) => [m[1], text(m[3]!), /selected/.test(m[2]!)]);
    assert.deepEqual(optionen, [
      ['presse3', 'Presse 3', false],
      ['montagelinie1', 'Montagelinie 1', false],
      ['lackierung2', 'Lackierung 2', true],
      ['marie', 'Marie: Ist alles geprüft?', false],
      ['allgemein', 'Allgemein', false],
    ]);
    assert.match(html, /<textarea[^>]*maxLength="1000"/i);
    const hinweisId = /<textarea[^>]*aria-describedby="([^"]*)"/.exec(html)![1]!;
    assert.match(html, new RegExp(`<p id="${hinweisId}"[^>]*>Bitte keine Namen oder andere Angaben zu Personen eintragen\\. Höchstens 1000 Zeichen\\.</p>`));
    assert.match(html, /<label for="[^"]+"[^>]*>Zu welchem Teil des Tests\?<\/label>/);
    assert.match(html, /<label for="[^"]+"[^>]*>Ihr Kommentar<\/label>/);
    assert.deepEqual(knoepfe(html), ['Rückmeldung senden', 'Abbrechen']);
    // Die Content-Security-Policy verbietet das Absenden; gesendet wird mit fetch.
    assert.doesNotMatch(html, /<form[^>]*\b(action|method)=/);
    ohneFachwoerter(html, 'Formular');
  });

  test('ein Fehler steht am Feld und wird angesagt', () => {
    const html = rendere(M.rueckmeldung!.RueckmeldungFormular, {
      daten: { szenario: 'allgemein', kommentar: '', sendet: false, fehler: 'Bitte schreiben Sie einen Kommentar.' },
      onSzenario: ohne, onKommentar: ohne, onSenden: ohne, onAbbrechen: ohne,
    });
    const fehlerId = /<p id="([^"]*)" role="alert"[^>]*>Bitte schreiben Sie einen Kommentar\.<\/p>/.exec(html)![1]!;
    assert.match(html, new RegExp(`<textarea[^>]*aria-describedby="[^"]* ${fehlerId}"`));
    assert.match(html, /aria-invalid="true"/);
  });

  test('während gesendet wird, sind Auswahl, Feld und Knöpfe gesperrt', () => {
    const html = rendere(M.rueckmeldung!.RueckmeldungFormular, {
      daten: { szenario: 'allgemein', kommentar: 'x', sendet: true, fehler: null },
      onSzenario: ohne, onKommentar: ohne, onSenden: ohne, onAbbrechen: ohne,
    });
    for (const tag of ['select', 'textarea']) assert.match(html, new RegExp(`<${tag}[^>]*disabled=""`), tag);
    assert.equal((html.match(/<button[^>]*disabled=""/g) ?? []).length, 2);
  });

  test('Vorauswahl aus der Adresse: Demo-Anlagen, Marie, sonst „allgemein“', () => {
    const { szenarioDerAdresse } = M.szenarien!;
    const faelle: [string, string][] = [
      ['#/anlage/PRE3', 'presse3'], ['#/anlage/MON1/label/MON1-11', 'montagelinie1'], ['#/anlage/LAC2', 'lackierung2'],
      ['#/marie', 'marie'], ['#/marie/zahl/offen', 'marie'], ['#/marie/anlage/PRE3', 'marie'], ['#/marie/zahl/alle', 'marie'],
      ['#/', 'allgemein'], ['#/anlagen', 'allgemein'], ['#/simulation', 'allgemein'], ['#/rueckmeldungen', 'allgemein'],
      ['#/anlage/STA4', 'allgemein'], ['#/xyz', 'allgemein'],
    ];
    for (const [hash, szenario] of faelle) assert.equal(szenarioDerAdresse(hash), szenario, hash);
  });

  test('dieselben Szenarien wie der Server; die Anlagen der Vorauswahl sind genau die Demo-Anlagen', () => {
    assert.deepEqual([...M.szenarien!.SZENARIEN], [...SZENARIEN_SERVER]);
    // Die Testanlage „Eigene Fotos“ und Abfüllung 5 (Optimierung 2) haben kein eigenes Szenario (dort gilt „allgemein“).
    assert.deepEqual(Object.keys(M.szenarien!.SZENARIO_DER_ANLAGE).sort(), demoDaten().anlagen.map((a) => a.id).filter((id) => id !== 'EIG1' && id !== 'ABF5').sort());
    assert.equal(M.szenarien!.szenarioDerAdresse('#/anlage/ABF5'), 'allgemein');
    assert.equal(M.szenarien!.szenarioDerAdresse('#/anlage/EIG1'), 'allgemein');
    for (const a of testdaten().anlagen) assert.equal(M.szenarien!.szenarioDerAdresse(`#/anlage/${a.id}`), 'allgemein', a.id);
  });

  test('Marie sendet als „marie“, Max und die Instandhaltung als „max“, Rollenwahl und Testleitung als „testleitung“', () => {
    const quelle = readFileSync(join(UI, 'testleitung', 'Rueckmeldung.tsx'), 'utf8');
    assert.match(quelle, /const ABSENDER: Record<Bereich, Absender> = \{ start: 'testleitung', max: 'max', marie: 'marie', simulation: 'max', testleitung: 'testleitung', kamera: 'max' \};/);
    const aktionen = readFileSync(join(UI, 'testleitung', 'aktionen.ts'), 'utf8');
    assert.match(aktionen, /sende<\{ id: number \}>\('\/api\/feedback', rolle,/);
  });
});

describe('B7 Rückmeldungen ansehen und löschen', () => {
  const liste = [
    { id: 2, szenario: 'marie', zeitpunkt: '2026-10-11T12:03:00.000Z', kommentar: `Zeile 1\n${ANGRIFF}` },
    { id: 1, szenario: 'presse3', zeitpunkt: '2026-01-05T08:00:00.000Z', kommentar: 'Gut.' },
  ];
  const ansicht = (mehr: Record<string, unknown> = {}) =>
    rendere(M.liste!.RueckmeldungenAnsicht, {
      daten: { liste, rueckfrage: false, sendet: false, meldung: null, fehler: null, ...mehr },
      onLoeschen: ohne, onBestaetigen: ohne, onAbbrechen: ohne,
    });

  test('Szenario, Zeit in deutscher Zeit und Kommentar, nur als Text', () => {
    const html = ansicht();
    assert.match(html, /<h1[^>]*>Rückmeldungen<\/h1>/);
    assert.match(text(html), /2 Rückmeldungen Marie: Ist alles geprüft\? · 11\.10\.2026, 14:03 Zeile 1 <img src=x onerror=alert\(1\)> Presse 3 · 05\.01\.2026, 09:00 Gut\./);
    assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
    assert.doesNotMatch(html, /<img/);
    assert.deepEqual(knoepfe(html), ['Alle Rückmeldungen löschen']);
    ohneFachwoerter(html, 'Liste');
  });

  test('Rückfrage vor dem Löschen: beschriftete Gruppe, „Abbrechen“ zuerst', () => {
    const html = ansicht({ rueckfrage: true });
    assert.match(html, /role="group" aria-labelledby="[^"]+" aria-describedby="[^"]+"/);
    assert.match(text(html), /Alle Rückmeldungen endgültig löschen\? Sie lassen sich danach nicht wiederherstellen\./);
    assert.deepEqual(knoepfe(html), ['Abbrechen', 'Ja, alle löschen']);
  });

  test('ohne Rückmeldungen: Hinweis und kein Löschknopf', () => {
    const html = ansicht({ liste: [] });
    assert.match(text(html), /Es gibt keine Rückmeldungen\./);
    assert.deepEqual(knoepfe(html), []);
  });

  test('nur die Rollenwahl verlinkt die Liste, kein Rahmen und keine Seite von Max, Marie oder der Instandhaltung', () => {
    for (const bereich of ['max', 'marie', 'simulation']) assert.doesNotMatch(rahmen(bereich), /#\/rueckmeldungen/, bereich);
    const nutzer = (readdirSync(UI, { recursive: true }) as string[])
      .filter((d) => /\.tsx?$/.test(d) && readFileSync(join(UI, d), 'utf8').includes('zuRueckmeldungen()'));
    assert.deepEqual(nutzer, [join('start', 'Startseite.tsx')]);
  });
});

describe('B8 „Daten zurücksetzen“', () => {
  test('zuerst nur der Knopf; die Rückfrage nennt, was verloren geht und was bleibt', () => {
    assert.deepEqual(knoepfe(rendere(M.zuruecksetzen!.Zuruecksetzen, {})), ['Daten zurücksetzen']);
    const quelle = readFileSync(join(UI, 'testleitung', 'Zuruecksetzen.tsx'), 'utf8');
    assert.match(quelle, /titel="Alle Daten zurücksetzen\?"/);
    assert.match(quelle, /Die Rückmeldungen bleiben erhalten\./);
    assert.match(M.zuruecksetzen!.ZURUECKGESETZT, /^Die Daten sind zurückgesetzt\./);
  });

  test('die Rückfrage setzt den Fokus auf „Abbrechen“ und schließt mit Escape', () => {
    const quelle = readFileSync(join(UI, 'testleitung', 'Rueckfrage.tsx'), 'utf8');
    assert.match(quelle, /useEffect\(\(\) => abbrechen\.current\?\.focus\(\), \[\]\);/);
    assert.match(quelle, /e\.key === 'Escape'/);
  });
});

describe('B9 Marie: ohne Uhrzeit, nur sichtbare Tabs verbinden sich', () => {
  test('ein verdeckter Tab öffnet keine Verbindung, auch nicht beim ersten Anzeigen', () => {
    const quelle = readFileSync(join(UI, 'marie', 'MarieSeite.tsx'), 'utf8');
    const verbinde = /const verbinde = \(\) => \{([\s\S]*?)\n {4}\};/.exec(quelle)![1]!;
    assert.ok(verbinde.indexOf("if (document.visibilityState === 'hidden') return;") < verbinde.indexOf('new EventSource'));
  });
});
