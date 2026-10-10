// Stufe 2, Server: Simulation (F4), Zurücknehmen (F5), Fotos nur bei Verwendung,
// Datenbank-Stand, Auslieferung der gebauten Oberfläche, abgerundete Prozent.

import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { after, before, describe, test } from 'node:test';
import { bewerteAnlage, prozent } from '../src/ai/auffaelligkeit.ts';
import { holeEntscheidungen, holeLabel } from '../src/db/abfragen.ts';
import { oeffneDatenbankMitStand } from '../src/db/datenbank.ts';
import { SCHEMA_STAND } from '../src/db/schema.ts';
import { erstelleHandler, erstelleServer } from '../src/server/app.ts';
import { CSP_OBERFLAECHE } from '../src/server/statisch.ts';
import { anfrage, BILDER, erwartungen, neueDatenbank, starteServer, type TestServer } from './hilfen.ts';

const max = { methode: 'POST', rolle: 'max' } as const;
const verlauf = (db: DatabaseSync, id: string) => holeEntscheidungen(db, id).map((e) => `${e.wer}:${e.ergebnis}:${e.grund ?? ''}`);

async function mitServer(arbeit: (s: TestServer, db: DatabaseSync) => Promise<void>): Promise<void> {
  const db = await neueDatenbank();
  const s = await starteServer(db);
  try {
    await arbeit(s, db);
  } finally {
    await s.schliessen();
  }
}

describe('F4 Nachbesserung mit neuem Foto (STA4-08)', () => {
  test('Foto, Text und Erkennung werden ersetzt; das neue Foto ist erst danach abrufbar', async () => {
    await mitServer(async (s, db) => {
      assert.equal((await anfrage(s, '/bilder/STA4-08-neu.svg')).status, 404, 'vorher nicht abrufbar');
      assert.equal((await anfrage(s, '/api/labels/STA4-08/fehler', { ...max, koerper: JSON.stringify({ grund: 'unleserlich' }) })).status, 200);
      const { status, daten } = await anfrage(s, '/api/labels/STA4-08/nachbessern', max);
      assert.equal(status, 200);
      assert.equal(daten.status, 'nachgebessert');
      assert.equal(daten.bildUrl, '/bilder/STA4-08-neu.svg');
      assert.match(daten.ocrText, /Quetschgefahr/);
      assert.deepEqual(daten.sprachen.map((x: any) => `${x.code}:${x.sicher}`), ['de:true', 'pl:true']);
      assert.equal(daten.hinweis, null);
      assert.equal(daten.letzterFehlergrundText, 'Unleserlich', 'Max\' Hinweis bleibt');
      assert.deepEqual(daten.gruende.map((g: any) => g.code), ['nachgebessert']);

      assert.equal((await anfrage(s, '/bilder/STA4-08-neu.svg')).status, 200);
      assert.equal((await anfrage(s, '/bilder/STA4-08.svg')).status, 404, 'das alte Foto gehört zu keinem Label mehr');
      assert.equal(holeLabel(db, 'STA4-08')!.korrektur, null, 'Korrekturdaten sind verbraucht');
      assert.deepEqual(verlauf(db, 'STA4-08'), ['max:fehler:unleserlich', 'simulation:nachgebessert:']);
    });
  });

  test('ohne Foto in den Korrekturdaten bleibt das alte Foto (SWR5-02)', async () => {
    await mitServer(async (s) => {
      const { daten } = await anfrage(s, '/api/labels/SWR5-02/nachbessern', max);
      assert.equal(daten.bildUrl, '/bilder/SWR5-02.svg');
      assert.equal(daten.ocrKonfidenz, 0.97);
    });
  });
});

