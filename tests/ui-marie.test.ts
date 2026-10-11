// Oberfläche für Marie (Stufe 3): Bausteine über Vite geladen und mit echten Antworten des Servers
// zu HTML gerendert (AK-40 bis AK-46, dazu AK-14, AK-21, AK-61).

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import type { ViteDevServer } from 'vite';
import { oeffneDatenbank, spieleTestdatenEin } from '../src/db/datenbank.ts';
import type { MarieUebersicht } from '../src/server/marie.ts';
import { erwartungen, starteServer, testdaten, type TestServer } from './hilfen.ts';
import { element, json, lade, mitServer, rendere, starteVite, text, UI, zaehle } from './ui-hilfe.ts';

let vite: ViteDevServer;
let M: Record<string, Record<string, any>>;

const f = {} as {
  basis: MarieUebersicht;
  /** alle Labels von Stanzanlage 4 bestätigt, aber noch nicht freigegeben */
  sta4Bestaetigt: MarieUebersicht;
  /** alles bestätigt und freigegeben */
  fertig: MarieUebersicht;
  /** Schweißroboter 5 mit Soll 7: zwei Labels ohne Datensatz */
  ohneDatensatz: MarieUebersicht;
  /** Stanzanlage 4 mit Soll 8: zwei Datensätze mehr als laut Anlagenliste */
  ueberzahl: MarieUebersicht;
};

/** Übersicht mit geänderter Soll-Anzahl einer Anlage */
async function mitSoll(anlageId: string, soll: number): Promise<MarieUebersicht> {
  const daten = testdaten();
  daten.anlagen = daten.anlagen.map((a) => (a.id === anlageId ? { ...a, sollAnzahl: soll } : a));
  const db = oeffneDatenbank(':memory:');
  await spieleTestdatenEin(db, daten);
  const s: TestServer = await starteServer(db);
  try {
    return await json(s, '/api/marie');
  } finally {
    await s.schliessen();
  }
}

before(async () => {
  vite = await starteVite();
  M = {
    ansicht: await lade(vite, '/marie/MarieAnsicht.tsx'),
    logik: await lade(vite, '/marie/logik.ts'),
    route: await lade(vite, '/route.ts'),
    rahmen: await lade(vite, '/rahmen.tsx'),
  };
  await mitServer(async (s) => {
    f.basis = await json(s, '/api/marie');
    // Alles bestätigen, was Max prüfen kann; fehlerhafte nachbessern, fehlende nachreichen.
    await json(s, '/api/labels/SWR5-02/nachbessern', 'POST');
    await json(s, '/api/labels/SWR5-05/nacherfassen', 'POST');
    const offen = (a: string) => json(s, `/api/anlagen/${a}/labels`).then((d) => d.labels.filter((l: any) => l.status !== 'bestaetigt'));
    for (const l of await offen('STA4')) await json(s, `/api/labels/${l.id}/bestaetigen`, 'POST');
    f.sta4Bestaetigt = await json(s, '/api/marie');
    for (const l of await offen('SWR5')) await json(s, `/api/labels/${l.id}/bestaetigen`, 'POST');
    await json(s, '/api/anlagen/STA4/freigeben', 'POST');
    await json(s, '/api/anlagen/SWR5/freigeben', 'POST');
    f.fertig = await json(s, '/api/marie');
  });
  f.ohneDatensatz = await mitSoll('SWR5', 7);
  f.ueberzahl = await mitSoll('STA4', 8);
});

after(async () => {
  await vite?.close();
});

type Auswahl = { art: 'zahl'; zahl: string } | { art: 'anlage'; anlageId: string } | null;

function marie(daten: MarieUebersicht, auswahl: Auswahl = null, mehr: Record<string, unknown> = {}): string {
  return rendere(M.ansicht!.MarieAnsicht, { daten: { daten, auswahl, aktualisiert: '04:12:05', verbunden: true, ...mehr } });
}
const zahl = (z: string): Auswahl => ({ art: 'zahl', zahl: z });
const anlage = (id: string): Auswahl => ({ art: 'anlage', anlageId: id });
const zeilen = (html: string) => [...html.matchAll(/data-marie-label="([^"]+)"/g)].map((m) => m[1]);
const anlagen = (html: string) => [...html.matchAll(/data-marie-anlage="([^"]+)"/g)].map((m) => m[1]);

