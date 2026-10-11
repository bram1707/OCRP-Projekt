// Eigene Akzeptanztests des Test-Agents für Stufe 3 (Maries Übersicht, AK-40 bis AK-46, dazu AK-61).
// Unabhängig von tests/stufe3-server.test.ts des Build-Agents: Die Erwartungen kommen aus den
// Akzeptanzkriterien und werden gegen Max' eigene Schnittstelle (/api/anlagen, /api/labels/:id) abgeglichen.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { ladeTestdaten } from '../../src/db/datenbank.ts';
import { basisDb, eigeneDb, ruf, server, TESTDATEN, type Srv } from './hilfe.ts';

type Db = Awaited<ReturnType<typeof basisDb>>;
async function mit(f: (s: Srv, db: Db) => Promise<void>, db?: Db): Promise<void> {
  const d = db ?? await basisDb();
  const s = await server(d);
  try { await f(s, d); } finally { await s.zu(); }
}
const marie = async (s: Srv) => {
  const r = await ruf(s, '/api/marie');
  assert.equal(r.status, 200);
  return r.daten;
};
const alsMax = (s: Srv, pfad: string, koerper?: unknown) => ruf(s, pfad, { methode: 'POST', rolle: 'max', koerper });

// Zuordnung und Rangfolge aus dem Wortlaut von AK-40, AK-41 und Widerspruch 6 (nicht aus src/ übernommen).
const GRUPPE: Record<string, string> = {
  offen: 'offen', nachgebessert: 'offen', bestaetigt: 'erledigt', fehlerhaft: 'fehlerhaft', unsicher: 'fehlerhaft', fehlt: 'fehlerhaft',
};
const RANG = ['fehlt', 'fehlerhaft', 'unsicher', 'nachgebessert', 'offen', 'bestaetigt'];

