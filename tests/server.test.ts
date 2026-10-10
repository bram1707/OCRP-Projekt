// Server-Endpunkte: Rollen, Einzelaktionen, Freigabe, keine Erwartungswerte in den Antworten.

import assert from 'node:assert/strict';
import { request } from 'node:http';
import { after, before, describe, test } from 'node:test';
import { anfrage, erwartungen, neueDatenbank, starteServer, type TestServer } from './hilfen.ts';

let server: TestServer;

before(async () => {
  server = await starteServer(await neueDatenbank());
});
after(async () => {
  await server.schliessen();
});

describe('lesende Endpunkte', () => {
  test('GET /api/anlagen: drei Anlagen, nur Förderband 2 freigegeben', async () => {
    const { status, daten } = await anfrage(server, '/api/anlagen');
    assert.equal(status, 200);
    const nachId = Object.fromEntries(daten.map((a: any) => [a.id, a]));
    assert.equal(nachId.FOE2.gesperrt, false);
    assert.equal(nachId.STA4.gesperrt, true);
    assert.equal(nachId.SWR5.gesperrt, true);
    assert.equal(nachId.SWR5.zaehlung.fehlt, 1);
    assert.equal(nachId.STA4.sollAnzahl, 10);
  });

  test('GET /api/anlagen/STA4/labels: Zählzeile und Reihenfolge für Max (AK-17)', async () => {
    const { status, daten } = await anfrage(server, '/api/anlagen/STA4/labels');
    assert.equal(status, 200);
    assert.equal(daten.labels.length, 10);
    assert.deepEqual(
      { auffaellig: daten.anlage.auffaellig, unauffaellig: daten.anlage.unauffaellig, bestaetigt: daten.anlage.bestaetigt },
      { auffaellig: 3, unauffaellig: 6, bestaetigt: 1 },
    );
    assert.deepEqual(daten.labels.slice(0, 3).map((l: any) => l.id), ['STA4-08', 'STA4-09', 'STA4-07']);
  });

  test('GET /api/labels/STA4-09: Sicherheit je Sprache und Hinweis (AK-15, AK-16)', async () => {
    const { daten } = await anfrage(server, '/api/labels/STA4-09');
    assert.equal(daten.status, 'unsicher');
    assert.equal(daten.statusText, 'Unsicher');
    assert.match(daten.hinweis, /Sprache nicht sicher erkannt/);
    const de = daten.sprachen.find((s: any) => s.code === 'de');
    assert.deepEqual(de, { code: 'de', name: 'Deutsch', konfidenz: 0.95, sicher: true });
    assert.ok(daten.sprachen.some((s: any) => s.sicher === false));
    assert.ok(daten.belege.length > 0, 'Belege für „Warum?“');
    assert.equal(daten.bildUrl, '/bilder/STA4-09.svg');
  });

  test('keine Antwort enthält Erwartungswerte oder Korrekturdaten (AK-61)', async () => {
    const verboten = new Set(['erwartung', 'lesbar', 'notiz', 'tatsaechlich', 'korrektur', 'nachKorrektur', 'ausgangszustand']);
    const notizen = Object.values(erwartungen()).flatMap((e) => (e.notiz ? [e.notiz] : []));
    const schluessel = (wert: unknown): string[] =>
      Array.isArray(wert)
        ? wert.flatMap(schluessel)
        : wert && typeof wert === 'object'
          ? Object.entries(wert).flatMap(([k, v]) => [k, ...schluessel(v)])
          : [];
    const pfade = ['/api/anlagen', '/api/anlagen/STA4/labels', '/api/anlagen/SWR5/labels', '/api/labels/SWR5-02', '/api/anlagen/STA4/zusammenfassung'];
    for (const pfad of pfade) {
      const { daten, text } = await anfrage(server, pfad);
      for (const k of schluessel(daten)) assert.ok(!verboten.has(k), `${pfad} hat Feld ${k}`);
      for (const n of notizen) assert.ok(!text.includes(n), `${pfad} enthält eine Notiz aus den Erwartungswerten`);
    }
    // SWR5-02 hat Korrekturdaten mit OCR 0.97; vor der Nachbesserung dürfen sie nicht sichtbar sein.
    assert.ok(!(await anfrage(server, '/api/labels/SWR5-02')).text.includes('0.97'));
  });

  test('unbekannte Anlage, unbekanntes Label, unbekannte Adresse: 404', async () => {
    assert.equal((await anfrage(server, '/api/anlagen/XYZ/labels')).status, 404);
    assert.equal((await anfrage(server, '/api/labels/XYZ-1')).status, 404);
    assert.equal((await anfrage(server, '/api/irgendwas')).status, 404);
  });
});

