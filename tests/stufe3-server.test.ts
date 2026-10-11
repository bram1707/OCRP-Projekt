// Stufe 3, Server: Maries Übersicht (AK-40 bis AK-46) und das Signal nach jeder Änderung (AK-44).

import assert from 'node:assert/strict';
import { request } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { DatabaseSync } from 'node:sqlite';
import { describe, test } from 'node:test';
import { oeffneDatenbank, spieleTestdatenEin, type Testdaten } from '../src/db/datenbank.ts';
import { GRUPPE_MARIE, RANG_MARIE, sortiereFuerMarie, STATUS, type Status } from '../src/db/status.ts';
import { erstelleServer, routen } from '../src/server/app.ts';
import { Ereignisse } from '../src/server/ereignisse.ts';
import { datumText, type MarieLabel, type MarieUebersicht } from '../src/server/marie.ts';
import { anfrage, BILDER, erwartungen, neueDatenbank, starteServer, testdaten, type TestServer } from './hilfen.ts';

const max = { methode: 'POST', rolle: 'max' } as const;
const melde = (grund: string) => ({ ...max, koerper: JSON.stringify({ grund }) });

async function mitServer(arbeit: (s: TestServer, db: DatabaseSync) => Promise<void>, daten?: Testdaten): Promise<void> {
  let db: DatabaseSync;
  if (daten) {
    db = oeffneDatenbank(':memory:');
    await spieleTestdatenEin(db, daten);
  } else {
    db = await neueDatenbank();
  }
  const s = await starteServer(db);
  try {
    await arbeit(s, db);
  } finally {
    await s.schliessen();
  }
}

async function marie(s: TestServer): Promise<MarieUebersicht> {
  const { status, daten } = await anfrage(s, '/api/marie');
  assert.equal(status, 200);
  return daten;
}

const label = (m: MarieUebersicht, schluessel: string): MarieLabel => m.labels.find((l) => l.schluessel === schluessel)!;

/** Jedes Label genau einmal, die drei Gruppen ergeben die Gesamtzahl, Anlagen und Zahlen passen zusammen. */
function pruefeZaehlung(m: MarieUebersicht, kontext: string): void {
  const { gesamt, offen, erledigt, fehlerhaft } = m.zahlen;
  assert.equal(offen + erledigt + fehlerhaft, gesamt, `${kontext}: offen + erledigt + fehlerhaft = gesamt`);
  assert.equal(m.labels.length, gesamt, `${kontext}: jedes Label steht in der Liste`);
  assert.equal(new Set(m.labels.map((l) => l.schluessel)).size, gesamt, `${kontext}: kein Label doppelt`);
  for (const g of ['offen', 'erledigt', 'fehlerhaft'] as const) {
    assert.equal(m.labels.filter((l) => l.gruppe === g).length, m.zahlen[g], `${kontext}: ${g}`);
    assert.equal(m.anlagen.reduce((n, a) => n + a.gruppen[g], 0), m.zahlen[g], `${kontext}: ${g} über die Anlagen`);
  }
  for (const l of m.labels) assert.equal(l.gruppe, GRUPPE_MARIE[l.status], `${kontext}: ${l.schluessel}`);
  assert.equal(m.anlagen.reduce((n, a) => n + a.gesamt, 0), gesamt, `${kontext}: Summe der Anlagen`);
}

