// Oberfläche, Ansichten: Bausteine werden über Vite geladen und mit echten Antworten des Servers
// zu HTML gerendert (AK-01, AK-02, AK-10 bis AK-21).

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { ViteDevServer } from 'vite';
import type { AnlageAnsicht, AnlageMitLabels, LabelAnsicht, Zusammenfassung } from '../src/ui/api.ts';
import { element, json, lade, mitServer, rendere, starteVite, text, zaehle } from './ui-hilfe.ts';

let vite: ViteDevServer;
let M: Record<string, Record<string, any>>;

const f = {} as {
  anlagen: AnlageAnsicht[];
  sta4: AnlageMitLabels;
  sta4NachSta407: AnlageMitLabels;
  sta4Fertig: AnlageMitLabels;
  sta4Zusammenfassung: Zusammenfassung;
  sta4NachRuecknahme: AnlageMitLabels;
  freigabeAbgelehnt: { fehler: string; details: { labelId: string | null; text: string }[] };
  swr5: AnlageMitLabels;
  swr5Fertig: AnlageMitLabels;
  swr5Zusammenfassung: Zusammenfassung;
  foe2: AnlageMitLabels;
};

const alle = (d: AnlageMitLabels) => [...d.labels, ...d.ausserhalbDerPruefung];
const label = (d: AnlageMitLabels, id: string): LabelAnsicht => alle(d).find((l) => l.id === id)!;

before(async () => {
  vite = await starteVite();
  M = {
    start: await lade(vite, '/start/Startseite.tsx'),
    uebersicht: await lade(vite, '/pruefung/Uebersicht.tsx'),
    kachel: await lade(vite, '/pruefung/Kachel.tsx'),
    einzel: await lade(vite, '/pruefung/Einzelansicht.tsx'),
    warum: await lade(vite, '/pruefung/Warum.tsx'),
    zusammenfassung: await lade(vite, '/pruefung/Zusammenfassung.tsx'),
    rahmen: await lade(vite, '/rahmen.tsx'),
    simulation: await lade(vite, '/simulation/Simulation.tsx'),
  };
  await mitServer(async (s) => {
    f.anlagen = await json(s, '/api/anlagen');
    f.sta4 = await json(s, '/api/anlagen/STA4/labels');
    f.swr5 = await json(s, '/api/anlagen/SWR5/labels');
    f.foe2 = await json(s, '/api/anlagen/FOE2/labels');
    await json(s, '/api/labels/STA4-07/bestaetigen', 'POST');
    f.sta4NachSta407 = await json(s, '/api/anlagen/STA4/labels');
    // Stanzanlage 4 bis alles bestätigt ist: STA4-08 melden und nachbessern, dann alle einzeln bestätigen.
    await json(s, '/api/labels/STA4-08/fehler', 'POST', { grund: 'unleserlich' });
    await json(s, '/api/labels/STA4-08/nachbessern', 'POST');
    for (const l of (await json(s, '/api/anlagen/STA4/labels')).labels) {
      if (l.status !== 'bestaetigt') await json(s, `/api/labels/${l.id}/bestaetigen`, 'POST');
    }
    f.sta4Fertig = await json(s, '/api/anlagen/STA4/labels');
    f.sta4Zusammenfassung = await json(s, '/api/anlagen/STA4/zusammenfassung');
    // Eine Freigabe, die der Server ablehnt: STA4-03 wurde inzwischen zurückgenommen (etwa in einem zweiten Fenster).
    await json(s, '/api/labels/STA4-03/zuruecknehmen', 'POST');
    const abgelehnt = await fetch(`${s.url}/api/anlagen/STA4/freigeben`, { method: 'POST', headers: { 'X-Rolle': 'max' } });
    assert.equal(abgelehnt.status, 409);
    f.freigabeAbgelehnt = await abgelehnt.json();
    f.sta4NachRuecknahme = await json(s, '/api/anlagen/STA4/labels');
    await json(s, '/api/labels/STA4-03/bestaetigen', 'POST');
    // Schweißroboter 5: alles bestätigen, was Max prüfen kann.
    for (const id of ['SWR5-01', 'SWR5-03']) await json(s, `/api/labels/${id}/bestaetigen`, 'POST');
    f.swr5Fertig = await json(s, '/api/anlagen/SWR5/labels');
    f.swr5Zusammenfassung = await json(s, '/api/anlagen/SWR5/zusammenfassung');
  });
});
after(async () => {
  await vite.close();
});

const ohneEreignis = () => {};