describe('F4 Foto nachreichen (SWR5-05)', () => {
  test('liefert Foto und Text nur aus den Testdaten; Status aus der Erkennung; Protokoll „nacherfasst“', async () => {
    await mitServer(async (s, db) => {
      assert.equal((await anfrage(s, '/bilder/SWR5-05.svg')).status, 404, 'vorher nicht abrufbar');
      // Der Anfragekörper wird nicht beachtet.
      const koerper = JSON.stringify({ bild: 'STA4-01.svg', ocrText: 'ACHTUNG', ocrKonfidenz: 0.1, status: 'bestaetigt' });
      const { status, daten } = await anfrage(s, '/api/labels/SWR5-05/nacherfassen', { ...max, koerper });
      assert.equal(status, 200);
      assert.equal(daten.status, 'offen');
      assert.equal(daten.bildUrl, '/bilder/SWR5-05.svg');
      assert.match(daten.ocrText, /Zutritt für Unbefugte verboten/);
      assert.deepEqual(daten.sprachen.map((x: any) => x.code), ['de', 'ru']);
      assert.equal(daten.auffaellig, false, 'gleiche Sprachen wie die anderen Labels der Anlage');
      assert.equal((await anfrage(s, '/bilder/SWR5-05.svg')).status, 200);

      assert.deepEqual(verlauf(db, 'SWR5-05'), ['simulation:nacherfasst:']);
      assert.equal(holeLabel(db, 'SWR5-05')!.nacherfassung, null);
      const z = (await anfrage(s, '/api/anlagen/SWR5/zusammenfassung')).daten;
      assert.equal(z.nachgebessert, 1, 'Nachreichen zählt nicht als Nachbesserung');
    });
  });

  test('nur für Labels ohne Foto (409), unbekannt 404, nur einmal', async () => {
    await mitServer(async (s, db) => {
      assert.equal((await anfrage(s, '/api/labels/STA4-01/nacherfassen', max)).status, 409);
      assert.equal((await anfrage(s, '/api/labels/SWR5-02/nacherfassen', max)).status, 409);
      assert.equal((await anfrage(s, '/api/labels/GIBT-ES-NICHT/nacherfassen', max)).status, 404);
      assert.equal((await anfrage(s, '/api/labels/SWR5-05/nacherfassen', max)).status, 200);
      assert.equal((await anfrage(s, '/api/labels/SWR5-05/nacherfassen', max)).status, 409);
      assert.deepEqual(verlauf(db, 'SWR5-05'), ['simulation:nacherfasst:']);
      assert.deepEqual(verlauf(db, 'STA4-01'), []);
    });
  });

  test('ein Label ohne Foto und ohne Daten für die Simulation bleibt „Fehlt“ (409)', async () => {
    const db = await neueDatenbank();
    db.prepare('UPDATE labels SET nacherfassung_bild_pfad = NULL, nacherfassung_ocr_text = NULL, nacherfassung_ocr_konfidenz = NULL').run();
    const s = await starteServer(db);
    try {
      const { status, daten } = await anfrage(s, '/api/labels/SWR5-05/nacherfassen', max);
      assert.equal(status, 409);
      assert.match(daten.fehler, /kein Foto/);
      assert.equal(holeLabel(db, 'SWR5-05')!.status, 'fehlt');
    } finally {
      await s.schliessen();
    }
  });

  test('vorher erscheint nichts aus der Nacherfassung in einer Antwort', async () => {
    await mitServer(async (s) => {
      for (const pfad of ['/api/anlagen', '/api/anlagen/SWR5/labels', '/api/labels/SWR5-05', '/api/anlagen/SWR5/zusammenfassung']) {
        const { text } = await anfrage(s, pfad);
        for (const wort of ['nacherfassung', 'Zutritt', 'SWR5-05.svg', 'STA4-08-neu']) assert.ok(!text.includes(wort), `${pfad}: ${wort}`);
      }
    });
  });

  test('Schweißroboter 5 lässt sich nach Nachbesserung und Nachreichen freigeben', async () => {
    await mitServer(async (s) => {
      assert.equal((await anfrage(s, '/api/labels/SWR5-02/nachbessern', max)).status, 200);
      assert.equal((await anfrage(s, '/api/labels/SWR5-05/nacherfassen', max)).status, 200);
      for (const id of ['SWR5-01', 'SWR5-02', 'SWR5-03', 'SWR5-05']) {
        assert.equal((await anfrage(s, `/api/labels/${id}/bestaetigen`, max)).status, 200, id);
      }
      const f = await anfrage(s, '/api/anlagen/SWR5/freigeben', max);
      assert.equal(f.status, 200);
      assert.equal(f.daten.gesperrt, false);
    });
  });
});