/** Alle Seiten, die Marie sehen kann, für die Querschnittsprüfungen. */
function alleSeiten(): Record<string, string> {
  return {
    start: marie(f.basis),
    gesamt: marie(f.basis, zahl('gesamt')),
    offen: marie(f.basis, zahl('offen')),
    erledigt: marie(f.basis, zahl('erledigt')),
    fehlerhaft: marie(f.basis, zahl('fehlerhaft')),
    sta4: marie(f.basis, anlage('STA4')),
    swr5: marie(f.basis, anlage('SWR5')),
    foe2: marie(f.basis, anlage('FOE2')),
    ohneDatensatz: marie(f.ohneDatensatz, anlage('SWR5')),
    fertig: marie(f.fertig, zahl('erledigt')),
    getrennt: marie(f.basis, null, { verbunden: false }),
  };
}

describe('AK-40 vier Zahlen oben', () => {
  test('Labels gesamt 20, Offen 9, Erledigt 7, Fehlerhaft 4, jede mit Zusatz, was mitzählt', () => {
    const html = marie(f.basis);
    const werte = ['gesamt', 'offen', 'erledigt', 'fehlerhaft'].map((z) => {
      const kachel = text(element(html, 'li', 'data-zahl', z)!);
      return kachel.split(' Warum')[0];
    });
    assert.deepEqual(werte, [
      'Labels gesamt 20 laut Anlagenliste Labels zeigen',
      'Offen 9 inkl. nachgebessert 1 Nachgebessert · 8 Offen Labels zeigen',
      'Erledigt 7 von Max bestätigt Labels zeigen',
      'Fehlerhaft 4 inkl. unsicher und nicht erfasst 1 Fehlt · 1 Fehlerhaft · 2 Unsicher Labels zeigen',
    ]);
    assert.ok(html.indexOf('data-zahl="gesamt"') < html.indexOf('data-marie-anlage='), 'Zahlen stehen oben');
  });

  test('„Warum?“ an der Gesamtzahl rechnet die Summe vor', () => {
    const warum = text(element(marie(f.basis), 'details', 'data-warum-zahl', 'gesamt')!);
    assert.match(warum, /^Warum 20 gesamt\? Labels je Anlage: Schweißroboter 5: 5 Labels; Stanzanlage 4: 10 Labels; Förderband 2: 5 Labels\./);
    assert.match(warum, /Jedes Label zählt genau einmal: 9 offen \+ 7 erledigt \+ 4 fehlerhaft = 20\./);
  });
});

describe('AK-45 Anlagenliste legt die Anzahl fest; ohne Foto „Label nicht erfasst“', () => {
  test('Label ohne Foto: Zeile „Kein Foto“, Grund „Label nicht erfasst“, Anlage gesperrt mit diesem Grund', () => {
    const html = marie(f.basis, anlage('SWR5'));
    const z = element(html, 'li', 'data-marie-label', 'SWR5-05')!;
    assert.match(text(z), /^Kein Foto Label SWR5-05 Schweißroboter 5 Fehlt Label nicht erfasst: kein Foto vorhanden\./);
    assert.doesNotMatch(z, /<img/);
    const karte = text(element(html, 'li', 'data-marie-anlage', 'SWR5')!);
    assert.match(karte, /^Schweißroboter 5 Gesperrt /);
    assert.match(text(element(html, 'details', 'data-warum-anlage', 'SWR5')!), /1 Label „Fehlt“ \(kein Foto\): SWR5-05\./);
  });

  test('Labels laut Anlagenliste ohne Datensatz: 22 gesamt, 6 fehlerhaft, zwei Zeilen „Label nicht erfasst“, Anlage nennt die Lücke', () => {
    const html = marie(f.ohneDatensatz, anlage('SWR5'));
    assert.match(text(element(html, 'li', 'data-zahl', 'gesamt')!), /Labels gesamt 22/);
    assert.match(text(element(html, 'li', 'data-zahl', 'fehlerhaft')!), /Fehlerhaft 6/);
    assert.equal(text(element(html, 'h2', 'id', 'auswahl-titel')!), 'Schweißroboter 5: 7 Labels');
    for (const k of ['SWR5-nicht-erfasst-1', 'SWR5-nicht-erfasst-2']) {
      const z = element(html, 'li', 'data-marie-label', k)!;
      assert.match(text(z), /^Kein Foto Label nicht erfasst Schweißroboter 5 Fehlt Label nicht erfasst: laut Anlagenliste vorhanden, aber nicht fotografiert\./);
      assert.doesNotMatch(z, /<img|Vorgeschlagene Sprachen|Woran die Sprache/);
    }
    assert.match(
      text(element(html, 'details', 'data-warum-zahl', 'fehlerhaft')!),
      /Gezählt: SWR5-05 \(Fehlt\), nicht erfasst bei Schweißroboter 5 \(Fehlt\), nicht erfasst bei Schweißroboter 5 \(Fehlt\), SWR5-02/,
    );
    const karte = text(element(html, 'li', 'data-marie-anlage', 'SWR5')!);
    assert.match(karte, /^Schweißroboter 5 Gesperrt 1 von 7 bestätigt 4 fehlerhaft/);
    assert.match(text(element(html, 'details', 'data-warum-anlage', 'SWR5')!), /2 Labels laut Anlagenliste nicht erfasst\./);
    assert.match(text(element(html, 'details', 'data-warum-zahl', 'gesamt')!), /Schweißroboter 5: 7 Labels/);
  });
});