function uebersicht(daten: AnlageMitLabels, mehr: Record<string, unknown> = {}): string {
  return rendere(M.uebersicht!.Uebersicht, {
    zustand: {
      daten,
      kacheln: daten.labels,
      nurAuffaellige: false,
      speichert: false,
      meldung: null,
      fehler: null,
      zusammenfassung: null,
      rueckfrage: false,
      freigabeFehler: null,
      ...mehr,
    },
    ereignis: ohneEreignis,
  });
}

function einzel(daten: AnlageMitLabels, id: string, mehr: Record<string, unknown> = {}): string {
  return rendere(M.einzel!.Einzelansicht, {
    daten: { anlage: daten.anlage, label: label(daten, id), zustand: 'bereit', warumOffen: false, fotoGross: false, fehler: null, meldung: null, ...mehr },
    ereignis: ohneEreignis,
  });
}

function kachel(l: LabelAnsicht, foto: 'laedt' | 'da' | 'fehlt', gesperrt = false): string {
  return rendere(M.kachel!.KachelAnsicht, { label: l, gesperrt, onBestaetigen: ohneEreignis, foto });
}

const kacheln = (html: string) => [...html.matchAll(/data-kachel="([^"]+)"/g)].map((m) => m[1]);
const knoepfe = (html: string) => [...html.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/g)].map((m) => text(m[1]!));

describe('AK-01 Gesperrt oder Freigegeben', () => {
  test('Startseite: Stanzanlage 4 und Schweißroboter 5 „Gesperrt“, Förderband 2 „Freigegeben“, gesperrte zuerst', () => {
    const html = rendere(M.start!.StartAnsicht, { anlagen: f.anlagen });
    assert.match(text(element(html, 'a', 'data-anlage', 'STA4')!), /Gesperrt/);
    assert.match(text(element(html, 'a', 'data-anlage', 'SWR5')!), /Gesperrt/);
    assert.match(text(element(html, 'a', 'data-anlage', 'FOE2')!), /Freigegeben/);
    const reihenfolge = [...html.matchAll(/data-anlage="([^"]+)"/g)].map((m) => m[1]);
    assert.equal(reihenfolge.at(-1), 'FOE2');
    assert.match(text(element(html, 'a', 'data-anlage', 'STA4')!), /1 von 10 bestätigt.*Noch 9 Labels für Sie/);
    assert.match(text(element(html, 'a', 'data-anlage', 'SWR5')!), /1 Label wartet auf Nachbesserung.*1 Label ohne Foto/);
  });
  test('das Wort kommt aus „gesperrt“ des Servers: alle bestätigt, aber gesperrt → „Gesperrt“', () => {
    const sta4 = { ...f.sta4Fertig.anlage, gesperrt: true };
    const html = rendere(M.start!.StartAnsicht, { anlagen: [sta4] });
    assert.match(text(html), /Gesperrt/);
    assert.doesNotMatch(text(html), /Freigegeben/);
    assert.match(text(uebersicht({ ...f.sta4Fertig, anlage: sta4 })), /Stanzanlage 4 Gesperrt/);
  });
});