describe('schreibende Endpunkte', () => {
  test('ohne Rolle oder als Marie: 403, nichts ändert sich (AK-46 vorbereitet)', async () => {
    for (const rolle of [undefined, 'marie', 'admin']) {
      const { status } = await anfrage(server, '/api/labels/STA4-01/bestaetigen', { methode: 'POST', rolle });
      assert.equal(status, 403, String(rolle));
    }
    const freigabe = await anfrage(server, '/api/anlagen/STA4/freigeben', { methode: 'POST', rolle: 'marie' });
    assert.equal(freigabe.status, 403);
    assert.equal((await anfrage(server, '/api/labels/STA4-01')).daten.status, 'offen');
  });

  test('AK-11 es gibt keinen Endpunkt für mehrere Labels', async () => {
    for (const pfad of ['/api/labels/bestaetigen', '/api/anlagen/STA4/bestaetigen', '/api/anlagen/STA4/alle-bestaetigen']) {
      assert.equal((await anfrage(server, pfad, { methode: 'POST', rolle: 'max' })).status, 404, pfad);
    }
  });

  test('Fehler melden: Grund fehlt, falsches JSON, zu große Anfrage', async () => {
    const pfad = '/api/labels/STA4-06/fehler';
    assert.equal((await anfrage(server, pfad, { methode: 'POST', rolle: 'max', koerper: '{}' })).status, 400);
    assert.equal((await anfrage(server, pfad, { methode: 'POST', rolle: 'max', koerper: '{kaputt' })).status, 400);
    const gross = JSON.stringify({ grund: 'beschaedigt', fuell: 'x'.repeat(20_000) });
    assert.equal((await anfrage(server, pfad, { methode: 'POST', rolle: 'max', koerper: gross })).status, 413);
    assert.equal((await anfrage(server, '/api/labels/STA4-06')).daten.status, 'offen');
  });

  test('Freigabe vorher: 409 mit offenen Punkten', async () => {
    const { status, daten } = await anfrage(server, '/api/anlagen/STA4/freigeben', { methode: 'POST', rolle: 'max' });
    assert.equal(status, 409);
    assert.ok(daten.details.length > 0);
    assert.match(daten.fehler, /noch nicht freigegeben/);
  });

  test('Ablauf Stanzanlage 4: melden, nachbessern, alle einzeln bestätigen, freigeben', async () => {
    const post = (pfad: string, koerper?: string) => anfrage(server, pfad, { methode: 'POST', rolle: 'max', koerper });

    const gemeldet = await post('/api/labels/STA4-04/fehler', JSON.stringify({ grund: 'unleserlich' }));
    assert.equal(gemeldet.status, 200);
    assert.equal(gemeldet.daten.status, 'fehlerhaft');
    assert.equal(gemeldet.daten.letzterFehlergrundText, 'Unleserlich');
    assert.equal((await post('/api/labels/STA4-04/bestaetigen')).status, 409);

    const zurueck = await post('/api/labels/STA4-04/nachbessern');
    assert.equal(zurueck.daten.status, 'nachgebessert');
    assert.ok(zurueck.daten.gruende.some((g: any) => g.code === 'nachgebessert'));

    const liste = (await anfrage(server, '/api/anlagen/STA4/labels')).daten.labels;
    for (const l of liste.filter((l: any) => ['offen', 'unsicher', 'nachgebessert'].includes(l.status))) {
      assert.equal((await post(`/api/labels/${l.id}/bestaetigen`)).status, 200, l.id);
    }

    const z = (await anfrage(server, '/api/anlagen/STA4/zusammenfassung')).daten;
    assert.equal(z.freigabeMoeglich, true);
    assert.equal(z.nachgebessert, 1);
    assert.deepEqual(z.offenePunkte, []);

    const frei = await post('/api/anlagen/STA4/freigeben');
    assert.equal(frei.status, 200);
    assert.equal(frei.daten.gesperrt, false);
    assert.equal(frei.daten.freigegebenVon, 'max');
  });
});