describe('M5 mehr Datensätze als laut Anlagenliste', () => {
  test('die Gesamtzahl sagt nicht „laut Anlagenliste“, „Warum?“ nennt beide Zahlen', () => {
    const html = marie(f.ueberzahl);
    assert.match(text(element(html, 'li', 'data-zahl', 'gesamt')!), /^Labels gesamt 20 mehr erfasst als laut Anlagenliste /);
    const warum = text(element(html, 'details', 'data-warum-zahl', 'gesamt')!);
    assert.match(warum, /Labels je Anlage: Schweißroboter 5: 5 Labels; Stanzanlage 4: 10 Labels \(laut Anlagenliste 8\); Förderband 2: 5 Labels\./);
    assert.match(text(element(marie(f.basis), 'details', 'data-warum-zahl', 'gesamt')!), /Labels je Anlage: Schweißroboter 5: 5 Labels; Stanzanlage 4: 10 Labels;/);
  });
});

describe('AK-41 Anlagen mit Sperre und Fortschritt, dringendste oben', () => {
  test('Schweißroboter 5, Stanzanlage 4, Förderband 2 mit „Gesperrt“/„Freigegeben“ und „x von y bestätigt“', () => {
    const html = marie(f.basis);
    assert.deepEqual(anlagen(html), ['SWR5', 'STA4', 'FOE2']);
    const t = (id: string) => text(element(html, 'li', 'data-marie-anlage', id)!);
    assert.match(t('SWR5'), /^Schweißroboter 5 Gesperrt 1 von 5 bestätigt 2 fehlerhaft · 2 offen · 1 erledigt/);
    assert.match(t('STA4'), /^Stanzanlage 4 Gesperrt 1 von 10 bestätigt 2 fehlerhaft · 7 offen · 1 erledigt/);
    assert.match(t('FOE2'), /^Förderband 2 Freigegeben 5 von 5 bestätigt 5 erledigt/);
    assert.match(html, /role="progressbar"[^>]*aria-label="Schweißroboter 5: 1 von 5 bestätigt"[^>]*aria-valuenow="20"/);
  });

  test('die Labels einer Auswahl stehen in Maries Reihenfolge', () => {
    assert.deepEqual(zeilen(marie(f.basis, zahl('gesamt'))).slice(0, 5), ['SWR5-05', 'SWR5-02', 'STA4-08', 'STA4-09', 'SWR5-03']);
    assert.deepEqual(zeilen(marie(f.basis, anlage('SWR5'))), ['SWR5-05', 'SWR5-02', 'SWR5-03', 'SWR5-01', 'SWR5-04']);
  });
});