/** Prüft alle Invarianten von Maries Übersicht gegen Max' Schnittstelle. */
async function pruefeInvarianten(s: Srv, wo: string): Promise<any> {
  const m = await marie(s);
  const z = m.zahlen;
  // AK-40: jedes Label genau einmal, die drei Teile ergeben die Gesamtzahl.
  assert.equal(z.offen + z.erledigt + z.fehlerhaft, z.gesamt, `${wo}: Summe`);
  assert.equal(m.labels.length, z.gesamt, `${wo}: Zeilen = gesamt`);
  assert.equal(new Set(m.labels.map((l: any) => l.schluessel)).size, m.labels.length, `${wo}: doppelt gezählt`);
  for (const g of ['offen', 'erledigt', 'fehlerhaft']) {
    assert.equal(m.labels.filter((l: any) => l.gruppe === g).length, z[g], `${wo}: Zeilen in ${g}`);
  }
  // Gruppe passt zum Status, Status passt zu Max' Sicht.
  const maxAnlagen = (await ruf(s, '/api/anlagen')).daten;
  let gesamtMax = 0;
  for (const a of maxAnlagen) {
    const mz = a.zaehlung;
    const erwartet = { offen: mz.offen + mz.nachgebessert, erledigt: mz.bestaetigt, fehlerhaft: mz.fehlerhaft + mz.unsicher + mz.fehlt };
    // „erfasst“ bei Max zählt nur Labels mit Foto; Datensätze sind alle Status zusammen.
    const datensaetze = Object.values(mz as Record<string, number>).reduce((x, y) => x + y, 0);
    const ohneDatensatz = Math.max(0, a.sollAnzahl - datensaetze);
    erwartet.fehlerhaft += ohneDatensatz;
    gesamtMax += datensaetze + ohneDatensatz;
    const ma = m.anlagen.find((x: any) => x.id === a.id);
    assert.ok(ma, `${wo}: Anlage ${a.id} fehlt bei Marie`);
    assert.deepEqual(ma.gruppen, erwartet, `${wo}: Gruppen ${a.id}`);
    assert.equal(ma.gesperrt, a.gesperrt, `${wo}: Sperre ${a.id} wie bei Max`);
    assert.equal(ma.bestaetigt, a.bestaetigt, `${wo}: bestätigt ${a.id}`);
    assert.equal(ma.gesamt, datensaetze + ohneDatensatz, `${wo}: gesamt ${a.id}`);
    assert.ok(ma.warum.length > 0, `${wo}: Warum ${a.id}`);
    // AK-43: eine gesperrte Anlage nennt jedes nicht bestätigte Label.
    if (ma.gesperrt) {
      const text = ma.warum.join(' ');
      for (const l of m.labels.filter((x: any) => x.anlageId === a.id && x.status !== 'bestaetigt' && x.label)) {
        assert.ok(text.includes(l.schluessel), `${wo}: Warum ${a.id} nennt ${l.schluessel} nicht`);
      }
    }
  }
  assert.equal(z.gesamt, gesamtMax, `${wo}: gesamt wie Anlagenliste/Datensätze`);
  // AK-41: Labels in Maries Rangfolge, Anlagen nach dem dringendsten Status.
  const raenge = m.labels.map((l: any) => RANG.indexOf(l.status));
  assert.deepEqual(raenge, [...raenge].sort((a, b) => a - b), `${wo}: Reihenfolge der Labels`);
  const dringend = (id: string) => Math.min(...m.labels.filter((l: any) => l.anlageId === id).map((l: any) => RANG.indexOf(l.status)));
  const ar = m.anlagen.map((a: any) => dringend(a.id));
  assert.deepEqual(ar, [...ar].sort((a, b) => a - b), `${wo}: Reihenfolge der Anlagen`);
  // AK-42: jede Zeile mit Status, Grund und Foto (außer nicht erfasst).
  for (const l of m.labels) {
    assert.equal(l.gruppe, GRUPPE[l.status], `${wo}: Gruppe ${l.schluessel}`);
    assert.ok(typeof l.grund === 'string' && l.grund.length > 10, `${wo}: Grund ${l.schluessel}`);
    assert.ok(l.warum.length > 0, `${wo}: Warum ${l.schluessel}`);
    if (l.label) {
      const max = (await ruf(s, `/api/labels/${l.label.id}`)).daten;
      assert.equal(l.status, max.status, `${wo}: Status ${l.schluessel} wie bei Max`);
      if (l.status !== 'fehlt') assert.ok(l.label.bildUrl, `${wo}: Foto ${l.schluessel}`);
    } else {
      assert.equal(l.status, 'fehlt', `${wo}: Zeile ohne Datensatz muss „Fehlt“ sein`);
    }
  }
  // AK-61: nichts aus den Erwartungswerten.
  const json = JSON.stringify(m);
  for (const verboten of ['_hinweis', 'erwart', 'nachSimulation', '"lesbar"']) assert.ok(!json.includes(verboten), `${wo}: ${verboten}`);
  return m;
}