describe('AK-02 Zusammenfassung und Freigabe', () => {
  test('erst wenn der Server keine offenen Punkte meldet: alle fünf Angaben und „Anlage freigeben“', () => {
    const html = uebersicht(f.sta4Fertig, { zusammenfassung: f.sta4Zusammenfassung });
    const t = text(html);
    assert.deepEqual(f.sta4Zusammenfassung.offenePunkte, []);
    assert.match(t, /Labels 10 von 10/);
    assert.match(t, /Sicher erkannte Sprachen Deutsch, Englisch, Polnisch/);
    assert.match(t, /Davon auffällig gewesen \d+/);
    assert.match(t, /Nachgebessert 1/);
    assert.match(t, /Offene Punkte Keine offenen Punkte/);
    assert.deepEqual(knoepfe(html).filter((k) => /freigeben/i.test(k)), ['Anlage freigeben']);
  });
  test('ohne Zusammenfassung vom Server oder mit prüfbaren Labels: kein Freigabeknopf', () => {
    assert.doesNotMatch(uebersicht(f.sta4Fertig), /Anlage freigeben/);
    assert.doesNotMatch(uebersicht(f.sta4, { zusammenfassung: f.sta4Zusammenfassung }), /Anlage freigeben/);
  });
  test('Schweißroboter 5: alles Prüfbare bestätigt, aber gesperrt: Gründe des Servers, keine Zusammenfassung, kein Knopf', () => {
    const html = uebersicht(f.swr5Fertig, { zusammenfassung: f.swr5Zusammenfassung });
    const t = text(html);
    assert.match(t, /Sie haben alle Labels geprüft, die Sie jetzt prüfen können\. Die Anlage bleibt gesperrt, weil:/);
    for (const p of f.swr5Zusammenfassung.offenePunkte) assert.ok(t.includes(p.text), p.text);
    assert.doesNotMatch(html, /Anlage freigeben|Zusammenfassung: alle Labels/);
  });
  test('Rückfrage: beschriftete Gruppe, „Abbrechen“ steht vor „Ja, freigeben“', () => {
    const html = uebersicht(f.sta4Fertig, { zusammenfassung: f.sta4Zusammenfassung, rueckfrage: true });
    assert.match(html, /<div role="group" aria-labelledby="rueckfrage-titel" aria-describedby="rueckfrage-text" data-rueckfrage=""/);
    assert.match(text(html), /Stanzanlage 4 jetzt freigeben\?/);
    assert.deepEqual(knoepfe(html).filter((k) => /Abbrechen|freigeben/.test(k)), ['Abbrechen', 'Ja, freigeben']);
  });
  test('abgelehnte Freigabe: Meldung und Gründe des Servers stehen auch nach dem Neuladen da', () => {
    // Nach der Ablehnung lädt die Seite neu; die Zusammenfassung ist dann weg, weil STA4-03 wieder offen ist.
    const { fehler, details } = f.freigabeAbgelehnt;
    assert.ok(details.some((d) => d.labelId === 'STA4-03'));
    const html = uebersicht(f.sta4NachRuecknahme, { freigabeFehler: { text: fehler, gruende: details } });
    const t = text(html);
    assert.match(t, /Stanzanlage 4 kann noch nicht freigegeben werden\./);
    for (const d of details) assert.ok(t.includes(d.text), d.text);
    assert.doesNotMatch(t, /Zusammenfassung: alle Labels/);
    assert.ok(html.indexOf('kann noch nicht freigegeben') < html.indexOf('data-kachel='), 'über den Kacheln');
  });
  test('Zusammenfassung und „bleibt gesperrt“ stehen über den Kacheln', () => {
    const fertig = uebersicht(f.sta4Fertig, { zusammenfassung: f.sta4Zusammenfassung });
    assert.ok(fertig.indexOf('Zusammenfassung: alle Labels bestätigt') < fertig.indexOf('data-kachel='));
    const swr5 = uebersicht(f.swr5Fertig, { zusammenfassung: f.swr5Zusammenfassung });
    assert.ok(swr5.indexOf('data-bleibt-gesperrt') > 0 && swr5.indexOf('data-bleibt-gesperrt') < swr5.indexOf('data-kachel='));
  });
  test('freigegebene Anlage: „Freigegeben“ mit Datum, keine Zusammenfassung, kein Knopf', () => {
    const t = text(uebersicht(f.foe2));
    assert.match(t, /Förderband 2 Freigegeben/);
    assert.match(t, /Freigegeben am \d/);
    assert.doesNotMatch(t, /Anlage freigeben|Warum noch gesperrt/);
  });
});