describe('AK-35, AK-63 Sprachen nach der Simulation', () => {
  const schritt = (status: string) => (status === 'offen' || status === 'unsicher' ? 'nacherfassen' : 'nachbessern');
  for (const [id, e] of Object.entries(erwartungen())) {
    const nach = e.nachSimulation;
    if (!nach) continue;
    test(`${id}: nach der Simulation ${nach.sprachen.join('/')}, Status ${nach.status}`, async () => {
      await mitServer(async (s) => {
        if (e.status !== 'fehlerhaft' && e.status !== 'fehlt') {
          await anfrage(s, `/api/labels/${id}/fehler`, { ...max, koerper: JSON.stringify({ grund: 'unleserlich' }) });
        }
        const { status, daten } = await anfrage(s, `/api/labels/${id}/${schritt(nach.status)}`, max);
        assert.equal(status, 200);
        assert.equal(daten.status, nach.status);
        assert.deepEqual(daten.sprachen.map((x: any) => x.code).sort(), [...nach.sprachen].sort());
        if (nach.lesbar) {
          for (const x of daten.sprachen) assert.ok(x.konfidenz >= 0.9 && x.sicher, `${x.code} sicher erkannt`);
          assert.equal(daten.hinweis, null);
        }
      });
    });
  }
});

describe('F5 Bestätigung zurücknehmen', () => {
  test('ein offenes Label wird wieder „Offen“; Protokoll „zurueckgenommen“', async () => {
    await mitServer(async (s, db) => {
      assert.equal((await anfrage(s, '/api/labels/STA4-01/bestaetigen', max)).status, 200);
      const { status, daten } = await anfrage(s, '/api/labels/STA4-01/zuruecknehmen', max);
      assert.equal(status, 200);
      assert.equal(daten.status, 'offen');
      assert.deepEqual(verlauf(db, 'STA4-01'), ['max:bestaetigt:', 'max:zurueckgenommen:']);
      assert.equal((await anfrage(s, '/api/anlagen/STA4/labels')).daten.anlage.bestaetigt, 1, 'nur STA4-10 bleibt bestätigt');
    });
  });

  test('der Status von vorher bleibt erhalten: Unsicher, Nachgebessert, Offen', async () => {
    await mitServer(async (s) => {
      // STA4-09 ist unsicher erkannt.
      await anfrage(s, '/api/labels/STA4-09/bestaetigen', max);
      assert.equal((await anfrage(s, '/api/labels/STA4-09/zuruecknehmen', max)).daten.status, 'unsicher');
      // SWR5-03 kam aus der Nachbesserung.
      await anfrage(s, '/api/labels/SWR5-03/bestaetigen', max);
      assert.equal((await anfrage(s, '/api/labels/SWR5-03/zuruecknehmen', max)).daten.status, 'nachgebessert');
      // STA4-10 war schon zu Beginn bestätigt.
      assert.equal((await anfrage(s, '/api/labels/STA4-10/zuruecknehmen', max)).daten.status, 'offen');
    });
  });

  test('nur bestätigte Labels (409), unbekannt 404, nicht nach der Freigabe (409)', async () => {
    await mitServer(async (s, db) => {
      assert.equal((await anfrage(s, '/api/labels/STA4-01/zuruecknehmen', max)).status, 409);
      assert.equal((await anfrage(s, '/api/labels/SWR5-02/zuruecknehmen', max)).status, 409);
      assert.equal((await anfrage(s, '/api/labels/GIBT-ES-NICHT/zuruecknehmen', max)).status, 404);
      const f = await anfrage(s, '/api/labels/FOE2-01/zuruecknehmen', max);
      assert.equal(f.status, 409);
      assert.match(f.daten.fehler, /bereits freigegeben/);
      assert.equal(holeLabel(db, 'FOE2-01')!.status, 'bestaetigt');
      assert.deepEqual(verlauf(db, 'FOE2-01'), ['max:bestaetigt:']);
    });
  });

  test('nach dem Zurücknehmen ist die Freigabe nicht mehr möglich', async () => {
    await mitServer(async (s) => {
      await anfrage(s, '/api/labels/SWR5-02/nachbessern', max);
      await anfrage(s, '/api/labels/SWR5-05/nacherfassen', max);
      for (const id of ['SWR5-01', 'SWR5-02', 'SWR5-03', 'SWR5-05']) await anfrage(s, `/api/labels/${id}/bestaetigen`, max);
      assert.equal((await anfrage(s, '/api/anlagen/SWR5/zusammenfassung')).daten.freigabeMoeglich, true);
      await anfrage(s, '/api/labels/SWR5-04/zuruecknehmen', max);
      assert.equal((await anfrage(s, '/api/anlagen/SWR5/zusammenfassung')).daten.freigabeMoeglich, false);
      assert.equal((await anfrage(s, '/api/anlagen/SWR5/freigeben', max)).status, 409);
    });
  });
});