describe('Korrekturrunde 1', () => {
  test('R1: Fehlerhaft und Fehlt stehen getrennt, nicht in Max\' Liste', async () => {
    const { daten } = await anfrage(server, '/api/anlagen/SWR5/labels');
    assert.deepEqual(daten.labels.map((l: any) => l.id), ['SWR5-03', 'SWR5-01', 'SWR5-04']);
    assert.deepEqual(daten.ausserhalbDerPruefung.map((l: any) => `${l.id}:${l.status}`), ['SWR5-02:fehlerhaft', 'SWR5-05:fehlt']);
  });

  test('R2: Zählzeile zählt nur, was Max prüfen kann', async () => {
    const { anlage } = (await anfrage(server, '/api/anlagen/SWR5/labels')).daten;
    assert.deepEqual(
      { auffaellig: anlage.auffaellig, unauffaellig: anlage.unauffaellig, bestaetigt: anlage.bestaetigt },
      { auffaellig: 1, unauffaellig: 1, bestaetigt: 1 },
    );
    assert.equal(anlage.zaehlung.fehlerhaft, 1, 'in Nachbesserung');
    assert.equal(anlage.zaehlung.fehlt, 1, 'nicht erfasst');
  });

  test('R4: jeder schreibende Aufruf verlangt die Rolle max', async () => {
    const schreibend = [
      ['/api/labels/SWR5-01/bestaetigen', undefined],
      ['/api/labels/SWR5-01/fehler', JSON.stringify({ grund: 'beschaedigt' })],
      ['/api/labels/SWR5-02/nachbessern', undefined],
      ['/api/anlagen/SWR5/freigeben', undefined],
    ] as const;
    for (const [pfad, koerper] of schreibend) {
      for (const rolle of [undefined, 'marie', 'admin', 'MAX', 'max,marie']) {
        const { status } = await anfrage(server, pfad, { methode: 'POST', rolle, koerper });
        assert.equal(status, 403, `${pfad} als ${String(rolle)}`);
      }
    }
    assert.equal((await anfrage(server, '/api/labels/SWR5-01')).daten.status, 'offen');
    assert.equal((await anfrage(server, '/api/labels/SWR5-02')).daten.status, 'fehlerhaft');
  });

  test('R4: lesende Aufrufe und andere Methoden ändern nichts', async () => {
    const db = await neueDatenbank();
    const eigener = await starteServer(db);
    const abzug = () => JSON.stringify(['anlagen', 'labels', 'entscheidungen'].map((t) => db.prepare(`SELECT * FROM ${t}`).all()));
    try {
      const vorher = abzug();
      const ids = (await anfrage(eigener, '/api/anlagen')).daten.map((a: any) => a.id);
      for (const id of ids) {
        await anfrage(eigener, `/api/anlagen/${id}/labels`, { rolle: 'max' });
        await anfrage(eigener, `/api/anlagen/${id}/zusammenfassung`, { rolle: 'max' });
      }
      await anfrage(eigener, '/api/labels/SWR5-01', { rolle: 'max' });
      for (const methode of ['PUT', 'PATCH', 'DELETE']) {
        const res = await fetch(`${eigener.url}/api/labels/SWR5-01/bestaetigen`, { method: methode, headers: { 'X-Rolle': 'max' } });
        assert.notEqual(res.status, 200, methode);
      }
      assert.equal(abzug(), vorher);
    } finally {
      await eigener.schliessen();
    }
  });

  const mitHost = (host: string, pfad = '/api/anlagen', methode = 'GET', rolle?: string) =>
    new Promise<number>((fertig, fehler) => {
      const url = new URL(server.url);
      const headers: Record<string, string> = { Host: host };
      if (rolle) headers['X-Rolle'] = rolle;
      const req = request({ host: url.hostname, port: url.port, path: pfad, method: methode, headers }, (res) => {
        res.resume();
        fertig(res.statusCode ?? 0);
      });
      req.on('error', fehler);
      req.end();
    });

  test('R5: fremder Host-Kopf wird abgewiesen (DNS-Rebinding)', async () => {
    assert.equal(await mitHost('evil.example'), 421);
    assert.equal(await mitHost('evil.example:3000'), 421);
    assert.equal(await mitHost('127.0.0.1.evil.example'), 421);
    assert.equal(await mitHost('localhost:5173'), 200);
    assert.equal(await mitHost('127.0.0.1'), 200);
  });

  test('R5: die Host-Prüfung gilt auch für Bilder und schreibende Aufrufe', async () => {
    assert.equal(await mitHost('evil.example', '/bilder/STA4-01.svg'), 421);
    assert.equal(await mitHost('evil.example', '/api/labels/SWR5-01/bestaetigen', 'POST', 'max'), 421);
    assert.equal((await anfrage(server, '/api/labels/SWR5-01')).daten.status, 'offen');
  });
});