describe('AK-10, AK-11 einzeln entscheiden', () => {
  test('Melden: genau drei Gründe mit Erklärung und „Abbrechen“, kein Eingabefeld', () => {
    const html = einzel(f.sta4, 'STA4-08', { zustand: 'gruende' });
    assert.deepEqual(knoepfe(html).slice(-4), [
      'Unleserlich auf dem Foto nicht zu lesen',
      'Sprache falsch eine Sprache fehlt oder es steht eine falsche drauf',
      'Label beschädigt eingerissen, verblasst oder verschmutzt',
      'Abbrechen',
    ]);
    assert.doesNotMatch(html, /<input|<textarea|contenteditable/);
  });
  test('Stanzanlage 4: genau 6 Kachel-Knöpfe „… bestätigen“, nur für unauffällige offene Labels', () => {
    const html = uebersicht(f.sta4);
    const bestaetigen = knoepfe(html).filter((k) => /bestätigen/.test(k));
    assert.deepEqual(bestaetigen, ['STA4-01 bestätigen', 'STA4-02 bestätigen', 'STA4-03 bestätigen', 'STA4-04 bestätigen', 'STA4-05 bestätigen', 'STA4-06 bestätigen']);
  });
  test('nirgends „Alle bestätigen“ oder ein Knopf für mehrere Labels', () => {
    const seiten = [
      uebersicht(f.sta4),
      uebersicht(f.sta4, { nurAuffaellige: true }),
      uebersicht(f.sta4Fertig, { zusammenfassung: f.sta4Zusammenfassung }),
      einzel(f.sta4, 'STA4-09'),
      rendere(M.start!.StartAnsicht, { anlagen: f.anlagen }),
    ];
    for (const html of seiten) assert.doesNotMatch(text(html), /alle (labels )?bestätigen|alle markieren|alle auswählen/i);
  });
  test('Entscheidungsknöpfe sind gesperrt, solange gespeichert wird oder das Foto lädt', () => {
    for (const zustand of ['laedt', 'speichert']) {
      const html = einzel(f.sta4, 'STA4-09', { zustand });
      for (const wort of ['Ja, bestätigen', 'Nein, Fehler melden']) {
        assert.match(html, new RegExp(`<button[^>]*disabled=""[^>]*>${wort}</button>`), `${zustand}: ${wort}`);
      }
    }
    assert.doesNotMatch(einzel(f.sta4, 'STA4-09'), /disabled=""[^>]*>Ja, bestätigen/);
  });
  test('lädt das Foto nicht: Hinweis, und beide Entscheidungsknöpfe bleiben gesperrt', () => {
    const html = einzel(f.sta4, 'STA4-09', { fotoFehlt: true });
    assert.match(text(html), /Das Foto konnte nicht geladen werden\. Ohne Foto können Sie nicht entscheiden\./);
    for (const wort of ['Ja, bestätigen', 'Nein, Fehler melden']) {
      assert.match(html, new RegExp(`<button[^>]*disabled=""[^>]*>${wort}</button>`), wort);
    }
    assert.doesNotMatch(text(einzel(f.sta4, 'STA4-09')), /Foto konnte nicht geladen werden/);
  });
  test('R10: lädt das Foto nicht, gehen „Bestätigung zurücknehmen“ und „Rückgängig“ trotzdem', () => {
    const meldung = { text: 'STA4-02 bestätigt.', rueckgaengig: 'STA4-02' };
    const zehn = einzel(f.sta4, 'STA4-10', { fotoFehlt: true, meldung });
    for (const wort of ['Bestätigung zurücknehmen', 'Rückgängig']) {
      assert.ok(knoepfe(zehn).includes(wort), wort);
      assert.doesNotMatch(zehn, new RegExp(`<button[^>]*disabled=""[^>]*>${wort}</button>`), wort);
    }
    const neun = einzel(f.sta4, 'STA4-09', { fotoFehlt: true, meldung });
    assert.doesNotMatch(neun, /<button[^>]*disabled=""[^>]*>Rückgängig<\/button>/);
    assert.match(neun, /<button[^>]*disabled=""[^>]*>Ja, bestätigen<\/button>/);
  });
  test('während gespeichert wird, sind auch die Kachel-Knöpfe gesperrt', () => {
    const html = uebersicht(f.sta4, { speichert: true });
    assert.equal(zaehle(html, /<button[^>]*disabled=""[^>]*>STA4-0\d bestätigen/), 6);
    for (const l of f.sta4.labels.filter((x) => !x.auffaellig && x.status === 'offen')) {
      assert.match(kachel(l, 'da', true), /<button[^>]*disabled=""[^>]*>STA4-0\d bestätigen/, l.id);
    }
  });
  test('R8: Kachel-Knopf erst, wenn das Foto geladen ist; lädt es nicht, ein Hinweis statt des Knopfs', () => {
    const l = label(f.sta4, 'STA4-01');
    assert.match(kachel(l, 'laedt'), /<button[^>]*disabled=""[^>]*>STA4-01 bestätigen/);
    assert.deepEqual(knoepfe(kachel(l, 'da')), ['STA4-01 bestätigen']);
    assert.doesNotMatch(kachel(l, 'da'), /disabled=""/);
    const fehlt = kachel(l, 'fehlt');
    assert.deepEqual(knoepfe(fehlt), []);
    assert.match(text(fehlt), /Das Foto lädt nicht\. Bitte in der Einzelansicht prüfen\./);
    assert.match(fehlt, /<a href="#\/anlage\/STA4\/label\/STA4-01"/);
    // Auffällige Labels haben ohnehin keinen Kachel-Knopf, also auch keinen Hinweis.
    assert.doesNotMatch(text(kachel(label(f.sta4, 'STA4-07'), 'fehlt')), /Einzelansicht prüfen/);
    // Ohne geprüfte Foto-Adresse lädt nie ein Foto: kein Knopf.
    assert.deepEqual(knoepfe(rendere(M.kachel!.Kachel, { label: { ...l, bildUrl: null }, gesperrt: false, onBestaetigen: ohneEreignis })), []);
  });
  test('R8: in der Übersicht sind die Kachel-Knöpfe gesperrt, bis das Foto geladen ist', () => {
    assert.equal(zaehle(uebersicht(f.sta4), /<button[^>]*disabled=""[^>]*>STA4-0\d bestätigen/), 6);
  });
});