describe('AK-40 bis AK-43: Invarianten auf den Testdaten', () => {
  test('Ausgangsstand: 20 gesamt, 9 offen, 7 erledigt, 4 fehlerhaft; alle Invarianten', () => mit(async (s) => {
    const m = await pruefeInvarianten(s, 'Start');
    assert.deepEqual(m.zahlen, { gesamt: 20, offen: 9, erledigt: 7, fehlerhaft: 4 });
    assert.deepEqual(m.anlagen.map((a: any) => a.id), ['SWR5', 'STA4', 'FOE2']);
  }));

  test('Fotos aller Zeilen lassen sich laden', () => mit(async (s) => {
    const m = await marie(s);
    for (const l of m.labels.filter((x: any) => x.label?.bildUrl)) {
      const r = await fetch(s.url + l.label.bildUrl);
      assert.equal(r.status, 200, l.schluessel);
      await r.arrayBuffer();
    }
  }));

  test('zufällige Folgen von Max-Aktionen (300 Schritte, 3 Läufe): Summe, Zuordnung, Sperre und Reihenfolge stimmen nach jedem Schritt', async () => {
    const ids = [...['STA4', 'SWR5', 'FOE2'].flatMap((a) => Array.from({ length: a === 'STA4' ? 10 : 5 }, (_, i) => `${a}-${String(i + 1).padStart(2, '0')}`))];
    for (let lauf = 1; lauf <= 3; lauf++) {
      let saat = lauf * 7919;
      const zufall = (n: number) => { saat = (saat * 1103515245 + 12345) % 2147483648; return saat % n; };
      await mit(async (s) => {
        for (let i = 0; i < 100; i++) {
          const id = ids[zufall(ids.length)]!;
          const art = zufall(6);
          if (art === 0 || art === 1) await alsMax(s, `/api/labels/${id}/bestaetigen`);
          else if (art === 2) await alsMax(s, `/api/labels/${id}/fehler`, { grund: ['unleserlich', 'sprache_falsch', 'beschaedigt'][zufall(3)] });
          else if (art === 3) await alsMax(s, `/api/labels/${id}/nachbessern`);
          else if (art === 4) await alsMax(s, `/api/labels/${id}/zuruecknehmen`);
          else await alsMax(s, `/api/anlagen/${id.slice(0, 4)}/freigeben`);
          if (zufall(4) === 0) await alsMax(s, `/api/labels/SWR5-05/nacherfassen`);
          await pruefeInvarianten(s, `Lauf ${lauf}, Schritt ${i}`);
        }
      });
    }
  });

  test('Grund folgt dem Weg gemeldet → fehlerhaft → nachgebessert → bestätigt (AK-12, AK-42)', () => mit(async (s) => {
    const zeile = async () => (await marie(s)).labels.find((l: any) => l.schluessel === 'STA4-02');
    await alsMax(s, '/api/labels/STA4-02/fehler', { grund: 'unleserlich' });
    let l = await zeile();
    assert.equal(l.gruppe, 'fehlerhaft');
    assert.match(l.grund, /Unleserlich/);
    await alsMax(s, '/api/labels/STA4-02/nachbessern');
    l = await zeile();
    assert.equal(l.status, 'nachgebessert');
    assert.equal(l.gruppe, 'offen');
    assert.match(l.grund, /Unleserlich/, 'Max\' Meldung bleibt sichtbar');
    await alsMax(s, '/api/labels/STA4-02/bestaetigen');
    l = await zeile();
    assert.equal(l.gruppe, 'erledigt');
    // Angepasst nach R13 (Bram, 11.10.2026): Marie sieht nur das Datum, keine Uhrzeit.
    assert.match(l.grund, /bestätigt am \d\d\.\d\d\.\d{4}\.$/);
  }));

  test('alles bestätigt, noch nicht freigegeben: Anlage bleibt „gesperrt“ und steht vor freigegebenen; Warum sagt es', () => mit(async (s) => {
    for (let i = 1; i <= 10; i++) await alsMax(s, `/api/labels/STA4-${String(i).padStart(2, '0')}/bestaetigen`);
    const m = await pruefeInvarianten(s, 'STA4 bestätigt');
    const sta = m.anlagen.find((a: any) => a.id === 'STA4');
    assert.equal(sta.gesperrt, true);
    assert.equal(sta.bestaetigt, 10);
    assert.match(sta.warum.join(' '), /noch nicht freigegeben/);
    assert.ok(m.anlagen.findIndex((a: any) => a.id === 'STA4') < m.anlagen.findIndex((a: any) => a.id === 'FOE2'));
    await alsMax(s, '/api/anlagen/STA4/freigeben');
    const n = await pruefeInvarianten(s, 'STA4 frei');
    assert.equal(n.anlagen.find((a: any) => a.id === 'STA4').gesperrt, false);
  }));
});