describe('neue Endpunkte verlangen die Rolle max', () => {
  test('zuruecknehmen und nacherfassen: 403 für jede andere Rolle, nichts ändert sich', async () => {
    await mitServer(async (s, db) => {
      for (const pfad of ['/api/labels/STA4-10/zuruecknehmen', '/api/labels/SWR5-05/nacherfassen']) {
        for (const rolle of [undefined, 'marie', 'admin', 'MAX', 'max,marie']) {
          assert.equal((await anfrage(s, pfad, { methode: 'POST', rolle })).status, 403, `${pfad} als ${String(rolle)}`);
        }
      }
      assert.equal(holeLabel(db, 'STA4-10')!.status, 'bestaetigt');
      assert.equal(holeLabel(db, 'SWR5-05')!.status, 'fehlt');
    });
  });
});

describe('Prozent werden abgerundet', () => {
  test('0,896 erscheint als 89 %, 0,796 als 79 %, glatte Werte bleiben', () => {
    assert.equal(prozent(0.896), '89 %');
    assert.equal(prozent(0.796), '79 %');
    assert.equal(prozent(0.29), '29 %');
    assert.equal(prozent(0.57), '57 %');
    assert.equal(prozent(0.95), '95 %');
    assert.equal(prozent(1), '100 %');
    assert.equal(prozent(0), '0 %');
  });
  test('die Gründe nennen die abgerundeten Werte', () => {
    const l = {
      id: 'A', hatFoto: true, ocrText: 'ACHTUNG! Hochspannung. Nicht öffnen.', ocrKonfidenz: 0.796,
      sprachen: ['de'], konfidenzJeSprache: { de: 0.896 }, sprachKonfidenz: 0.896, nachgebessert: false,
    };
    const texte = bewerteAnlage([l]).get('A')!.gruende.map((g) => g.text).join(' ');
    assert.match(texte, /Texterkennung 79 %/);
    assert.match(texte, /Deutsch 89 %/);
    assert.doesNotMatch(texte, /80 %|90 %/);
  });
});