describe('AK-12 gemeldet und nachgebessert', () => {
  test('SWR5-03 zeigt Max\' damalige Meldung', () => {
    assert.match(text(einzel(f.swr5, 'SWR5-03')), /Von Ihnen gemeldet: Sprache falsch/);
  });
  test('SWR5-02 ist keine Kachel, steht nur unter „Warum noch gesperrt?“, ohne Knöpfe', () => {
    const html = uebersicht(f.swr5);
    assert.ok(!kacheln(html).includes('SWR5-02'));
    assert.ok(!kacheln(html).includes('SWR5-05'));
    const warum = element(html, 'details', 'data-warum-gesperrt', '')!;
    assert.match(text(warum), /Label SWR5-02 wartet auf Nachbesserung \(von Ihnen gemeldet: Label beschädigt\)/);
    assert.match(text(warum), /Label SWR5-05: kein Foto vorhanden/);
    assert.doesNotMatch(warum, /<button/);
  });
  test('der Fortschritt zählt Nachgebessertes als offen', () => {
    assert.match(text(uebersicht(f.swr5)), /1 von 5 bestätigt/);
    assert.match(text(einzel(f.swr5, 'SWR5-03')), /Schweißroboter 5 · Label SWR5-03 · 1 von 5 bestätigt/);
  });
});

describe('AK-13 Reihenfolge der Kacheln', () => {
  test('Kacheln in der Reihenfolge des Servers: STA4-08, STA4-09, STA4-07 zuerst, „Prüfung starten“ vorhanden', () => {
    const html = uebersicht(f.sta4);
    assert.deepEqual(kacheln(html), f.sta4.labels.map((l) => l.id));
    assert.deepEqual(kacheln(html).slice(0, 3), ['STA4-08', 'STA4-09', 'STA4-07']);
    assert.ok(knoepfe(html).includes('Prüfung starten'));
  });
  test('ohne prüfbare Labels gibt es kein „Prüfung starten“', () => {
    assert.ok(!knoepfe(uebersicht(f.swr5Fertig)).includes('Prüfung starten'));
  });
});

describe('AK-14 jeder Status mit Wort und Farbe', () => {
  test('Kacheln aller sechs Status tragen Wort und Farbklasse', async () => {
    const { STATUS_ANZEIGE } = await lade(vite, '/status.ts');
    const beispiele: LabelAnsicht[] = [
      label(f.sta4, 'STA4-01'), label(f.sta4, 'STA4-09'), label(f.swr5, 'SWR5-03'),
      label(f.swr5, 'SWR5-02'), label(f.sta4, 'STA4-10'), label(f.swr5, 'SWR5-05'),
    ];
    assert.deepEqual(beispiele.map((l) => l.status).sort(), ['bestaetigt', 'fehlerhaft', 'fehlt', 'nachgebessert', 'offen', 'unsicher']);
    for (const l of beispiele) {
      const html = rendere(M.kachel!.Kachel, { label: l, gesperrt: false, onBestaetigen: ohneEreignis });
      const { wort, klasse } = STATUS_ANZEIGE[l.status];
      assert.match(html, new RegExp(`<span class="[^"]*${klasse}[^"]*"[^>]*>${wort}</span>`), l.id);
    }
  });
  test('kein Element trägt zwei Hintergrund-, Rahmen- oder Schriftfarben (sonst entscheidet Tailwind, nicht der Code)', () => {
    const seiten = {
      sta4: uebersicht(f.sta4, { nurAuffaellige: true }),
      alle: uebersicht(f.sta4),
      fertig: uebersicht(f.sta4Fertig, { zusammenfassung: f.sta4Zusammenfassung, rueckfrage: true }),
      sta408: einzel(f.sta4, 'STA4-08', { zustand: 'gruende', warumOffen: true }),
      sta409: einzel(f.sta4, 'STA4-09', { warumOffen: true }),
      swr503: einzel(f.swr5, 'SWR5-03'),
    };
    for (const [name, html] of Object.entries(seiten)) {
      for (const [, klassen] of html.matchAll(/class="([^"]*)"/g)) {
        const liste = klassen!.split(/\s+/);
        for (const art of ['bg', 'border', 'text']) {
          const farben = liste.filter((k) => new RegExp(`^${art}-(white|black|[a-z]+-\\d{2,3})$`).test(k));
          assert.ok(farben.length <= 1, `${name}: ${farben.join(' ')} in „${klassen}“`);
        }
      }
    }
  });
  test('der gewählte Filter und das schlecht lesbare Textfeld sind auch farbig markiert', () => {
    const html = uebersicht(f.sta4, { nurAuffaellige: true });
    assert.match(html, /class="[^"]*\bbg-blue-50\b[^"]*" aria-pressed="true"/);
    assert.match(html, /class="[^"]*\bbg-white\b[^"]*" aria-pressed="false"/);
    assert.match(einzel(f.sta4, 'STA4-08'), /class="[^"]*\bbg-red-50\b[^"]*"[^>]*data-schlecht-lesbar=""/);
  });
});