describe('AK-45: Anlagenliste legt die Soll-Anzahl fest', () => {
  test('zwei Labels laut Liste ohne Datensatz: zwei Zeilen „Fehlt“, als fehlerhaft gezählt, Anlage gesperrt, Freigabe 409', async () => {
    const d = ladeTestdaten(TESTDATEN);
    d.anlagen = d.anlagen.map((a: any) => (a.id === 'SWR5' ? { ...a, sollAnzahl: 7 } : a));
    await mit(async (s) => {
      const m = await pruefeInvarianten(s, 'Soll 7');
      assert.deepEqual(m.zahlen, { gesamt: 22, offen: 9, erledigt: 7, fehlerhaft: 6 });
      const leer = m.labels.filter((l: any) => l.anlageId === 'SWR5' && !l.label);
      assert.equal(leer.length, 2);
      for (const l of leer) assert.match(l.grund, /nicht erfasst/);
      // Selbst wenn alle vorhandenen SWR5-Labels bestätigt sind, bleibt die Anlage gesperrt.
      await alsMax(s, '/api/labels/SWR5-05/nacherfassen');
      await alsMax(s, '/api/labels/SWR5-02/nachbessern');
      for (const id of ['SWR5-01', 'SWR5-02', 'SWR5-03', 'SWR5-05']) assert.equal((await alsMax(s, `/api/labels/${id}/bestaetigen`)).status, 200, id);
      const n = await pruefeInvarianten(s, 'SWR5 bestätigt');
      const swr = n.anlagen.find((a: any) => a.id === 'SWR5');
      assert.equal(swr.gesperrt, true);
      assert.match(swr.warum.join(' '), /2 Labels laut Anlagenliste nicht erfasst/);
      assert.equal((await alsMax(s, '/api/anlagen/SWR5/freigeben')).status, 409);
    }, await eigeneDb(d));
  });

  test('freigegebene Anlage, deren Soll-Anzahl höher ist als erfasst: zeigt „gesperrt“ wie Max, nicht „freigegeben“', async () => {
    const d = ladeTestdaten(TESTDATEN);
    d.anlagen = d.anlagen.map((a: any) => (a.id === 'FOE2' ? { ...a, sollAnzahl: 6 } : a));
    await mit(async (s) => {
      const m = await pruefeInvarianten(s, 'FOE2 Soll 6');
      assert.equal(m.anlagen.find((a: any) => a.id === 'FOE2').gesperrt, true);
    }, await eigeneDb(d));
  });

  test('Label ohne Foto (SWR5-05): Zeile „Fehlt“ mit Grund, nach Nachreichen „offen“ und erst nach Bestätigung erledigt', () => mit(async (s) => {
    let l = (await marie(s)).labels.find((x: any) => x.schluessel === 'SWR5-05');
    assert.equal(l.status, 'fehlt');
    assert.equal(l.label.bildUrl ?? null, null);
    assert.match(l.grund, /nicht erfasst/);
    await alsMax(s, '/api/labels/SWR5-05/nacherfassen');
    l = (await pruefeInvarianten(s, 'nachgereicht')).labels.find((x: any) => x.schluessel === 'SWR5-05');
    assert.notEqual(l.gruppe, 'erledigt');
    assert.ok(l.label.bildUrl);
  }));
});