describe('Datenbank-Stand', () => {
  let ordner: string;
  before(() => {
    ordner = mkdtempSync(join(tmpdir(), 'pruefsystem-db-'));
  });
  after(() => rmSync(ordner, { recursive: true, force: true }));

  test('eine neue Datenbank trägt den aktuellen Stand', () => {
    const { db, ersetzt } = oeffneDatenbankMitStand(join(ordner, 'neu.sqlite'));
    assert.equal(ersetzt, false);
    assert.equal((db.prepare('PRAGMA user_version').get() as any).user_version, SCHEMA_STAND);
    db.close();
  });

  test('eine Datenbank aus Stufe 1 wird erkannt und neu angelegt, beim zweiten Öffnen nicht mehr', () => {
    const pfad = join(ordner, 'alt.sqlite');
    const alt = new DatabaseSync(pfad);
    alt.exec(`CREATE TABLE anlagen (id TEXT PRIMARY KEY, name TEXT NOT NULL, soll_anzahl INTEGER NOT NULL,
      freigegeben_am TEXT, freigegeben_von TEXT);
      INSERT INTO anlagen VALUES ('ALT1', 'Alte Anlage', 1, NULL, NULL);`);
    alt.close();

    const erst = oeffneDatenbankMitStand(pfad);
    assert.equal(erst.ersetzt, true);
    assert.equal((erst.db.prepare('SELECT COUNT(*) AS n FROM anlagen').get() as any).n, 0, 'alte Daten verworfen');
    const spalten = (erst.db.prepare('PRAGMA table_info(labels)').all() as { name: string }[]).map((c) => c.name);
    assert.ok(spalten.includes('korrektur_bild_pfad') && spalten.includes('nacherfassung_bild_pfad'));
    erst.db.close();

    const zweit = oeffneDatenbankMitStand(pfad);
    assert.equal(zweit.ersetzt, false);
    zweit.db.close();
  });
});

describe('Auslieferung der gebauten Oberfläche', () => {
  let dist: string;
  let s: TestServer;
  before(async () => {
    dist = mkdtempSync(join(tmpdir(), 'pruefsystem-dist-'));
    mkdirSync(join(dist, 'assets'));
    writeFileSync(join(dist, 'index.html'), '<!doctype html><title>Label-Prüfung</title><script type="module" src="/assets/app-1a2b.js"></script>');
    writeFileSync(join(dist, 'assets', 'app-1a2b.js'), 'console.log(1)');
    writeFileSync(join(dist, 'assets', 'app-1a2b.js.map'), '{}');
    writeFileSync(join(dist, 'assets', 'stil-3c4d.css'), 'body{}');
    writeFileSync(join(dist, '.versteckt.html'), 'geheim');
    writeFileSync(join(dist, 'notiz.txt'), 'nicht ausliefern');
    const server = erstelleServer({ db: await neueDatenbank(), bilderOrdner: BILDER, oberflaecheOrdner: dist });
    await new Promise<void>((fertig) => server.listen(0, '127.0.0.1', fertig));
    const { port } = server.address() as AddressInfo;
    s = { url: `http://127.0.0.1:${port}`, schliessen: () => new Promise((fertig) => server.close(() => fertig())) };
  });
  after(async () => {
    await s.schliessen();
    rmSync(dist, { recursive: true, force: true });
  });

  test('/ liefert index.html mit CSP und Schutz-Kopfzeilen', async () => {
    const { status, kopf, text } = await anfrage(s, '/');
    assert.equal(status, 200);
    assert.match(text, /Label-Prüfung/);
    assert.equal(kopf.get('content-type'), 'text/html; charset=utf-8');
    assert.equal(kopf.get('content-security-policy'), CSP_OBERFLAECHE);
    assert.match(CSP_OBERFLAECHE, /default-src 'self'/);
    assert.match(CSP_OBERFLAECHE, /script-src 'self'(;|$)/);
    assert.match(CSP_OBERFLAECHE, /frame-ancestors 'none'/);
    assert.doesNotMatch(CSP_OBERFLAECHE, /unsafe/);
    assert.equal(kopf.get('x-frame-options'), 'DENY');
    assert.equal(kopf.get('referrer-policy'), 'no-referrer');
    assert.equal(kopf.get('x-content-type-options'), 'nosniff');
    assert.equal(kopf.get('cache-control'), 'no-cache');
    for (const [name] of kopf) assert.ok(!name.startsWith('access-control-'), name);
  });

  test('Dateien unter /assets/ mit langer Cache-Dauer und passendem Typ', async () => {
    const js = await anfrage(s, '/assets/app-1a2b.js');
    assert.equal(js.status, 200);
    assert.equal(js.kopf.get('content-type'), 'text/javascript; charset=utf-8');
    assert.match(js.kopf.get('cache-control') ?? '', /max-age=31536000/);
    assert.equal(js.kopf.get('x-content-type-options'), 'nosniff');
    assert.equal((await anfrage(s, '/assets/stil-3c4d.css')).kopf.get('content-type'), 'text/css; charset=utf-8');
  });

  test('nichts anderes: Quellkarten, versteckte Dateien, fremde Endungen, Projektdateien, Pfadausbrüche', async () => {
    for (const pfad of [
      '/assets/app-1a2b.js.map', '/.versteckt.html', '/notiz.txt', '/package.json', '/dist/index.html',
      '/testdaten/erwartung.json', '/testdaten/labels.json', '/src/server/app.ts', '/assets/../../package.json',
      '/assets/%2e%2e/%2e%2e/package.json', '/unbekannt', '/anlage/STA4', '/index.html/',
    ]) {
      assert.equal((await anfrage(s, pfad)).status, 404, pfad);
    }
  });

  test('nur GET; fremder Host 421', async () => {
    assert.equal((await anfrage(s, '/', { methode: 'POST', rolle: 'max' })).status, 404);
    const status = await new Promise<number>((fertig, fehler) => {
      const url = new URL(s.url);
      const req = request({ host: url.hostname, port: url.port, path: '/', headers: { Host: 'evil.example' } }, (res) => {
        res.resume();
        fertig(res.statusCode ?? 0);
      });
      req.on('error', fehler);
      req.end();
    });
    assert.equal(status, 421);
  });

  test('ohne gebaute Oberfläche sagt / , wie man startet', async () => {
    const server = await starteServer(await neueDatenbank());
    try {
      const { status, daten } = await anfrage(server, '/');
      assert.equal(status, 404);
      assert.match(daten.fehler, /npm start/);
    } finally {
      await server.schliessen();
    }
  });
});