describe('AK-15, AK-16 Einzelansicht', () => {
  test('STA4-09: Foto, ganzer Text, alle Sprachen mit Prozent', () => {
    const l = label(f.sta4, 'STA4-09');
    const html = einzel(f.sta4, 'STA4-09');
    assert.match(html, /<img[^>]*src="\/bilder\/STA4-09\.svg"[^>]*alt="Foto von Label STA4-09"/);
    assert.match(text(html), /Vom Foto abgelesener Text \(automatisch, kann Fehler enthalten\)/);
    const textfeld = element(html, 'p', 'data-text', '')!;
    const ohneKuerzel = textfeld.replace(/<span[^>]*aria-hidden="true"[^>]*>[^<]*<\/span>/g, '').replace(/<span class="sr-only">[\s\S]*?<\/span>/g, '');
    // Tags ohne Leerzeichen entfernen: so ergibt der markierte Text wieder genau den abgelesenen Text.
    assert.equal(text(ohneKuerzel.replace(/<[^>]+>/g, '')), l.ocrText.replace(/\s+/g, ' '));
    for (const zeile of ['Deutsch 95 % – sicher erkannt', 'Russisch 50 % – nicht sicher', 'Polnisch 87 % – nicht sicher']) {
      assert.ok(text(html).includes(zeile), zeile);
    }
  });
  test('STA4-09: kyrillische Stellen markiert und „nicht sicher“, Deutsch bleibt unmarkiert', () => {
    const textfeld = element(einzel(f.sta4, 'STA4-09'), 'p', 'data-text', '')!;
    const sprachen = new Set([...textfeld.matchAll(/data-sprache="([a-z]+)"/g)].map((m) => m[1]));
    assert.ok(sprachen.has('ru'));
    assert.ok(!sprachen.has('de'));
    assert.match(textfeld, /nicht sicher/);
    assert.match(text(einzel(f.sta4, 'STA4-09')), /Markiert sind Stellen in Sprachen, die nicht sicher erkannt wurden: RU = Russisch 50 %, nicht sicher/);
    assert.match(text(einzel(f.sta4, 'STA4-09')), /Sprache nicht sicher erkannt/);
  });
  test('STA4-08: „Keine Sprache erkannt“ und „Text schlecht lesbar“, Textfeld markiert', () => {
    const html = einzel(f.sta4, 'STA4-08');
    assert.match(text(html), /Keine Sprache erkannt/);
    assert.match(text(html), /Text schlecht lesbar/);
    assert.match(html, /data-schlecht-lesbar=""/);
  });
  test('0,896 erscheint als „89 %“, nie als „90 %“', () => {
    const l = label(f.sta4, 'STA4-01');
    const fast = { ...l, sprachen: [{ code: 'de', name: 'Deutsch', konfidenz: 0.896, sicher: false }] };
    const html = rendere(M.einzel!.Einzelansicht, {
      daten: { anlage: f.sta4.anlage, label: fast, zustand: 'bereit', warumOffen: false, fotoGross: false, fehler: null, meldung: null },
      ereignis: ohneEreignis,
    });
    assert.match(text(html), /Deutsch 89 % – nicht sicher/);
    assert.doesNotMatch(text(html), /90 %/);
  });
  test('bestätigtes Label: Zurücknehmen nur vor der Freigabe (F5)', () => {
    assert.ok(knoepfe(einzel(f.sta4, 'STA4-10')).includes('Bestätigung zurücknehmen'));
    assert.ok(!knoepfe(einzel(f.foe2, 'FOE2-01')).includes('Bestätigung zurücknehmen'));
    assert.ok(!knoepfe(einzel(f.sta4, 'STA4-10')).includes('Ja, bestätigen'));
  });
  test('gemeldetes Label und Label ohne Foto: keine Entscheidungsknöpfe', () => {
    for (const id of ['SWR5-02', 'SWR5-05']) {
      const k = knoepfe(einzel(f.swr5, id));
      assert.ok(!k.some((x) => /bestätigen|Fehler melden|zurücknehmen/.test(x)), id);
    }
  });
});