describe('AK-44: sofort aktuell (Signal)', () => {
  async function verbinde(s: Srv) {
    const ac = new AbortController();
    const res = await fetch(s.url + '/api/ereignisse', { signal: ac.signal });
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') ?? '', /text\/event-stream/);
    const leser = res.body!.getReader();
    const dec = new TextDecoder();
    let puffer = '';
    const nachrichten: string[] = [];
    void (async () => {
      try {
        for (;;) {
          const { value, done } = await leser.read();
          if (done) break;
          puffer += dec.decode(value, { stream: true });
          let i;
          while ((i = puffer.indexOf('\n\n')) >= 0) {
            const block = puffer.slice(0, i); puffer = puffer.slice(i + 2);
            const data = block.split('\n').filter((z) => z.startsWith('data:')).map((z) => z.slice(5).trim()).join('');
            if (data) nachrichten.push(data);
          }
        }
      } catch { /* abgebrochen */ }
    })();
    const warte = async (anzahl: number, ms = 1000) => {
      const ende = Date.now() + ms;
      while (nachrichten.length < anzahl && Date.now() < ende) await new Promise((r) => setTimeout(r, 10));
      return nachrichten.length;
    };
    return { nachrichten, warte, zu: () => ac.abort() };
  }

  test('jede erfolgreiche Änderung von Max sendet genau ein Signal; danach liefert /api/marie den neuen Stand', () => mit(async (s) => {
    const v = await verbinde(s);
    try {
      assert.equal(await v.warte(1), 1, 'erste Nachricht beim Verbinden');
      const schritte: [string, unknown?][] = [
        ['/api/labels/STA4-01/bestaetigen'],
        ['/api/labels/STA4-02/fehler', { grund: 'beschaedigt' }],
        ['/api/labels/STA4-02/nachbessern'],
        ['/api/labels/STA4-01/zuruecknehmen'],
        ['/api/labels/SWR5-05/nacherfassen'],
      ];
      let erwartet = 1;
      let vorher = (await marie(s)).zahlen;
      for (const [pfad, k] of schritte) {
        assert.equal((await alsMax(s, pfad, k)).status, 200, pfad);
        erwartet += 1;
        assert.equal(await v.warte(erwartet), erwartet, `Signal nach ${pfad}`);
        const nachher = (await pruefeInvarianten(s, pfad)).zahlen;
        assert.notDeepEqual(nachher, vorher, `Zahlen ändern sich nach ${pfad}`);
        vorher = nachher;
      }
    } finally { v.zu(); }
  }));

  test('abgelehnte Schreibversuche (Marie, 409, 404) und Lesen senden kein Signal', () => mit(async (s) => {
    const v = await verbinde(s);
    try {
      await v.warte(1);
      await ruf(s, '/api/labels/STA4-01/bestaetigen', { methode: 'POST', rolle: 'marie' });
      await alsMax(s, '/api/anlagen/STA4/freigeben');
      await alsMax(s, '/api/labels/GIBT-ES-NICHT/bestaetigen');
      await marie(s);
      assert.equal(await v.warte(2, 400), 1);
    } finally { v.zu(); }
  }));
});

describe('AK-46: Marie sieht nur, auch über die Schnittstelle', () => {
  const SCHREIBEN: [string, unknown?][] = [
    ['/api/labels/STA4-01/bestaetigen'],
    ['/api/labels/STA4-08/bestaetigen'],
    ['/api/labels/STA4-01/fehler', { grund: 'beschaedigt' }],
    ['/api/labels/SWR5-02/nachbessern'],
    ['/api/labels/SWR5-04/zuruecknehmen'],
    ['/api/labels/SWR5-05/nacherfassen'],
    ['/api/anlagen/FOE2/freigeben'],
    ['/api/anlagen/STA4/freigeben'],
  ];

  test('jeder schreibende Aufruf als Marie, ohne Rolle oder mit falsch geschriebener Rolle → 403; Übersicht und Protokoll unverändert', () => mit(async (s, db) => {
    const vorher = JSON.stringify(await marie(s));
    const eintraege = () => (db.prepare('SELECT COUNT(*) AS n FROM entscheidungen').get() as any).n;
    const n0 = eintraege();
    for (const rolle of ['marie', undefined, 'Marie', 'MAX', 'max,marie', 'admin']) {
      for (const [pfad, k] of SCHREIBEN) {
        const r = await ruf(s, pfad, { methode: 'POST', rolle, koerper: k });
        assert.equal(r.status, 403, `${rolle} ${pfad}`);
      }
    }
    assert.equal(JSON.stringify(await marie(s)), vorher);
    assert.equal(eintraege(), n0);
  }));

  test('andere Methoden auf Maries und Max\' Adressen ändern nichts', () => mit(async (s) => {
    const vorher = JSON.stringify(await marie(s));
    for (const methode of ['PUT', 'PATCH', 'DELETE', 'POST']) {
      for (const pfad of ['/api/marie', '/api/ereignisse', '/api/labels/STA4-01', '/api/anlagen/STA4']) {
        const r = await ruf(s, pfad, { methode, rolle: 'marie', koerper: { status: 'bestaetigt' } });
        assert.ok(r.status >= 400 && r.status < 500, `${methode} ${pfad} → ${r.status}`);
      }
    }
    for (const [pfad] of SCHREIBEN) assert.equal((await ruf(s, pfad, { rolle: 'marie' })).status, 404, `GET ${pfad}`);
    assert.equal(JSON.stringify(await marie(s)), vorher);
  }));
});