describe('Handler im Entwicklungsserver', () => {
  test('reicht fremde Pfade unbesehen weiter, bearbeitet /api/ und /bilder/ selbst (mit Host-Prüfung)', async () => {
    const handler = erstelleHandler({ db: await neueDatenbank(), bilderOrdner: BILDER });
    const weitergereicht: string[] = [];
    const { createServer } = await import('node:http');
    const server = createServer((req, res) =>
      void handler(req, res, () => {
        weitergereicht.push(req.url ?? '');
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('vite');
      }),
    );
    await new Promise<void>((fertig) => server.listen(0, '127.0.0.1', fertig));
    const { port } = server.address() as AddressInfo;
    const s = { url: `http://127.0.0.1:${port}`, schliessen: async () => {} };
    try {
      assert.equal((await anfrage(s, '/')).text, 'vite');
      assert.equal((await anfrage(s, '/src/main.tsx')).text, 'vite');
      assert.equal((await anfrage(s, '/api/anlagen')).status, 200);
      assert.equal((await anfrage(s, '/api/gibt-es-nicht')).status, 404);
      assert.equal((await anfrage(s, '/bilder/STA4-01.svg')).status, 200);
      assert.equal((await anfrage(s, '/api/labels/STA4-01/bestaetigen', { methode: 'POST' })).status, 403);
      assert.deepEqual(weitergereicht, ['/', '/src/main.tsx']);
      const status = await new Promise<number>((fertig, fehler) => {
        const req = request({ host: '127.0.0.1', port, path: '/api/anlagen', headers: { Host: 'evil.example' } }, (res) => {
          res.resume();
          fertig(res.statusCode ?? 0);
        });
        req.on('error', fehler);
        req.end();
      });
      assert.equal(status, 421);
    } finally {
      await new Promise((fertig) => server.close(fertig));
    }
  });
});