describe('Bilder', () => {
  test('Platzhalterbild wird als SVG ohne Skriptrechte ausgeliefert', async () => {
    const { status, kopf, text } = await anfrage(server, '/bilder/STA4-01.svg');
    assert.equal(status, 200);
    assert.equal(kopf.get('content-type'), 'image/svg+xml');
    assert.match(kopf.get('content-security-policy') ?? '', /default-src 'none'/);
    assert.ok(text.startsWith('<svg'));
  });
  test('kein Zugriff außerhalb des Bilderordners', async () => {
    for (const pfad of ['/bilder/..%2Fanlagen.json', '/bilder/%2e%2e%2ferwartung.json', '/bilder/STA4-01.json', '/bilder/']) {
      assert.equal((await anfrage(server, pfad)).status, 404, pfad);
    }
  });
});

describe('P5: gemeldetes Label über die Schnittstelle', () => {
  test('ein während der Prüfung gemeldetes Label verlässt Max\' Liste und steht in „ausserhalbDerPruefung“', async () => {
    const eigener = await starteServer(await neueDatenbank());
    try {
      const vorher = await anfrage(eigener, '/api/anlagen/STA4/labels');
      assert.ok(vorher.daten.labels.some((l: { id: string }) => l.id === 'STA4-02'));
      const meldung = await anfrage(eigener, '/api/labels/STA4-02/fehler', {
        methode: 'POST', rolle: 'max', koerper: JSON.stringify({ grund: 'beschaedigt' }),
      });
      assert.equal(meldung.status, 200);
      const nachher = await anfrage(eigener, '/api/anlagen/STA4/labels');
      assert.ok(!nachher.daten.labels.some((l: { id: string }) => l.id === 'STA4-02'), 'nicht mehr in Max\' Liste');
      const ausserhalb = nachher.daten.ausserhalbDerPruefung.find((l: { id: string }) => l.id === 'STA4-02');
      assert.equal(ausserhalb?.status, 'fehlerhaft');
      assert.equal(ausserhalb?.letzterFehlergrundText, 'Label beschädigt');
    } finally {
      await eigener.schliessen();
    }
  });
});