describe('AK-17 Kachelübersicht', () => {
  test('Zählzeile, Balken, Erklärung „auffällig“', () => {
    const html = uebersicht(f.sta4);
    assert.equal(text(element(html, 'p', 'data-zaehlzeile', '')!), '10 Labels: 3 auffällig, 6 unauffällig, 1 bestätigt');
    assert.match(html, /role="progressbar"[^>]*aria-valuenow="10"/);
    assert.match(text(html), /Auffällig heißt: bitte genauer hinsehen\. Es ist kein Fehler\./);
  });
  test('jede Kachel: Vorschaubild mit Alternativtext, erste Wörter, Sprachen, Status', () => {
    const html = uebersicht(f.sta4);
    for (const l of f.sta4.labels) {
      const k = element(html, 'li', 'data-kachel', l.id)!;
      assert.match(k, new RegExp(`<img[^>]*src="/bilder/${l.id}\\.svg"[^>]*alt="Foto von Label ${l.id}"`), l.id);
      assert.ok(text(k).includes(l.ocrText.split(/\s+/)[0]!), `${l.id} erste Wörter`);
      assert.ok(text(k).includes(l.sprachen.length ? l.sprachen[0]!.name : 'Keine Sprache erkannt'), `${l.id} Sprachen`);
      assert.ok(text(k).includes(l.statusText), `${l.id} Status`);
    }
  });
});

describe('AK-18 Schalter „Nur auffällige“ / „Alle“', () => {
  test('„Nur auffällige“: 3 Kacheln, „7 Labels ausgeblendet“; der aktive Schalter ist mit Text markiert', () => {
    const html = uebersicht(f.sta4, { nurAuffaellige: true });
    assert.deepEqual(kacheln(html), ['STA4-08', 'STA4-09', 'STA4-07']);
    assert.equal(text(element(html, 'span', 'data-ausgeblendet', '')!), '7 Labels ausgeblendet');
    assert.ok(knoepfe(html).includes('Nur auffällige (gewählt)'));
    assert.match(html, /aria-pressed="true"[^>]*>Nur auffällige/);
  });
  test('nach dem Bestätigen von STA4-07: 2 auffällige, 8 ausgeblendet', () => {
    const html = uebersicht(f.sta4NachSta407, { nurAuffaellige: true });
    assert.equal(kacheln(html).length, 2);
    assert.equal(text(element(html, 'span', 'data-ausgeblendet', '')!), '8 Labels ausgeblendet');
  });
  test('„Alle“: kein Hinweis auf Ausgeblendetes', () => {
    const html = uebersicht(f.sta4);
    assert.equal(kacheln(html).length, 10);
    assert.doesNotMatch(html, /ausgeblendet/);
  });
});

describe('AK-19 Auffällig mit einem Satz', () => {
  test('jede auffällige offene Kachel: „Auffällig“ und genau ein Grund; STA4-08 „und 2 weitere Gründe“', () => {
    const html = uebersicht(f.sta4);
    for (const l of f.sta4.labels) {
      const t = text(element(html, 'li', 'data-kachel', l.id)!);
      const offenUndAuffaellig = l.auffaellig && ['offen', 'unsicher', 'nachgebessert'].includes(l.status);
      assert.equal(t.includes('Auffällig'), offenUndAuffaellig, l.id);
      if (offenUndAuffaellig) {
        const enthalten = l.gruende.filter((g) => t.includes(g.text));
        assert.equal(enthalten.length, 1, `${l.id}: genau ein Satz`);
      }
    }
    assert.match(text(element(html, 'li', 'data-kachel', 'STA4-08')!), /und 2 weitere Gründe/);
  });
});

describe('AK-20 „Warum?“', () => {
  test('STA4-09: jede Markierung trägt ein Sprachkürzel; einzelne Buchstaben gezählt', () => {
    const html = rendere(M.warum!.Warum, { label: label(f.sta4, 'STA4-09') });
    const marks = [...html.matchAll(/<mark[^>]*data-sprache="([a-z]+)"[^>]*>([\s\S]*?)<\/mark>/g)];
    assert.ok(marks.length > 5);
    for (const m of marks) assert.match(m[2]!, new RegExp(`aria-hidden="true">${m[1]!.toUpperCase()}</span>`));
    assert.ok(new Set(marks.map((m) => m[1])).has('de'), 'unter „Warum?“ alle Sprachen');
    assert.match(text(html), /\d+ einzelne Buchstaben/);
    assert.match(text(html), /Deutsch erkannt an den Wörtern/);
  });
  test('STA4-08: „Keine typischen Wörter oder Zeichen gefunden“', () => {
    assert.match(text(rendere(M.warum!.Warum, { label: label(f.sta4, 'STA4-08') })), /Keine typischen Wörter oder Zeichen gefunden/);
  });
  test('„Warum?“ ist ein Knopf, der den Bereich auf- und zuklappt', () => {
    assert.match(einzel(f.sta4, 'STA4-09'), /aria-expanded="false"[^>]*>Warum\?/);
    const offen = einzel(f.sta4, 'STA4-09', { warumOffen: true });
    assert.match(offen, /aria-expanded="true"[^>]*>Warum\?/);
    assert.match(text(offen), /Woran die Sprache erkannt wurde/);
  });
});