describe('AK-42 Klick auf Zahl oder Anlage zeigt die Labels dahinter', () => {
  test('jede Zahl und jede Anlage ist ein Verweis auf ihre Liste', () => {
    const html = marie(f.basis);
    for (const z of ['gesamt', 'offen', 'erledigt', 'fehlerhaft']) assert.match(html, new RegExp(`<a href="#/marie/zahl/${z}"`), z);
    for (const a of ['SWR5', 'STA4', 'FOE2']) assert.match(html, new RegExp(`<a href="#/marie/anlage/${a}"`), a);
    assert.doesNotMatch(html, /data-auswahl/, 'ohne Auswahl keine Liste');
  });

  test('„Fehlerhaft“: genau die 4 Labels mit Foto, Status und Grund', () => {
    const html = marie(f.basis, zahl('fehlerhaft'));
    assert.equal(text(element(html, 'h2', 'id', 'auswahl-titel')!), 'Fehlerhaft: 4 Labels');
    assert.deepEqual(zeilen(html), ['SWR5-05', 'SWR5-02', 'STA4-08', 'STA4-09']);
    const z = (id: string) => element(html, 'li', 'data-marie-label', id)!;
    assert.match(text(z('SWR5-02')), /Label SWR5-02 Schweißroboter 5 Fehlerhaft Von Max gemeldet \(Label beschädigt\), wartet auf Nachbesserung\./);
    assert.match(z('SWR5-02'), /<img src="\/bilder\/SWR5-02\.svg" alt="Foto von Label SWR5-02"/);
    assert.match(text(z('SWR5-05')), /Kein Foto Label SWR5-05 Schweißroboter 5 Fehlt Label nicht erfasst: kein Foto vorhanden\./);
    assert.match(text(z('STA4-09')), /Unsicher Sprache nicht sicher erkannt\. Max muss genau hinsehen\. Vorgeschlagene Sprachen: Deutsch 95 %, Russisch 50 %, Polnisch 87 %/);
    assert.match(html, /aria-current="true"[^>]*>[^]*?Ausgewählt: Labels stehen unten/);
  });

  test('jede Zahl zeigt so viele Zeilen, wie sie sagt; Anlagen ebenso', () => {
    for (const z of ['gesamt', 'offen', 'erledigt', 'fehlerhaft'] as const) {
      assert.equal(zeilen(marie(f.basis, zahl(z))).length, f.basis.zahlen[z], z);
    }
    for (const a of f.basis.anlagen) assert.equal(zeilen(marie(f.basis, anlage(a.id))).length, a.gesamt, a.id);
  });

  test('jede Zeile hat Foto (oder „Kein Foto“), Statuswort mit Farbe und einen Grund', async () => {
    const { STATUS_ANZEIGE } = await lade(vite, '/status.ts');
    const html = marie(f.basis, zahl('gesamt'));
    for (const l of f.basis.labels) {
      const z = element(html, 'li', 'data-marie-label', l.schluessel)!;
      const { wort, klasse } = STATUS_ANZEIGE[l.status];
      assert.match(z, new RegExp(`<span class="[^"]*${klasse}[^"]*"[^>]*>${wort}</span>`), l.schluessel);
      assert.ok(text(z).includes(l.grund), l.schluessel);
      assert.ok(/<img /.test(z) || text(z).startsWith('Kein Foto'), l.schluessel);
    }
  });

  test('unbekannte Anlage: Hinweis statt Liste', () => {
    const html = marie(f.basis, anlage('XYZ9'));
    assert.match(text(html), /Anlage nicht gefunden Diese Anlage gibt es nicht\./);
    assert.deepEqual(zeilen(html), []);
  });

  test('leere Zahl: ein Satz statt einer leeren Liste', () => {
    assert.match(text(marie(f.fertig, zahl('fehlerhaft'))), /Fehlerhaft: 0 Labels .* Kein Label ist fehlerhaft, unsicher oder nicht erfasst\./);
  });
});

