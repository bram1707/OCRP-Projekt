// Stufe 4, B2 und B3: wählbarer Datensatz, npm run demo und die Demo-Daten für Nutzertests (AK-50).
// Die 20 Testlabels der Stufen 1 bis 3 bleiben unverändert (Widerspruch 3).

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { after, before, describe, test } from 'node:test';
import type { MarieUebersicht } from '../src/server/marie.ts';
import { bereiteSystemVor, datenbankPfad, leseDatensatz } from '../src/server/system.ts';
import { antwort } from '../src/ui/marie/logik.ts';
import {
  anfrage, DEMO, DEMO_BILDER, demoDaten, demoErwartungen, neueDemoDatenbank, starteServer, TESTDATEN, WURZEL, type TestServer,
} from './hilfen.ts';

const daten = demoDaten();
const erwartet = demoErwartungen();
const max = { methode: 'POST' as const, rolle: 'max' };
const sprachFalsch = { ...max, koerper: JSON.stringify({ grund: 'sprache_falsch' }) };

/** Setzt Umgebungsvariablen für die Dauer von `arbeit` und stellt sie danach wieder her. */
async function mitUmgebung<T>(werte: Record<string, string | undefined>, arbeit: () => Promise<T>): Promise<T> {
  const vorher = Object.fromEntries(Object.keys(werte).map((k) => [k, process.env[k]]));
  const setze = (w: Record<string, string | undefined>) => {
    for (const [k, v] of Object.entries(w)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  };
  setze(werte);
  try {
    return await arbeit();
  } finally {
    setze(vorher);
  }
}

async function mitDemoServer(arbeit: (s: TestServer, db: DatabaseSync) => Promise<void>): Promise<void> {
  const db = await neueDemoDatenbank();
  const s = await starteServer(db, DEMO_BILDER);
  try {
    await arbeit(s, db);
  } finally {
    await s.schliessen();
    db.close();
  }
}

const labelsVon = (anlageId: string) => daten.labels.filter((l) => l.anlageId === anlageId).map((l) => l.id);

async function bestaetige(s: TestServer, ids: readonly string[]): Promise<void> {
  for (const id of ids) assert.equal((await anfrage(s, `/api/labels/${id}/bestaetigen`, max)).status, 200, id);
}

describe('B2 Datensatz wählbar', () => {
  test('ohne Angabe gilt der Basisdatensatz, DATENSATZ=demo wählt die Demo, alles andere bricht ab', () => {
    assert.equal(leseDatensatz({}), 'basis');
    assert.equal(leseDatensatz({ DATENSATZ: '' }), 'basis');
    assert.equal(leseDatensatz({ DATENSATZ: 'basis' }), 'basis');
    assert.equal(leseDatensatz({ DATENSATZ: 'demo' }), 'demo');
    assert.equal(leseDatensatz({ DATENSATZ: ' demo ' }), 'demo');
    assert.throws(() => leseDatensatz({ DATENSATZ: 'Demo2' }), /DATENSATZ=Demo2 ist unbekannt/);
  });

  test('jeder Datensatz hat eine eigene Datenbank; DB_PFAD gilt für beide', () => {
    assert.equal(datenbankPfad('/w', 'basis', {}), join('/w', 'daten', 'pruefsystem.sqlite'));
    assert.equal(datenbankPfad('/w', 'demo', {}), join('/w', 'daten', 'demo.sqlite'));
    assert.equal(datenbankPfad('/w', 'demo', { DB_PFAD: '/x/y.sqlite' }), '/x/y.sqlite');
  });

  test('mit DATENSATZ=demo: 4 Anlagen und die Testanlage „Eigene Fotos“, 48 Labels, Fotos aus testdaten/demo, simulierte Erkennung erzwungen', async () => {
    const ordner = mkdtempSync(join(tmpdir(), 'pruefsystem-demo-'));
    try {
      const system = await mitUmgebung(
        { DATENSATZ: 'demo', DB_PFAD: join(ordner, 'demo.sqlite'), LLM_MODUS: 'echt', LLM_API_KEY: 'nur-ein-test' },
        () => bereiteSystemVor(WURZEL),
      );
      try {
        assert.equal(system.datensatz, 'demo');
        assert.equal(system.konfiguration.modus, 'mock');
        assert.equal(system.datenOrdner, DEMO);
        assert.equal(system.bilderOrdner, DEMO_BILDER);
        const anlagen = system.db.prepare('SELECT id FROM anlagen ORDER BY id').all().map((z) => z.id);
        assert.deepEqual(anlagen, ['ABF5', 'EIG1', 'LAC2', 'MON1', 'PRE3']);
        assert.equal((system.db.prepare('SELECT COUNT(*) AS n FROM labels').get() as { n: number }).n, 48);
      } finally {
        system.db.close();
      }
    } finally {
      rmSync(ordner, { recursive: true, force: true });
    }
  });

  test('ohne DATENSATZ bleibt alles wie bisher: 20 Testlabels auf Stanzanlage 4, Förderband 2, Schweißroboter 5', async () => {
    const ordner = mkdtempSync(join(tmpdir(), 'pruefsystem-basis-'));
    try {
      const system = await mitUmgebung(
        { DATENSATZ: undefined, DB_PFAD: join(ordner, 'basis.sqlite'), LLM_MODUS: 'mock' },
        () => bereiteSystemVor(WURZEL),
      );
      try {
        assert.equal(system.datensatz, 'basis');
        assert.equal(system.datenOrdner, TESTDATEN);
        assert.equal(system.bilderOrdner, join(TESTDATEN, 'bilder'));
        const anlagen = system.db.prepare('SELECT id FROM anlagen ORDER BY id').all().map((z) => z.id);
        assert.deepEqual(anlagen, ['FOE2', 'STA4', 'SWR5']);
        assert.equal((system.db.prepare('SELECT COUNT(*) AS n FROM labels').get() as { n: number }).n, 20);
      } finally {
        system.db.close();
      }
    } finally {
      rmSync(ordner, { recursive: true, force: true });
    }
  });

  test('npm run demo baut die Oberfläche und startet src/server/demo.ts; npm start bleibt beim Basisdatensatz', () => {
    const skripte = JSON.parse(readFileSync(join(WURZEL, 'package.json'), 'utf8')).scripts as Record<string, string>;
    assert.match(skripte.demo!, /^vite build --configLoader native && node .*src\/server\/demo\.ts$/);
    assert.match(skripte.start!, /src\/server\/start\.ts$/);
    assert.doesNotMatch(skripte.start!, /DATENSATZ|demo/);
  });

  test('der Demo-Start meldet die Demo-Daten und liefert die drei Demo-Anlagen', async () => {
    const ordner = mkdtempSync(join(tmpdir(), 'pruefsystem-demo-start-'));
    const kind = spawn(
      process.execPath,
      ['--disable-warning=ExperimentalWarning', join(WURZEL, 'src', 'server', 'demo.ts')],
      { env: { ...process.env, PORT: '0', DB_PFAD: join(ordner, 'demo.sqlite'), DATENSATZ: '' }, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    try {
      const { url, ausgabe } = await new Promise<{ url: string; ausgabe: string }>((fertig, fehler) => {
        let puffer = '';
        kind.stdout.on('data', (stueck: Buffer) => {
          puffer += stueck.toString('utf8');
          const treffer = /http:\/\/127\.0\.0\.1:\d+/.exec(puffer);
          if (treffer) fertig({ url: treffer[0], ausgabe: puffer });
        });
        kind.on('exit', (code) => fehler(new Error(`Server beendet mit ${code}: ${puffer}`)));
        setTimeout(() => fehler(new Error(`keine Startmeldung: ${puffer}`)), 10_000);
      });
      assert.match(ausgabe, /Spracherkennung: mock, Texterkennung für eigene Fotos: (tesseract|aus), Demo-Daten/);
      const anlagen = (await (await fetch(`${url}/api/anlagen`)).json()) as { name: string }[];
      assert.deepEqual(anlagen.map((a) => a.name).sort(), ['Abfüllung 5', 'Lackierung 2', 'Montagelinie 1', 'Presse 3', 'Testanlage Eigene Fotos']);
    } finally {
      kind.kill();
      rmSync(ordner, { recursive: true, force: true });
    }
  });
});

describe('B3 Demo-Daten (AK-50)', () => {
  test('Presse 3 mit 12, Montagelinie 1 mit 15, Lackierung 2 mit 10, Abfüllung 5 mit 8 Labels, jedes mit Foto; dazu 3 leere Plätze für eigene Fotos', () => {
    assert.deepEqual(
      daten.anlagen.map((a) => [a.id, a.name, a.sollAnzahl]),
      [['PRE3', 'Presse 3', 12], ['MON1', 'Montagelinie 1', 15], ['LAC2', 'Lackierung 2', 10], ['ABF5', 'Abfüllung 5', 8], ['EIG1', 'Testanlage Eigene Fotos', 3]],
    );
    for (const a of daten.anlagen) assert.equal(labelsVon(a.id).length, a.sollAnzahl, a.id);
    const demo = daten.labels.filter((l) => l.anlageId !== 'EIG1');
    assert.ok(demo.every((l) => l.bild !== null && !l.ausgangszustand && !l.nacherfassung));
    assert.ok(labelsVon('EIG1').every((id) => daten.labels.find((l) => l.id === id)!.bild === null));
    assert.ok(daten.anlagen.every((a) => !a.freigabe));
  });

  test('zu jedem Demo-Label gibt es genau einen Erwartungswert', () => {
    assert.deepEqual(Object.keys(erwartet).sort(), daten.labels.map((l) => l.id).sort());
  });

  test('genau die drei Labels mit Befund haben Daten für die Nachbesserung, mit eigenem Foto', () => {
    const mitNachbesserung = daten.labels.filter((l) => l.nachKorrektur).map((l) => l.id);
    assert.deepEqual(mitNachbesserung, ['MON1-11', 'LAC2-04', 'LAC2-07']);
    for (const l of daten.labels.filter((x) => x.nachKorrektur)) {
      assert.ok(existsSync(join(DEMO_BILDER, l.nachKorrektur!.bild!)), l.id);
    }
  });

  test('alle Fotos sind Platzhalter-SVGs ohne Skript', () => {
    const fotos = daten.labels.flatMap((l) => [l.bild, l.nachKorrektur?.bild]).filter((b): b is string => typeof b === 'string');
    assert.equal(fotos.length, 48);
    for (const bild of fotos) {
      const svg = readFileSync(join(DEMO_BILDER, bild), 'utf8');
      assert.ok(svg.startsWith('<svg') && svg.includes('Platzhalterfoto'), bild);
      assert.doesNotMatch(svg, /<script|on\w+=/i, bild);
    }
  });

  test('Labeldaten der Demo enthalten keine Erwartungswerte', () => {
    const roh = readFileSync(join(DEMO, 'labels.json'), 'utf8') + readFileSync(join(DEMO, 'anlagen.json'), 'utf8');
    for (const wort of ['erwart', 'lesbar', 'auffaellig', 'tatsaechlich', 'notiz']) assert.ok(!roh.includes(wort), wort);
  });

  describe('je Demo-Label: Sprachen, Status und Auffälligkeit nach dem Einspielen', () => {
    let db: DatabaseSync;
    let s: TestServer;
    before(async () => {
      db = await neueDemoDatenbank();
      s = await starteServer(db, DEMO_BILDER);
    });
    after(async () => {
      await s.schliessen();
      db.close();
    });

    for (const l of daten.labels) {
      const e = erwartet[l.id]!;
      test(`${l.id}: ${e.sprachen.join('+')}, ${e.status}${e.auffaellig.length ? `, auffällig (${e.auffaellig.join(', ')})` : ''}`, async () => {
        const { status, daten: label } = await anfrage(s, `/api/labels/${l.id}`);
        assert.equal(status, 200);
        assert.deepEqual(label.sprachen.map((x: { code: string }) => x.code), e.sprachen);
        assert.equal(label.status, e.status);
        assert.equal(label.prioritaet === 'genau_pruefen', e.unsicher || e.auffaellig.length > 0);
        assert.deepEqual(label.gruende.map((g: { code: string }) => g.code), e.auffaellig);
      });
    }
  });

  test('Marie sieht zu Beginn 48 gesamt, 44 offen, 0 erledigt, 4 fehlerhaft (das unsicher erkannte Label und die 3 leeren Plätze)', async () => {
    await mitDemoServer(async (s) => {
      const uebersicht = (await anfrage(s, '/api/marie')).daten as MarieUebersicht;
      assert.deepEqual(uebersicht.zahlen, { gesamt: 48, offen: 44, erledigt: 0, fehlerhaft: 4 });
      assert.deepEqual(uebersicht.labels.filter((l) => l.gruppe === 'fehlerhaft').map((l) => l.schluessel), ['EIG1-01', 'EIG1-02', 'EIG1-03', 'LAC2-04']);
      assert.match(antwort(uebersicht), /^Nein\. 48 von 48 Labels sind noch nicht erledigt\.$/);
    });
  });

  test('keine Notiz und kein Erwartungswert der Demo steht in einer Antwort des Servers', async () => {
    await mitDemoServer(async (s) => {
      const notizen = Object.values(erwartet).flatMap((e) => (e.notiz ? [e.notiz] : []));
      assert.equal(notizen.length, 3);
      const antworten = [
        (await anfrage(s, '/api/anlagen')).text,
        (await anfrage(s, '/api/marie')).text,
        ...(await Promise.all(daten.anlagen.map(async (a) => (await anfrage(s, `/api/anlagen/${a.id}/labels`)).text))),
        ...(await Promise.all(daten.labels.map(async (l) => (await anfrage(s, `/api/labels/${l.id}`)).text))),
      ];
      for (const text of antworten) {
        for (const notiz of notizen) assert.ok(!text.includes(notiz), notiz);
        assert.doesNotMatch(text, /"lesbar"|"notiz"|nachSimulation|nachKorrektur|erwartung/);
      }
    });
  });

  describe('je Anlage ein Durchlauf über die Schnittstelle bis „Freigegeben“', () => {
    test('Presse 3: alle 12 bestätigen, dann freigeben', async () => {
      await mitDemoServer(async (s) => {
        assert.equal((await anfrage(s, '/api/anlagen/PRE3/freigeben', max)).status, 409);
        await bestaetige(s, labelsVon('PRE3'));
        const { status, daten: anlage } = await anfrage(s, '/api/anlagen/PRE3/freigeben', max);
        assert.equal(status, 200);
        assert.equal(anlage.gesperrt, false);
      });
    });

    test('Montagelinie 1: Label nur auf Deutsch melden, nachbessern, als „Nachgebessert“ bestätigen, freigeben', async () => {
      await mitDemoServer(async (s) => {
        await bestaetige(s, labelsVon('MON1').filter((id) => id !== 'MON1-11'));
        assert.equal((await anfrage(s, '/api/labels/MON1-11/fehler', sprachFalsch)).status, 200);
        assert.equal((await anfrage(s, '/api/anlagen/MON1/freigeben', max)).status, 409);

        const nach = (await anfrage(s, '/api/labels/MON1-11/nachbessern', max)).daten;
        assert.equal(nach.status, 'nachgebessert');
        assert.deepEqual(nach.sprachen.map((x: { code: string }) => x.code), erwartet['MON1-11']!.nachSimulation!.sprachen);
        assert.equal(nach.bildUrl, '/bilder/MON1-11-neu.svg');
        const anlage = (await anfrage(s, '/api/anlagen/MON1/labels')).daten.anlage;
        assert.equal(`${anlage.bestaetigt} von ${anlage.sollAnzahl}`, '14 von 15');

        await bestaetige(s, ['MON1-11']);
        assert.equal((await anfrage(s, '/api/anlagen/MON1/freigeben', max)).status, 200);
      });
    });

    test('Lackierung 2, Weg 1: unsicheres Label bestätigen, Deutsch/Russisch melden und nachbessern, dann freigeben', async () => {
      await mitDemoServer(async (s) => {
        await bestaetige(s, labelsVon('LAC2').filter((id) => id !== 'LAC2-07'));
        assert.equal((await anfrage(s, '/api/labels/LAC2-07/fehler', sprachFalsch)).status, 200);
        const nach = (await anfrage(s, '/api/labels/LAC2-07/nachbessern', max)).daten;
        assert.equal(nach.status, 'nachgebessert');
        assert.deepEqual(nach.sprachen.map((x: { code: string }) => x.code), erwartet['LAC2-07']!.nachSimulation!.sprachen);
        await bestaetige(s, ['LAC2-07']);
        assert.equal((await anfrage(s, '/api/anlagen/LAC2/freigeben', max)).status, 200);
      });
    });

    test('Lackierung 2, Weg 2: bestätigt Max auch Deutsch/Russisch gleich, geht die Freigabe ebenfalls (Befund für den Test)', async () => {
      await mitDemoServer(async (s) => {
        await bestaetige(s, labelsVon('LAC2'));
        assert.equal((await anfrage(s, '/api/anlagen/LAC2/freigeben', max)).status, 200);
      });
    });

    // „Ja“ gibt es erst mit drei eigenen Fotos; das prüft tests/upload-server.test.ts.
    test('nach allen vier Demo-Anlagen fehlen nur noch die 3 Plätze der Testanlage „Eigene Fotos“', async () => {
      await mitDemoServer(async (s) => {
        await bestaetige(s, [...labelsVon('PRE3'), ...labelsVon('MON1'), ...labelsVon('LAC2'), ...labelsVon('ABF5')]);
        for (const a of ['PRE3', 'MON1', 'LAC2', 'ABF5']) assert.equal((await anfrage(s, `/api/anlagen/${a}/freigeben`, max)).status, 200, a);
        assert.equal((await anfrage(s, '/api/anlagen/EIG1/freigeben', max)).status, 409);
        const uebersicht = (await anfrage(s, '/api/marie')).daten as MarieUebersicht;
        assert.deepEqual(uebersicht.zahlen, { gesamt: 48, offen: 0, erledigt: 45, fehlerhaft: 3 });
        assert.equal(antwort(uebersicht), 'Nein. 3 von 48 Labels sind noch nicht erledigt.');
      });
    });
  });
});