describe('AK-21 einfache Bedienung', () => {
  const seiten = () => ({
    start: rendere(M.start!.StartAnsicht, { anlagen: f.anlagen }),
    sta4: uebersicht(f.sta4, { nurAuffaellige: true }),
    swr5: uebersicht(f.swr5Fertig, { zusammenfassung: f.swr5Zusammenfassung }),
    fertig: uebersicht(f.sta4Fertig, { zusammenfassung: f.sta4Zusammenfassung, rueckfrage: true }),
    sta409: einzel(f.sta4, 'STA4-09', { warumOffen: true }),
    sta408: einzel(f.sta4, 'STA4-08', { zustand: 'gruende', warumOffen: true }),
    swr503: einzel(f.swr5, 'SWR5-03'),
    simulation: rendere(M.simulation!.SimulationAnsicht, {
      wartend: f.swr5.ausserhalbDerPruefung.map((l) => ({ anlageName: 'Schweißroboter 5', label: l })),
      speichert: false, meldung: null, fehler: null, onNachbessern: ohneEreignis, onFotoNachreichen: ohneEreignis,
    }),
  });
  test('Hinweis „Testversion …“ im Rahmen jeder Seite', () => {
    for (const bereich of ['max', 'marie', 'simulation']) {
      const html = rendere(M.rahmen!.Rahmen, { bereich, children: 'Inhalt' });
      assert.match(text(html), /Testversion: Texterkennung und Spracherkennung sind simuliert\./, bereich);
    }
    assert.match(text(rendere(M.rahmen!.Rahmen, { children: 'x' })), /Label-Prüfung · Max \(Qualitätsmanagement\)/);
    assert.match(text(rendere(M.rahmen!.Rahmen, { bereich: 'marie', children: 'x' })), /Übersicht · Marie \(Fertigungsleitung\)/);
  });
  test('Überschriften ohne Sprung: auf die Anlage folgt „Labels“, dann die Kacheln', () => {
    const ebenen = [...uebersicht(f.sta4).matchAll(/<h(\d)\b[^>]*>([\s\S]*?)<\/h\1>/g)].map((m) => [Number(m[1]), text(m[2]!)] as const);
    assert.deepEqual(ebenen.slice(0, 3), [[1, 'Stanzanlage 4'], [2, 'Labels'], [3, 'Label STA4-08']]);
    for (let i = 1; i < ebenen.length; i++) assert.ok(ebenen[i]![0] <= ebenen[i - 1]![0] + 1, JSON.stringify(ebenen[i]));
  });
  test('Meldungen werden in einem Bereich angesagt, der beim Seitenwechsel bestehen bleibt', () => {
    const html = rendere(M.rahmen!.Rahmen, { ansage: 'STA4-03 bestätigt.', children: 'Inhalt' });
    assert.match(html, /<div role="status" aria-live="polite" class="sr-only">STA4-03 bestätigt\.<\/div>/);
    // Die sichtbare Meldung auf der Seite ist kein zweiter Ansagebereich.
    const seite = einzel(f.sta4, 'STA4-09', { meldung: { text: 'STA4-08 bestätigt.', rueckgaengig: 'STA4-08' } });
    assert.match(text(seite), /STA4-08 bestätigt\. Rückgängig/);
    assert.doesNotMatch(seite, /aria-live/);
  });
  test('Fortschritt in Übersicht und Einzelansicht', () => {
    const s = seiten();
    for (const html of [s.sta4, s.sta409]) assert.match(html, /role="progressbar"/);
    assert.match(text(s.sta409), /1 von 10 bestätigt/);
  });
  test('keine Fachwörter oder Codes im sichtbaren Text', () => {
    const verboten = [/\bOCR\b/, /Konfidenz/i, /genau_pruefen/, /sprache_falsch/, /unsicher_ocr/, /unsicher_sprache/, /text_unleserlich/,
      /abweichende_sprachen/, /\bbestaetigt\b/, /\bbeschaedigt\b/, /\bprioritaet\b/i, /\bundefined\b/, /\bnull\b/, /\bNaN\b/, /\btrue\b|\bfalse\b/, /\[object/];
    for (const [name, html] of Object.entries(seiten())) {
      for (const muster of verboten) assert.doesNotMatch(text(html), muster, `${name}: ${muster}`);
    }
  });
  test('Max\' Ansichten haben keinen Knopf der Simulation; die Simulationsseite schon', () => {
    const s = seiten();
    for (const [name, html] of Object.entries(s)) {
      if (name === 'simulation') continue;
      assert.ok(!knoepfe(html).some((k) => /Nachbesserung simulieren|Foto nachreichen/.test(k)), name);
    }
    assert.deepEqual(knoepfe(s.simulation), ['Nachbesserung simulieren', 'Foto nachreichen']);
  });
});