describe('AK-43 „Warum?“ erklärt jede Zahl, jede Sperre und jeden Status', () => {
  test('jede Zahl nennt ihre Regel und genau die gezählten Labels', () => {
    const html = marie(f.basis);
    for (const z of ['offen', 'erledigt', 'fehlerhaft'] as const) {
      const warum = text(element(html, 'details', 'data-warum-zahl', z)!);
      assert.match(warum, new RegExp(`^Warum ${f.basis.zahlen[z]} ${z}\\? Gezählt werden`), z);
      const genannt = [...warum.matchAll(/([A-Z0-9]+-\d\d) \(/g)].map((m) => m[1]).sort();
      assert.deepEqual(genannt, f.basis.labels.filter((l) => l.gruppe === z).map((l) => l.schluessel).sort(), z);
    }
    assert.match(text(element(html, 'details', 'data-warum-zahl', 'fehlerhaft')!), /„Fehlerhaft“.*„Unsicher“.*„Fehlt“/);
  });

  test('jede Anlage sagt, warum sie gesperrt oder freigegeben ist', () => {
    const html = marie(f.basis);
    const swr5 = text(element(html, 'details', 'data-warum-anlage', 'SWR5')!);
    assert.equal(
      swr5,
      'Warum ist Schweißroboter 5 gesperrt? 1 Label „Fehlt“ (kein Foto): SWR5-05. 1 Label „Fehlerhaft“ (von Max gemeldet, wartet auf ' +
        'Nachbesserung): SWR5-02. 1 Label „Nachgebessert“ (wartet auf erneute Prüfung durch Max): SWR5-03. 1 Label „Offen“ (wartet ' +
        "auf Max' Prüfung): SWR5-01.",
    );
    assert.match(text(element(html, 'details', 'data-warum-anlage', 'FOE2')!), /^Warum ist Förderband 2 freigegeben\? Max hat die Anlage am 09\.10\.2026 freigegeben\./);
    assert.match(
      text(element(marie(f.sta4Bestaetigt), 'details', 'data-warum-anlage', 'STA4')!),
      /Alle Labels sind bestätigt\. Max hat die Anlage noch nicht freigegeben\./,
    );
  });

  test('jedes Label: Belege für den Status und woran die Sprache erkannt wurde, mit Markierungen', () => {
    const html = marie(f.basis, zahl('gesamt'));
    const neun = element(html, 'details', 'data-warum-label', 'STA4-09')!;
    assert.match(text(neun), /Russisch 50 %, Polnisch 87 %: unter 90 % gilt eine Sprache als nicht sicher erkannt\./);
    assert.match(neun, /<h4 id="warum-STA4-09"[^>]*>Woran die Sprache erkannt wurde<\/h4>/);
    assert.match(neun, /<mark[^>]*data-sprache="de"/);
    assert.match(text(element(html, 'details', 'data-warum-label', 'FOE2-01')!), /Max hat FOE2-01 am 09\.10\.2026 bestätigt\./);
    assert.doesNotMatch(element(html, 'details', 'data-warum-label', 'SWR5-05')!, /Woran die Sprache/, 'ohne Foto keine Sprachbelege');
  });

  test('jedes „Warum?“ hat einen eigenen Namen, auch für Bildschirmleser', () => {
    for (const [name, html] of Object.entries(alleSeiten())) {
      const namen = [...html.matchAll(/<summary[^>]*>([^]*?)<\/summary>/g)].map((m) => text(m[1]!));
      assert.equal(new Set(namen).size, namen.length, `${name}: ${namen.join(' | ')}`);
    }
    assert.match(marie(f.ohneDatensatz, anlage('SWR5')), /Warum\?<span class="sr-only"> \(nicht erfasstes Label 2 von Schweißroboter 5\)<\/span>/);
  });

  test('„auffällig“ ist bei Marie erklärt: kein Fehler, Max soll genauer hinsehen', () => {
    const html = marie(f.basis, zahl('gesamt'));
    const mitGruenden = f.basis.labels.filter((l) => l.label && l.label.gruende.length > 0 && l.status !== 'fehlt');
    assert.ok(mitGruenden.length > 0);
    for (const l of mitGruenden) {
      assert.match(text(element(html, 'details', 'data-warum-label', l.schluessel)!), /Warum auffällig Auffällig heißt: Max soll genauer hinsehen\. Es ist kein Fehler\./, l.schluessel);
    }
  });

  test('keine doppelten Kennungen, obwohl viele „Warum?“ auf einer Seite stehen', () => {
    for (const [name, html] of Object.entries(alleSeiten())) {
      const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
      assert.equal(new Set(ids).size, ids.length, name);
    }
  });
});

describe('AK-44 sofort aktuell', () => {
  test('Quelltext: die Seite hört auf das Signal, lädt beim Öffnen einmal, verbindet sich selbst neu, ist verdeckt ohne Verbindung (Verhalten: Browser-Test)', () => {
    const quelle = readFileSync(join(UI, 'marie', 'MarieSeite.tsx'), 'utf8');
    assert.match(quelle, /new EventSource\(EREIGNISSE\)/);
    assert.match(quelle, /onmessage = \(\) => void laden\(\)/);
    // Beim Öffnen lädt nur die erste Nachricht (R15); kommt keine Verbindung zustande, lädt die Seite einmal selbst.
    assert.doesNotMatch(quelle, /useEffect\(\(\) => \{\s*void laden\(\);/, 'kein eigenes Laden vor der ersten Nachricht');
    assert.match(quelle, /onerror = \(\) => \{[^}]*if \(letzte\.current === null\) void laden\(\);/, 'Rückfall ohne Verbindung');
    assert.match(quelle, /visibilitychange/);
    assert.match(quelle, /visibilityState === 'hidden'\) trenne\(\)/, 'verdeckt: Verbindung zu');
    assert.match(quelle, /readyState === EventSource\.CLOSED\) wartet = setTimeout\(verbinde/, 'aufgegebene Verbindung selbst neu öffnen');
    assert.match(readFileSync(join(UI, 'api.ts'), 'utf8'), /export const EREIGNISSE = '\/api\/ereignisse';/);
  });

  test('Zeit der letzten Aktualisierung sichtbar; ohne Verbindung ein deutlicher Hinweis', () => {
    assert.match(text(element(marie(f.basis), 'p', 'data-aktualisiert', '')!), /^Aktualisiert um 04:12:05\. Die Übersicht aktualisiert sich von selbst\.$/);
    const getrennt = element(marie(f.basis, null, { verbunden: false }), 'p', 'data-aktualisiert', '')!;
    assert.match(text(getrennt), /Stand 04:12:05\. Gerade keine Verbindung zum Server, die Zahlen sind vielleicht nicht aktuell\./);
    // Bildschirmleser erfahren den Abbruch sofort; die Uhrzeit beim normalen Nachladen wird nicht angesagt.
    assert.match(getrennt, /role="alert"/);
    assert.doesNotMatch(element(marie(f.basis), 'p', 'data-aktualisiert', '')!, /role=/);
  });

  test('Ansage nur, wenn sich Zahlen oder Freigaben von selbst ändern', () => {
    const { aenderungsAnsage } = M.logik!;
    assert.equal(aenderungsAnsage(f.basis, structuredClone(f.basis)), null);
    assert.equal(aenderungsAnsage(f.basis, f.sta4Bestaetigt), 'Neuer Stand: 20 gesamt, 4 offen, 16 erledigt, 0 fehlerhaft.');
    assert.equal(
      aenderungsAnsage(f.sta4Bestaetigt, f.fertig),
      'Neuer Stand: 20 gesamt, 0 offen, 20 erledigt, 0 fehlerhaft. Stanzanlage 4 ist jetzt freigegeben. Schweißroboter 5 ist jetzt freigegeben.',
    );
    const wiederGesperrt = { ...f.fertig, anlagen: f.fertig.anlagen.map((a) => (a.id === 'FOE2' ? { ...a, gesperrt: true } : a)) };
    assert.equal(aenderungsAnsage(f.fertig, wiederGesperrt), 'Neuer Stand: 20 gesamt, 0 offen, 20 erledigt, 0 fehlerhaft. Förderband 2 ist wieder gesperrt.');
  });
});

describe('AK-46 Marie sieht nur', () => {
  test('auf keiner ihrer Seiten gibt es einen Knopf oder ein Eingabefeld', () => {
    for (const [name, html] of Object.entries(alleSeiten())) {
      assert.equal(zaehle(html, '<button'), 0, name);
      assert.doesNotMatch(html, /<input|<textarea|<select|contenteditable|<form/, name);
      assert.doesNotMatch(text(html), /\b(bestätigen|Fehler melden|freigeben|Nachbesserung simulieren|Foto nachreichen|zurücknehmen|Rückgängig)\b/, name);
    }
  });

  test('jeder Verweis auf Maries Seiten bleibt bei Marie; keine Anrede an Max', () => {
    for (const [name, html] of Object.entries(alleSeiten())) {
      // Nur Verweise zählen; React setzt beim Rendern auf dem Server zusätzlich <link rel="preload"> für die Fotos.
      const ziele = [...html.matchAll(/<a\b[^>]*\bhref="([^"]*)"/g)].map((m) => m[1]!);
      assert.ok(ziele.length >= 7, name);
      for (const ziel of ziele) assert.match(ziel, /^#\/marie(\/|$)/, `${name}: ${ziel}`);
      // Ohne die Texte der Labels selbst (Abschnitt „Woran die Sprache erkannt wurde“), die dürfen „Sie“ enthalten.
      const eigene = html.replace(/<section[^>]*aria-labelledby="warum-[^"]*"[^>]*>[^]*?<\/section>/g, '');
      assert.doesNotMatch(text(eigene), /für Sie|\bIhre?\b/, name);
    }
  });

  test('Maries Dateien binden nur Lesendes und reine Ansichten ein', () => {
    const erlaubt = ['../api.ts', '../pruefung/logik.ts', '../pruefung/Warum.tsx', '../rahmen.tsx', '../route.ts', '../status.ts', './logik.ts', './MarieAnsicht.tsx', 'react'];
    const ordner = join(UI, 'marie');
    for (const datei of readdirSync(ordner)) {
      for (const [, quelle] of readFileSync(join(ordner, datei), 'utf8').matchAll(/from '([^']+)'/g)) assert.ok(erlaubt.includes(quelle!), `${datei}: ${quelle}`);
    }
  });

  test('Maries Dateien binden nichts Schreibendes ein', () => {
    const ordner = join(UI, 'marie');
    for (const datei of readdirSync(ordner)) {
      const inhalt = readFileSync(join(ordner, datei), 'utf8');
      assert.doesNotMatch(inhalt, /aktionen\.ts|X-Rolle|method:|sendeAlsMax|fetch\(/, datei);
    }
  });
});

describe('Antwort auf „Ist alles geprüft?“', () => {
  test('nein, alles bestätigt aber nicht freigegeben, ja', () => {
    assert.match(text(marie(f.basis)), /^Ist alles geprüft\? Nein\. 13 von 20 Labels sind noch nicht erledigt\./);
    assert.match(text(marie(f.fertig)), /^Ist alles geprüft\? Ja\. Alle 20 Labels sind bestätigt und alle Anlagen freigegeben\./);
    const teil = { ...f.fertig, anlagen: f.fertig.anlagen.map((a) => (a.id === 'STA4' ? { ...a, gesperrt: true } : a)) };
    assert.match(text(marie(teil)), /Alle 20 Labels sind bestätigt\. Noch nicht freigegeben: Stanzanlage 4\./);
  });
});

describe('Querschnitt (AK-14, AK-21, AK-61)', () => {
  test('Überschriften ohne Sprung: h1, Zahlen, Liste, Anlagen', () => {
    for (const [name, html] of Object.entries(alleSeiten())) {
      const ebenen = [...html.matchAll(/<h(\d)\b/g)].map((m) => Number(m[1]));
      assert.equal(ebenen[0], 1, name);
      for (let i = 1; i < ebenen.length; i++) assert.ok(ebenen[i]! <= ebenen[i - 1]! + 1, `${name}: h${ebenen[i - 1]} → h${ebenen[i]}`);
    }
  });

  test('kein Element trägt zwei Hintergrund-, Rahmen- oder Schriftfarben', () => {
    for (const [name, html] of Object.entries(alleSeiten())) {
      for (const [, klassen] of html.matchAll(/class="([^"]*)"/g)) {
        const liste = klassen!.split(/\s+/);
        for (const art of ['bg', 'border', 'text']) {
          const farben = liste.filter((k) => new RegExp(`^${art}-(white|black|[a-z]+-\\d{2,3})$`).test(k));
          assert.ok(farben.length <= 1, `${name}: ${farben.join(' ')} in „${klassen}“`);
        }
      }
    }
  });

  test('keine Fachwörter, keine Erwartungswerte, keine Soll-Sprache', () => {
    const notizen = Object.values(erwartungen()).flatMap((e) => (e.notiz ? [e.notiz] : []));
    for (const [name, html] of Object.entries(alleSeiten())) {
      const t = text(html);
      assert.doesNotMatch(t, /\b(OCR|Konfidenz|API|LLM|JSON|null|undefined|NaN|Status-Code)\b/, name);
      assert.doesNotMatch(t, /erwart|Soll-Sprache|gefordert/i, name);
      for (const n of notizen) assert.ok(!t.includes(n), `${name}: ${n}`);
    }
  });

  test('Rahmen für Marie: eigene Kopfzeile, Hinweis „Testversion“, Weg zur Label-Prüfung', () => {
    const html = rendere(M.rahmen!.Rahmen, { bereich: 'marie', children: 'x' });
    assert.match(text(html), /Übersicht · Marie \(Fertigungsleitung\)/);
    assert.match(text(html), /Testversion: Texterkennung und Spracherkennung sind simuliert\./);
    assert.match(html, /<a href="#\/"[^>]*>Rolle wechseln \(nur im Prototyp\): Label-Prüfung von Max<\/a>/);
    assert.deepEqual([...html.matchAll(/<a\b[^>]*\bhref="([^"]*)"/g)].map((m) => m[1]), ['#/marie', '#/'], 'sonst kein Weg zu Max oder zur Simulation');
    assert.doesNotMatch(html, /Simulation: Instandhaltung/, 'die Simulation gehört nicht zu Maries Seiten');
    assert.match(rendere(M.rahmen!.Rahmen, { children: 'x' }), /<a href="#\/marie"[^>]*>Übersicht für Marie \(Fertigungsleitung\)<\/a>/);
  });

  test('„Warum?“-Schalter sind groß genug zum Antippen', () => {
    const html = marie(f.basis, zahl('gesamt'));
    for (const [, klassen] of html.matchAll(/<summary class="([^"]*)"/g)) assert.match(klassen!, /\bmin-h-12\b/);
  });
});

describe('Adressen für Maries Seiten', () => {
  test('#/marie, #/marie/zahl/<zahl>, #/marie/anlage/<ID>; alles andere ist unbekannt', () => {
    const { leseRoute, zuMarie, zurMarieAnlage, zurMarieZahl } = M.route!;
    assert.deepEqual(leseRoute('#/marie'), { seite: 'marie', auswahl: null });
    assert.deepEqual(leseRoute('#/marie/zahl/fehlerhaft'), { seite: 'marie', auswahl: { art: 'zahl', zahl: 'fehlerhaft' } });
    assert.deepEqual(leseRoute('#/marie/anlage/STA4'), { seite: 'marie', auswahl: { art: 'anlage', anlageId: 'STA4' } });
    for (const h of ['#/marie/zahl/alle', '#/marie/anlage/sta4', '#/marie/', '#/marie/anlage/STA4/label/STA4-01', '#/marie/zahl/']) {
      assert.deepEqual(leseRoute(h), { seite: 'unbekannt' }, h);
    }
    assert.equal(zuMarie(), '#/marie');
    // Auch eine fehlerhafte Adresse unter #/marie bleibt in Maries Rahmen, ohne Wege zu Max.
    const { bereichDerAdresse } = M.route!;
    for (const h of ['#/marie', '#/marie/', '#/marie/anlage/sta4', '#/Marie', '#/marie/zahl/alle']) assert.equal(bereichDerAdresse(h), 'marie', h);
    for (const h of ['', '#/', '#/anlage/STA4', '#/xyz', '#/marienkaefer']) assert.equal(bereichDerAdresse(h), 'max', h);
    assert.equal(bereichDerAdresse('#/simulation'), 'simulation');
    assert.equal(zurMarieZahl('offen'), '#/marie/zahl/offen');
    assert.equal(zurMarieAnlage('SWR5'), '#/marie/anlage/SWR5');
  });
});