describe('AK-40 vier Zahlen, jedes Label genau einmal', () => {
  test('Testdaten: 20 gesamt, 9 offen, 7 erledigt, 4 fehlerhaft (inkl. unsicher und fehlend)', async () => {
    await mitServer(async (s) => {
      const m = await marie(s);
      assert.deepEqual(m.zahlen, { gesamt: 20, offen: 9, erledigt: 7, fehlerhaft: 4 });
      pruefeZaehlung(m, 'Testdaten');
      assert.deepEqual(m.labels.filter((l) => l.gruppe === 'fehlerhaft').map((l) => `${l.schluessel}:${l.status}`).sort(), [
        'STA4-08:unsicher', 'STA4-09:unsicher', 'SWR5-02:fehlerhaft', 'SWR5-05:fehlt',
      ]);
      assert.equal(label(m, 'SWR5-03').gruppe, 'offen', 'Nachgebessert wartet wieder auf Max und zählt als offen');
    });
  });

  test('Zuordnung: Unsicher, Fehlerhaft, Fehlt → fehlerhaft; Offen, Nachgebessert → offen; Bestätigt → erledigt', () => {
    assert.deepEqual(GRUPPE_MARIE, {
      offen: 'offen', nachgebessert: 'offen', bestaetigt: 'erledigt', unsicher: 'fehlerhaft', fehlerhaft: 'fehlerhaft', fehlt: 'fehlerhaft',
    });
    for (const s of STATUS) assert.ok(GRUPPE_MARIE[s], s);
  });

  test('die Summe stimmt nach jeder Aktion von Max und der Simulation', async () => {
    await mitServer(async (s) => {
      // gesamt/offen/erledigt/fehlerhaft nach jedem Schritt
      const schritte: [string, Parameters<typeof anfrage>[2], string][] = [
        ['/api/labels/STA4-01/bestaetigen', max, '20/8/8/4'],
        ['/api/labels/STA4-02/fehler', melde('unleserlich'), '20/7/8/5'],
        ['/api/labels/STA4-02/nachbessern', max, '20/8/8/4'],
        ['/api/labels/SWR5-05/nacherfassen', max, '20/9/8/3'],
        ['/api/labels/STA4-01/zuruecknehmen', max, '20/10/7/3'],
        ['/api/labels/SWR5-02/nachbessern', max, '20/11/7/2'],
      ];
      for (const [pfad, optionen, soll] of schritte) {
        assert.equal((await anfrage(s, pfad, optionen)).status, 200, pfad);
        const m = await marie(s);
        pruefeZaehlung(m, pfad);
        const { gesamt, offen, erledigt, fehlerhaft } = m.zahlen;
        assert.equal(`${gesamt}/${offen}/${erledigt}/${fehlerhaft}`, soll, pfad);
      }
      // Stanzanlage 4 ganz bestätigen und freigeben
      const sta4 = (await anfrage(s, '/api/anlagen/STA4/labels')).daten.labels.filter((l: any) => l.status !== 'bestaetigt');
      for (const l of sta4) assert.equal((await anfrage(s, `/api/labels/${l.id}/bestaetigen`, max)).status, 200, l.id);
      assert.equal((await anfrage(s, '/api/anlagen/STA4/freigeben', max)).status, 200);
      const m = await marie(s);
      pruefeZaehlung(m, 'nach der Freigabe');
      assert.equal(m.anlagen.find((a) => a.id === 'STA4')!.gesperrt, false);
    });
  });

  test('Labels laut Anlagenliste ohne Datensatz zählen als fehlerhaft und stehen als „nicht erfasst“ in der Liste (AK-45)', async () => {
    const daten = testdaten();
    daten.anlagen = daten.anlagen.map((a) => (a.id === 'SWR5' ? { ...a, sollAnzahl: 7 } : a));
    await mitServer(async (s) => {
      const m = await marie(s);
      assert.deepEqual(m.zahlen, { gesamt: 22, offen: 9, erledigt: 7, fehlerhaft: 6 });
      pruefeZaehlung(m, 'Soll 7');
      const fehlend = m.labels.filter((l) => l.label === null);
      assert.deepEqual(fehlend.map((l) => l.schluessel), ['SWR5-nicht-erfasst-1', 'SWR5-nicht-erfasst-2']);
      for (const l of fehlend) {
        assert.equal(l.status, 'fehlt');
        assert.match(l.grund, /^Label nicht erfasst/);
        // „angelegt“, nicht „erfasst“: SWR5-05 ist angelegt, hat aber kein Foto und zählt selbst als nicht erfasst.
        assert.match(l.warum.join(' '), /gehören 7 Labels zu Schweißroboter 5, angelegt sind nur 5\./);
      }
      const swr5 = m.anlagen.find((a) => a.id === 'SWR5')!;
      assert.equal(swr5.gesamt, 7);
      assert.equal(swr5.gesperrt, true);
      assert.ok(swr5.warum.includes('2 Labels laut Anlagenliste nicht erfasst.'), swr5.warum.join(' | '));
    }, daten);
  });

  test('mehr Datensätze als laut Anlagenliste: gezählt werden alle, „Warum?“ nennt die Abweichung', async () => {
    const daten = testdaten();
    daten.anlagen = daten.anlagen.map((a) => (a.id === 'STA4' ? { ...a, sollAnzahl: 8 } : a));
    await mitServer(async (s) => {
      const m = await marie(s);
      assert.equal(m.zahlen.gesamt, 20);
      pruefeZaehlung(m, 'Soll 8');
      const sta4 = m.anlagen.find((a) => a.id === 'STA4')!;
      assert.equal(sta4.gesamt, 10);
      assert.match(sta4.warum[0]!, /Angelegt sind 10 Labels, laut Anlagenliste sind es 8\./);
    }, daten);
  });
});

describe('AK-41 Rangfolge bei Marie', () => {
  test('Fehlt, Fehlerhaft, Unsicher, Nachgebessert, Offen, Bestätigt', () => {
    const reihe = sortiereFuerMarie(STATUS.map((status, i) => ({ status, schluessel: `X-${i}` }))).map((l) => l.status);
    assert.deepEqual(reihe, ['fehlt', 'fehlerhaft', 'unsicher', 'nachgebessert', 'offen', 'bestaetigt']);
  });

  test('Labels in Maries Reihenfolge, das dringendste zuerst', async () => {
    await mitServer(async (s) => {
      const m = await marie(s);
      assert.deepEqual(m.labels.slice(0, 5).map((l) => l.schluessel), ['SWR5-05', 'SWR5-02', 'STA4-08', 'STA4-09', 'SWR5-03']);
      for (let i = 1; i < m.labels.length; i++) {
        assert.ok(RANG_MARIE[m.labels[i - 1]!.status] <= RANG_MARIE[m.labels[i]!.status], `${m.labels[i - 1]!.schluessel} vor ${m.labels[i]!.schluessel}`);
      }
    });
  });

  test('Anlagen: Schweißroboter 5 (Fehlt), Stanzanlage 4 (Unsicher), Förderband 2 (freigegeben); mit Fortschritt', async () => {
    await mitServer(async (s) => {
      const m = await marie(s);
      assert.deepEqual(m.anlagen.map((a) => `${a.id}:${a.dringendster}`), ['SWR5:fehlt', 'STA4:unsicher', 'FOE2:bestaetigt']);
      const server = (await anfrage(s, '/api/anlagen')).daten as any[];
      for (const a of m.anlagen) {
        const vergleich = server.find((x) => x.id === a.id);
        assert.equal(a.gesperrt, vergleich.gesperrt, a.id);
        assert.equal(a.bestaetigt, vergleich.bestaetigt, a.id);
      }
      assert.deepEqual(m.anlagen.map((a) => `${a.bestaetigt} von ${a.gesamt}`), ['1 von 5', '1 von 10', '5 von 5']);
    });
  });

  test('bei gleichem dringendstem Status zuerst die Anlage mit mehr solchen Labels, dann nach Name', async () => {
    await mitServer(async (s) => {
      await anfrage(s, '/api/labels/SWR5-05/nacherfassen', max);
      await anfrage(s, '/api/labels/STA4-02/fehler', melde('beschaedigt'));
      let m = await marie(s);
      assert.deepEqual(m.anlagen.slice(0, 2).map((a) => `${a.id}:${a.dringendster}`), ['SWR5:fehlerhaft', 'STA4:fehlerhaft'], 'gleich viele: nach Name');
      await anfrage(s, '/api/labels/STA4-03/fehler', melde('unleserlich'));
      m = await marie(s);
      assert.deepEqual(m.anlagen.slice(0, 2).map((a) => a.id), ['STA4', 'SWR5'], 'zwei gemeldete vor einem');
    });
  });

  test('alles bestätigt: die noch gesperrte Anlage steht über freigegebenen, auch über größeren', async () => {
    await mitServer(async (s) => {
      await anfrage(s, '/api/labels/SWR5-02/nachbessern', max);
      await anfrage(s, '/api/labels/SWR5-05/nacherfassen', max);
      for (const id of ['STA4', 'SWR5']) {
        for (const l of (await anfrage(s, `/api/anlagen/${id}/labels`)).daten.labels) {
          if (l.status !== 'bestaetigt') assert.equal((await anfrage(s, `/api/labels/${l.id}/bestaetigen`, max)).status, 200, l.id);
        }
      }
      assert.equal((await anfrage(s, '/api/anlagen/STA4/freigeben', max)).status, 200);
      const m = await marie(s);
      assert.deepEqual(m.anlagen.map((a) => `${a.id}:${a.gesperrt ? 'gesperrt' : 'frei'}:${a.gesamt}`), ['SWR5:gesperrt:5', 'STA4:frei:10', 'FOE2:frei:5']);
    });
  });
});

describe('AK-42 Labels hinter Zahl und Anlage, mit Foto, Status und Grund', () => {
  const GRUND: Record<Status, RegExp> = {
    fehlt: /^Label nicht erfasst: kein Foto vorhanden\.$/,
    fehlerhaft: /^Von Max gemeldet \((Unleserlich|Sprache falsch|Label beschädigt)\), wartet auf Nachbesserung\.$/,
    unsicher: /^(Sprache nicht sicher erkannt\.|Text schlecht lesbar\.)( Text schlecht lesbar\.)? Max muss genau hinsehen\.$/,
    nachgebessert: /^Nachgebessert nach Max' Meldung \((Unleserlich|Sprache falsch|Label beschädigt)\), wartet auf erneute Prüfung durch Max\.$/,
    offen: /^Erfasst, von Max noch nicht geprüft\.$/,
    bestaetigt: /^Von Max bestätigt am \d\d\.\d\d\.2026\.$/,
  };

  test('jedes der 20 Testlabels hat einen Satz als Grund, passend zu seinem Status, und sein Foto', async () => {
    await mitServer(async (s) => {
      const m = await marie(s);
      const ids = Object.keys(erwartungen()).sort();
      assert.deepEqual(m.labels.map((l) => l.schluessel).sort(), ids);
      for (const l of m.labels) {
        assert.match(l.grund, GRUND[l.status], l.schluessel);
        assert.equal(l.label!.status, l.status);
        if (l.status === 'fehlt') assert.equal(l.label!.bildUrl, null, l.schluessel);
        else assert.equal(l.label!.bildUrl, `/bilder/${l.schluessel}.svg`, l.schluessel);
      }
      assert.equal(label(m, 'SWR5-02').grund, 'Von Max gemeldet (Label beschädigt), wartet auf Nachbesserung.');
      assert.equal(label(m, 'STA4-09').grund, 'Sprache nicht sicher erkannt. Max muss genau hinsehen.');
      assert.equal(label(m, 'FOE2-01').grund, 'Von Max bestätigt am 09.10.2026.');
    });
  });

  test('nach dem Zurücknehmen sagen Grund und „Warum?“, dass Max seine Bestätigung zurückgenommen hat', async () => {
    await mitServer(async (s) => {
      await anfrage(s, '/api/labels/STA4-01/bestaetigen', max);
      await anfrage(s, '/api/labels/STA4-01/zuruecknehmen', max);
      const l = label(await marie(s), 'STA4-01');
      assert.equal(l.status, 'offen');
      assert.match(l.grund, /^Max hat seine Bestätigung am \d\d\.\d\d\.\d{4} zurückgenommen, wartet auf erneute Prüfung\.$/);
      assert.match(l.warum.join(' '), /^Max hat die Bestätigung von STA4-01 am \d\d\.\d\d\.\d{4} zurückgenommen\. Jetzt wartet es auf Max' erneute Prüfung\.$/);
      assert.doesNotMatch(l.grund + l.warum.join(' '), /noch nicht geprüft/);
    });
  });

  test('ein unlesbarer Zeitpunkt legt die Übersicht nicht lahm: er erscheint wie gespeichert', () => {
    assert.equal(datumText('9. Oktober 2026'), '9. Oktober 2026');
  });

  test('nach einer Meldung nennt der Grund den gemeldeten Fehler', async () => {
    await mitServer(async (s) => {
      await anfrage(s, '/api/labels/STA4-04/fehler', melde('sprache_falsch'));
      const m = await marie(s);
      assert.equal(label(m, 'STA4-04').grund, 'Von Max gemeldet (Sprache falsch), wartet auf Nachbesserung.');
      assert.equal(label(m, 'STA4-04').gruppe, 'fehlerhaft');
    });
  });

  test('das Datum gilt in deutscher Zeit, im Sommer wie im Winter, auch kurz nach Mitternacht', () => {
    assert.equal(datumText('2026-10-09T15:00:00.000Z'), '09.10.2026');
    // Sommerzeit (UTC+2): 22:30 UTC ist in Deutschland schon der nächste Tag.
    assert.equal(datumText('2026-10-09T22:30:00.000Z'), '10.10.2026');
    // Winterzeit (UTC+1): 22:55 UTC ist noch derselbe Tag, 23:05 UTC schon der nächste.
    assert.equal(datumText('2026-12-01T22:55:00.000Z'), '01.12.2026');
    assert.equal(datumText('2026-12-01T23:05:00.000Z'), '02.12.2026');
  });
});

describe('AK-43 „Warum?“ mit Belegen', () => {
  test('gesperrte Anlagen nennen ihre Gründe nach Status zusammengefasst, freigegebene wann und von wem', async () => {
    await mitServer(async (s) => {
      const m = await marie(s);
      const warum = (id: string) => m.anlagen.find((a) => a.id === id)!.warum;
      assert.deepEqual(warum('SWR5'), [
        '1 Label „Fehlt“ (kein Foto): SWR5-05.',
        '1 Label „Fehlerhaft“ (von Max gemeldet, wartet auf Nachbesserung): SWR5-02.',
        '1 Label „Nachgebessert“ (wartet auf erneute Prüfung durch Max): SWR5-03.',
        '1 Label „Offen“ (wartet auf Max\' Prüfung): SWR5-01.',
      ]);
      assert.deepEqual(warum('STA4'), [
        '2 Labels „Unsicher“ (Erkennung nicht sicher, Max muss genau hinsehen): STA4-08, STA4-09.',
        '7 Labels „Offen“ (wartet auf Max\' Prüfung): STA4-01, STA4-02, STA4-03, STA4-04, STA4-05, STA4-06, STA4-07.',
      ]);
      assert.deepEqual(warum('FOE2'), ['Max hat die Anlage am 09.10.2026 freigegeben. Alle 5 Labels sind bestätigt.']);
      // Dieselben Labels wie in Max' offenen Punkten, jedes genau einmal.
      for (const a of m.anlagen.filter((x) => x.gesperrt)) {
        const zf = (await anfrage(s, `/api/anlagen/${a.id}/zusammenfassung`)).daten;
        const genannt = a.warum.flatMap((w) => [...w.matchAll(/[A-Z0-9]+-\d\d/g)].map((x) => x[0])).sort();
        assert.deepEqual(genannt, zf.offenePunkte.flatMap((p: any) => (p.labelId ? [p.labelId] : [])).sort(), a.id);
      }
    });
  });

  test('Labels ohne Datensatz: „Warum gesperrt?“ nennt die Lücke laut Anlagenliste', async () => {
    const daten = testdaten();
    daten.anlagen = daten.anlagen.map((a) => (a.id === 'FOE2' ? { ...a, sollAnzahl: 6 } : a));
    await mitServer(async (s) => {
      const foe2 = (await marie(s)).anlagen.find((a) => a.id === 'FOE2')!;
      assert.equal(foe2.gesperrt, true);
      assert.deepEqual(foe2.warum, ['1 Label laut Anlagenliste nicht erfasst.']);
    }, daten);
  });

  test('alles bestätigt, aber noch nicht freigegeben: „Warum?“ sagt das', async () => {
    await mitServer(async (s) => {
      for (const id of ['SWR5-01', 'SWR5-03']) await anfrage(s, `/api/labels/${id}/bestaetigen`, max);
      await anfrage(s, '/api/labels/SWR5-02/nachbessern', max);
      await anfrage(s, '/api/labels/SWR5-05/nacherfassen', max);
      for (const id of ['SWR5-02', 'SWR5-05']) assert.equal((await anfrage(s, `/api/labels/${id}/bestaetigen`, max)).status, 200, id);
      const swr5 = (await marie(s)).anlagen.find((a) => a.id === 'SWR5')!;
      assert.equal(swr5.gesperrt, true);
      assert.deepEqual(swr5.warum, ['Alle Labels sind bestätigt. Max hat die Anlage noch nicht freigegeben.']);
    });
  });

  test('jeder Status ist belegt: Schwellen mit Prozent, Datum und Grund der Meldung, Datum der Bestätigung', async () => {
    await mitServer(async (s) => {
      const m = await marie(s);
      for (const l of m.labels) assert.ok(l.warum.length > 0, l.schluessel);
      assert.deepEqual(label(m, 'STA4-09').warum.slice(0, 1), ['Russisch 50 %, Polnisch 87 %: unter 90 % gilt eine Sprache als nicht sicher erkannt.']);
      assert.match(label(m, 'STA4-08').warum.join(' '), /Texterkennung 34 %: unter 80 % gilt der Text als schlecht lesbar\./);
      assert.match(label(m, 'STA4-08').warum.join(' '), /keine Sprache sicher zuordnen.*rät nie/);
      assert.match(label(m, 'SWR5-02').warum[0]!, /^Max hat SWR5-02 am \d\d\.\d\d\.2026 gemeldet: Label beschädigt\.$/);
      assert.match(label(m, 'SWR5-03').warum.join(' '), /gemeldet: Sprache falsch\. Nachgebessert am \d\d\.\d\d\.2026\..*zählt deshalb als offen/);
      assert.match(label(m, 'SWR5-05').warum.join(' '), /Für SWR5-05 gibt es kein Foto\..*bleibt die Anlage gesperrt/);
      assert.deepEqual(label(m, 'STA4-10').warum, ['Max hat STA4-10 am 10.10.2026 bestätigt.']);
    });
  });

  test('der Sprachvorschlag ist belegt: Wörter und Zeichen je Sprache, auch für Marie', async () => {
    await mitServer(async (s) => {
      const m = await marie(s);
      const belege = label(m, 'STA4-01').label!.belege;
      assert.ok(belege.some((b) => b.sprache === 'de' && b.art === 'wort'), 'deutsches Wort');
      assert.ok(belege.some((b) => b.sprache === 'pl'), 'polnischer Beleg');
      assert.deepEqual(label(m, 'STA4-01').label!.sprachen.map((x) => x.code), ['de', 'pl']);
    });
  });

  test('von Max\' Entscheidungen sieht Marie nur das Datum, nie die Uhrzeit (Datensparsamkeit)', async () => {
    await mitServer(async (s) => {
      const schritte: [string, Parameters<typeof anfrage>[2]][] = [
        ['/api/labels/STA4-01/bestaetigen', max],
        ['/api/labels/STA4-01/zuruecknehmen', max],
        ['/api/labels/STA4-02/fehler', melde('unleserlich')],
        ['/api/labels/STA4-02/nachbessern', max],
        ['/api/labels/STA4-04/fehler', melde('sprache_falsch')],
        ['/api/labels/SWR5-05/nacherfassen', max],
      ];
      for (const [pfad, optionen] of schritte) assert.equal((await anfrage(s, pfad, optionen)).status, 200, pfad);
      const m = await marie(s);
      // Bestätigt, zurückgenommen, gemeldet, nachgebessert und freigegeben (Förderband 2) kommen alle vor.
      const texte = [...m.labels.flatMap((l) => [l.grund, ...l.warum]), ...m.anlagen.flatMap((a) => a.warum)];
      for (const t of texte) assert.doesNotMatch(t, /\d:\d\d|\bUhr\b/, t);
      for (const art of [/bestätigt am \d\d\.\d\d\.\d{4}\./, /Bestätigung am \d\d\.\d\d\.\d{4} zurückgenommen/, /am \d\d\.\d\d\.\d{4} gemeldet/, /Nachgebessert am \d\d\.\d\d\.\d{4}\./, /Anlage am \d\d\.\d\d\.\d{4} freigegeben/]) {
        assert.ok(texte.some((t) => art.test(t)), `Datum fehlt: ${art}`);
      }
    });
  });
});

describe('AK-61 keine Erwartungswerte in Maries Übersicht', () => {
  test('weder Notizen noch Felder der Erwartungswerte oder der Simulation', async () => {
    await mitServer(async (s) => {
      const { text } = await anfrage(s, '/api/marie');
      const notizen = Object.values(erwartungen()).flatMap((e) => (e.notiz ? [e.notiz] : []));
      assert.ok(notizen.length > 0);
      for (const n of notizen) assert.ok(!text.includes(n), n);
      assert.doesNotMatch(text, /erwart|"lesbar"|nachSimulation|korrektur|nacherfassung"/i);
      // Jedes Label trägt genau diese Felder, und die Label-Daten sind dieselben wie in Max' Ansicht. Die Texte
      // der Simulation lassen sich nicht am Wortlaut erkennen (sie gleichen anderen Labels), daher dieser Vergleich.
      const m = JSON.parse(text) as MarieUebersicht;
      for (const l of m.labels) {
        assert.deepEqual(Object.keys(l).sort(), ['anlageId', 'anlageName', 'grund', 'gruppe', 'label', 'schluessel', 'status', 'warum'], l.schluessel);
        if (l.label) assert.deepEqual(l.label, (await anfrage(s, `/api/labels/${l.label.id}`)).daten, l.schluessel);
      }
      // Der Text des nachgereichten Fotos (Simulation) erscheint erst, wenn es nachgereicht ist.
      assert.ok(!text.includes('Вход только для персонала'));
      await anfrage(s, '/api/labels/SWR5-05/nacherfassen', max);
      assert.ok((await anfrage(s, '/api/marie')).text.includes('Вход только для персонала'));
    });
  });
});

/** Liest Server-Sent Events mit fetch; `naechste()` wartet auf die nächste Nachricht. */
async function hoere(url: string, kopf: Record<string, string> = {}) {
  const abbruch = new AbortController();
  const res = await fetch(url, { headers: kopf, signal: abbruch.signal });
  const nachrichten: string[] = [];
  const wartend: { aufruf: (() => void) | null } = { aufruf: null };
  let rest = '';
  const leser = res.body!.getReader();
  void (async () => {
    try {
      for (;;) {
        const { value, done } = await leser.read();
        if (done) break;
        rest += new TextDecoder().decode(value);
        let ende: number;
        while ((ende = rest.indexOf('\n\n')) >= 0) {
          const block = rest.slice(0, ende);
          rest = rest.slice(ende + 2);
          const daten = block.split('\n').filter((z) => z.startsWith('data: ')).map((z) => z.slice(6));
          if (daten.length > 0) {
            nachrichten.push(daten.join('\n'));
            wartend.aufruf?.();
          }
        }
      }
    } catch {
      // abgebrochen
    }
  })();
  return {
    res,
    nachrichten,
    async naechste(ms = 2000): Promise<string> {
      await new Promise<void>((fertig, fehler) => {
        const uhr = setTimeout(() => fehler(new Error('keine Nachricht')), ms);
        wartend.aufruf = () => {
          clearTimeout(uhr);
          wartend.aufruf = null;
          fertig();
        };
      });
      return nachrichten.at(-1)!;
    },
    schliessen: () => abbruch.abort(),
  };
}

const kurz = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('AK-44 sofort aktualisieren: Signal nach jeder Änderung', () => {
  test('Bestätigen, Melden, Nachbessern, Foto nachreichen und Zurücknehmen senden je ein Signal; danach zeigt Marie den neuen Stand', async () => {
    await mitServer(async (s) => {
      const h = await hoere(`${s.url}/api/ereignisse`);
      try {
        assert.equal(h.res.status, 200);
        assert.match(h.res.headers.get('content-type')!, /^text\/event-stream/);
        await kurz(50);
        assert.deepEqual(h.nachrichten, ['{"stand":0}']);

        let warte = h.naechste();
        await anfrage(s, '/api/labels/STA4-01/bestaetigen', max);
        assert.equal(await warte, '{"stand":1}');
        assert.equal((await marie(s)).zahlen.erledigt, 8);

        warte = h.naechste();
        await anfrage(s, '/api/labels/STA4-02/fehler', melde('unleserlich'));
        assert.equal(await warte, '{"stand":2}');
        assert.equal((await marie(s)).zahlen.fehlerhaft, 5);

        warte = h.naechste();
        await anfrage(s, '/api/labels/STA4-02/nachbessern', max);
        assert.equal(await warte, '{"stand":3}');
        assert.deepEqual((await marie(s)).zahlen, { gesamt: 20, offen: 8, erledigt: 8, fehlerhaft: 4 }, 'STA4-02 nachgebessert: wieder offen');

        warte = h.naechste();
        await anfrage(s, '/api/labels/SWR5-05/nacherfassen', max);
        assert.equal(await warte, '{"stand":4}');

        warte = h.naechste();
        await anfrage(s, '/api/labels/STA4-01/zuruecknehmen', max);
        assert.equal(await warte, '{"stand":5}');
        assert.equal((await marie(s)).zahlen.erledigt, 7);
      } finally {
        h.schliessen();
      }
    });
  });

  test('Freigeben sendet ein Signal; danach zeigt Marie die Anlage als „Freigegeben“', async () => {
    await mitServer(async (s) => {
      await anfrage(s, '/api/labels/SWR5-02/nachbessern', max);
      await anfrage(s, '/api/labels/SWR5-05/nacherfassen', max);
      for (const id of ['SWR5-01', 'SWR5-02', 'SWR5-03', 'SWR5-04', 'SWR5-05']) await anfrage(s, `/api/labels/${id}/bestaetigen`, max);
      const h = await hoere(`${s.url}/api/ereignisse`);
      try {
        await kurz(50);
        const warte = h.naechste();
        assert.equal((await anfrage(s, '/api/anlagen/SWR5/freigeben', max)).status, 200);
        assert.match(await warte, /^\{"stand":\d+\}$/);
        assert.equal((await marie(s)).anlagen.find((a) => a.id === 'SWR5')!.gesperrt, false);
      } finally {
        h.schliessen();
      }
    });
  });

  test('abgelehnte Änderungen und Lesen senden kein Signal', async () => {
    await mitServer(async (s) => {
      const h = await hoere(`${s.url}/api/ereignisse`);
      try {
        await kurz(50);
        assert.equal((await anfrage(s, '/api/labels/STA4-10/bestaetigen', max)).status, 409);
        assert.equal((await anfrage(s, '/api/labels/STA4-01/bestaetigen', { methode: 'POST', rolle: 'marie' })).status, 403);
        await anfrage(s, '/api/marie');
        await anfrage(s, '/api/anlagen');
        await kurz(100);
        assert.deepEqual(h.nachrichten, ['{"stand":0}']);
      } finally {
        h.schliessen();
      }
    });
  });

  test('Host-Prüfung gilt auch hier; zu viele Verbindungen → 503, der Platz wird wieder frei; der Server schließt trotz offener Verbindung', async () => {
    const db = await neueDatenbank();
    const server = erstelleServer({ db, bilderOrdner: BILDER, ereignisse: new Ereignisse(1) });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const { port } = server.address() as AddressInfo;
    const url = `http://127.0.0.1:${port}/api/ereignisse`;
    const fremd = await new Promise<number>((fertig) => {
      request({ host: '127.0.0.1', port, path: '/api/ereignisse', headers: { Host: 'boese.example' } }, (res) => {
        res.resume();
        fertig(res.statusCode!);
      }).end();
    });
    assert.equal(fremd, 421);
    const erste = await hoere(url);
    assert.equal(erste.res.status, 200);
    const zweite = await fetch(url);
    assert.equal(zweite.status, 503);
    await zweite.text();
    // Wird die erste Verbindung beendet, ist der Platz wieder frei.
    erste.schliessen();
    await kurz(50);
    const dritte = await hoere(url);
    assert.equal(dritte.res.status, 200);
    const geschlossen = new Promise<void>((r) => server.close(() => r()));
    await Promise.race([geschlossen, kurz(2000).then(() => assert.fail('close() wartet auf die offene Verbindung'))]);
    dritte.schliessen();
  });

  test('nur die eigene Seite bekommt das Signal: fremde Herkunft → 403 und belegt keinen Platz', async () => {
    const db = await neueDatenbank();
    const ereignisse = new Ereignisse();
    const server = erstelleServer({ db, bilderOrdner: BILDER, ereignisse });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const { port } = server.address() as AddressInfo;
    const status = (kopf: Record<string, string>) =>
      new Promise<number>((fertig, fehler) => {
        const anfrage = request({ host: '127.0.0.1', port, path: '/api/ereignisse', headers: kopf }, (res) => {
          fertig(res.statusCode!);
          res.destroy();
        });
        anfrage.on('error', fehler);
        anfrage.end();
      });
    try {
      // Eine fremde Webseite: Der Browser schickt „Origin“ (bei EventSource) oder „Sec-Fetch-Site“ (auch bei no-cors).
      const fremd: Record<string, string>[] = [
        { Origin: 'http://boese.example' },
        { Origin: 'null' },
        { Origin: `http://localhost:${port + 1}` },
        { Origin: 'http://boese.example', 'Sec-Fetch-Site': 'cross-site' },
        { 'Sec-Fetch-Site': 'cross-site' },
        { 'Sec-Fetch-Site': 'same-site' },
      ];
      for (const kopf of fremd) assert.equal(await status(kopf), 403, JSON.stringify(kopf));
      assert.equal(ereignisse.anzahl, 0, 'abgewiesene Anfragen belegen keinen Platz');
      // Maries Seite selbst, die Adresszeile und Werkzeuge ohne diese Kopfzeilen.
      const eigen: Record<string, string>[] = [
        { Origin: `http://127.0.0.1:${port}`, 'Sec-Fetch-Site': 'same-origin' },
        { 'Sec-Fetch-Site': 'same-origin' },
        { 'Sec-Fetch-Site': 'none' },
        {},
      ];
      for (const kopf of eigen) assert.equal(await status(kopf), 200, JSON.stringify(kopf));
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
    }
  });

  test('nach dem Schließen nimmt der Verteiler keine Verbindung mehr an', () => {
    const e = new Ereignisse();
    e.schliesseAlle();
    let kopf = false;
    const attrappe = { writeHead: () => (kopf = true), write: () => true, on: () => undefined } as unknown as Parameters<Ereignisse['verbinde']>[0];
    assert.equal(e.verbinde(attrappe), false);
    assert.equal(kopf, false);
    assert.equal(e.anzahl, 0);
  });
});

/** Je schreibender Route ein Aufruf; der Test darunter sorgt dafür, dass keine neue Route fehlt. */
const SCHREIBENDE_PFADE = [
  '/api/labels/STA4-01/bestaetigen',
  '/api/labels/STA4-01/fehler',
  '/api/labels/STA4-10/zuruecknehmen',
  '/api/labels/SWR5-02/nachbessern',
  '/api/labels/SWR5-05/nacherfassen',
  '/api/anlagen/STA4/freigeben',
];

describe('AK-46 Marie sieht nur, auch nicht über die Schnittstelle', () => {
  test('die Liste der schreibenden Aufrufe deckt jede schreibende Route ab, auch künftige', () => {
    const schreibend = routen({ db: oeffneDatenbank(':memory:'), bilderOrdner: BILDER }).filter((r) => r.methode !== 'GET');
    assert.ok(schreibend.length > 0);
    for (const r of schreibend) assert.ok(SCHREIBENDE_PFADE.some((p) => r.muster.test(p)), `${r.muster} fehlt in SCHREIBENDE_PFADE`);
    for (const p of SCHREIBENDE_PFADE) assert.ok(schreibend.some((r) => r.muster.test(p)), `${p} ist keine schreibende Route`);
  });

  test('jeder schreibende Aufruf als Marie → 403, Maries Übersicht bleibt gleich', async () => {
    await mitServer(async (s) => {
      const vorher = (await anfrage(s, '/api/marie')).text;
      for (const pfad of SCHREIBENDE_PFADE) {
        const r = await anfrage(s, pfad, { methode: 'POST', rolle: 'marie', koerper: JSON.stringify({ grund: 'unleserlich' }) });
        assert.equal(r.status, 403, pfad);
      }
      assert.equal((await anfrage(s, '/api/marie')).text, vorher);
    });
  });

  test('Lesen ändert nichts: die Datenbank ist nach /api/marie und /api/ereignisse dieselbe', async () => {
    await mitServer(async (s, db) => {
      const abzug = () =>
        (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all() as { name: string }[])
          .map(({ name }) => JSON.stringify(db.prepare(`SELECT * FROM "${name}"`).all()))
          .join('\n');
      const vorher = abzug();
      await anfrage(s, '/api/marie');
      const h = await hoere(`${s.url}/api/ereignisse`);
      await kurz(50);
      h.schliessen();
      assert.equal(abzug(), vorher);
    });
  });

  test('unter /api/marie und /api/ereignisse gibt es nichts zum Schreiben', async () => {
    await mitServer(async (s) => {
      for (const pfad of ['/api/marie', '/api/ereignisse']) {
        assert.equal((await anfrage(s, pfad, max)).status, 404, pfad);
      }
    });
  });
});
