// Test-Agent Stufe 1 · AK-10, AK-11, AK-12, AK-13, AK-46

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { holeLabel } from '../../src/db/abfragen.ts';
import { basisDb, ruf, server } from './hilfe.ts';

describe('AK-10 Max bestätigt oder meldet mit einem von drei Gründen, ohne Text zu bearbeiten', () => {
  test('Gründe: nur unleserlich, sprache_falsch, beschaedigt', async () => {
    const db = await basisDb();
    const s = await server(db);
    try {
      for (const k of [undefined, {}, { grund: 'egal' }, { grund: '' }, { grund: ['unleserlich'] }, '[1]', 'kein json']) {
        const r = await ruf(s, '/api/labels/STA4-01/fehler', { methode: 'POST', rolle: 'max', koerper: k });
        assert.equal(r.status, 400, JSON.stringify(k));
      }
      assert.equal(holeLabel(db, 'STA4-01')!.status, 'offen');
      for (const [id, g] of [['STA4-01', 'unleserlich'], ['STA4-02', 'sprache_falsch'], ['STA4-03', 'beschaedigt']]) {
        const r = await ruf(s, `/api/labels/${id}/fehler`, { methode: 'POST', rolle: 'max', koerper: { grund: g } });
        assert.equal(r.status, 200);
        assert.equal(r.daten.status, 'fehlerhaft');
        assert.equal(r.daten.letzterFehlergrund, g);
      }
    } finally { await s.zu(); }
  });

  test('mitgeschickter Text oder Sprachen ändern nichts', async () => {
    const db = await basisDb();
    const s = await server(db);
    try {
      const vorher = holeLabel(db, 'STA4-04')!;
      await ruf(s, '/api/labels/STA4-04/fehler', { methode: 'POST', rolle: 'max',
        koerper: { grund: 'unleserlich', ocrText: 'manipuliert', sprachen: ['en'], status: 'bestaetigt' } });
      const nachher = holeLabel(db, 'STA4-04')!;
      assert.equal(nachher.ocrText, vorher.ocrText);
      assert.deepEqual(nachher.sprachen, vorher.sprachen);
      assert.equal(nachher.status, 'fehlerhaft');
      for (const m of ['PUT', 'PATCH', 'DELETE']) {
        assert.equal((await ruf(s, '/api/labels/STA4-05', { methode: m, rolle: 'max', koerper: { ocrText: 'x' } })).status, 404, m);
      }
    } finally { await s.zu(); }
  });
});

describe('AK-11 keine Sammelaktion', () => {
  test('Versuche, mehrere Labels auf einmal zu bestätigen, ändern nichts', async () => {
    const db = await basisDb();
    const s = await server(db);
    try {
      const versuche: [string, unknown?][] = [
        ['/api/anlagen/STA4/bestaetigen'], ['/api/anlagen/STA4/labels/bestaetigen'], ['/api/labels/bestaetigen', { ids: ['STA4-01', 'STA4-02'] }],
        ['/api/labels/STA4-01,STA4-02/bestaetigen'], ['/api/labels/STA4-*/bestaetigen'], ['/api/bestaetigen'], ['/api/anlagen/STA4/alle-bestaetigen'],
      ];
      for (const [pfad, k] of versuche) {
        const r = await ruf(s, pfad, { methode: 'POST', rolle: 'max', koerper: k });
        assert.notEqual(r.status, 200, pfad);
      }
      const r = await ruf(s, '/api/labels/STA4-01/bestaetigen', { methode: 'POST', rolle: 'max', koerper: { ids: ['STA4-02', 'STA4-03'] } });
      assert.equal(r.status, 200);
      const labels = (await ruf(s, '/api/anlagen/STA4/labels')).daten.labels;
      const bestaetigt = labels.filter((l: any) => l.status === 'bestaetigt').map((l: any) => l.id).sort();
      assert.deepEqual(bestaetigt, ['STA4-01', 'STA4-10']);
    } finally { await s.zu(); }
  });

  test('zweimal bestätigen → zweites Mal 409', async () => {
    const s = await server(await basisDb());
    try {
      assert.equal((await ruf(s, '/api/labels/STA4-01/bestaetigen', { methode: 'POST', rolle: 'max' })).status, 200);
      assert.equal((await ruf(s, '/api/labels/STA4-01/bestaetigen', { methode: 'POST', rolle: 'max' })).status, 409);
    } finally { await s.zu(); }
  });
});

describe('AK-12 Rückweg: gemeldet → fehlerhaft → nachgebessert → bestätigt', () => {
  test('über die Schnittstelle, mit Fortschritt und bleibendem Fehlerhinweis', async () => {
    const s = await server(await basisDb());
    try {
      const zaehl = async () => (await ruf(s, '/api/anlagen/STA4/labels')).daten.anlage.zaehlung;
      assert.equal((await zaehl()).bestaetigt, 1);
      const m = await ruf(s, '/api/labels/STA4-05/fehler', { methode: 'POST', rolle: 'max', koerper: { grund: 'sprache_falsch' } });
      assert.equal(m.daten.status, 'fehlerhaft');
      assert.equal(m.daten.statusText, 'Fehlerhaft');
      // fehlerhaft: Max kann es nicht prüfen, bis es nachgebessert ist
      assert.equal((await ruf(s, '/api/labels/STA4-05/bestaetigen', { methode: 'POST', rolle: 'max' })).status, 409);
      assert.equal((await zaehl()).fehlerhaft, 1);
      const n = await ruf(s, '/api/labels/STA4-05/nachbessern', { methode: 'POST', rolle: 'max' });
      assert.equal(n.status, 200);
      assert.equal(n.daten.status, 'nachgebessert');
      assert.equal(n.daten.letzterFehlergrund, 'sprache_falsch', 'Max\' Hinweis bleibt sichtbar');
      assert.equal(n.daten.letzterFehlergrundText, 'Sprache falsch');
      assert.ok(n.daten.auffaellig);
      assert.ok(n.daten.gruende.some((g: any) => g.code === 'nachgebessert'));
      const z = await zaehl();
      assert.equal(z.nachgebessert, 1);
      assert.equal(z.bestaetigt, 1, 'zählt wieder als offen, nicht als geprüft');
      // steht jetzt ganz oben in Max' Liste
      assert.equal((await ruf(s, '/api/anlagen/STA4/labels')).daten.labels[0].id, 'STA4-05');
      const b = await ruf(s, '/api/labels/STA4-05/bestaetigen', { methode: 'POST', rolle: 'max' });
      assert.equal(b.daten.status, 'bestaetigt');
      assert.equal((await zaehl()).bestaetigt, 2);
    } finally { await s.zu(); }
  });

  test('nachgebessertes Label kann erneut gemeldet werden (zweite Runde)', async () => {
    const s = await server(await basisDb());
    try {
      const r = await ruf(s, '/api/labels/SWR5-03/fehler', { methode: 'POST', rolle: 'max', koerper: { grund: 'beschaedigt' } });
      assert.equal(r.daten.status, 'fehlerhaft');
      const n = await ruf(s, '/api/labels/SWR5-03/nachbessern', { methode: 'POST', rolle: 'max' });
      assert.equal(n.daten.status, 'nachgebessert');
    } finally { await s.zu(); }
  });

  test('nachbessern geht nur bei fehlerhaft', async () => {
    const s = await server(await basisDb());
    try {
      for (const id of ['STA4-01', 'STA4-10', 'SWR5-03', 'SWR5-05']) {
        assert.equal((await ruf(s, `/api/labels/${id}/nachbessern`, { methode: 'POST', rolle: 'max' })).status, 409, id);
      }
    } finally { await s.zu(); }
  });
});

describe('AK-13 Reihenfolge nach Relevanz', () => {
  test('SWR5: Nachgebessert zuerst, dann offene, Erledigtes am Ende; Fehlerhaftes nicht in der Liste', async () => {
    const s = await server(await basisDb());
    try {
      const l = (await ruf(s, '/api/anlagen/SWR5/labels')).daten.labels.map((x: any) => x.status);
      assert.ok(!l.includes('fehlerhaft') && !l.includes('fehlt'), 'Fehlerhaft und Fehlt nicht in Max\' Liste');
      assert.equal(l[0], 'nachgebessert');
      const rang = { nachgebessert: 0, unsicher: 1, offen: 2 } as Record<string, number>;
      const pruefbar = l.filter((x: string) => x in rang);
      assert.deepEqual(pruefbar, [...pruefbar].sort((a: string, b: string) => rang[a]! - rang[b]!));
      const letzterPruefbarer = l.findLastIndex((x: string) => x in rang);
      assert.ok(l.slice(0, letzterPruefbarer + 1).every((x: string) => x in rang), 'Erledigtes nach Prüfbarem');
    } finally { await s.zu(); }
  });

  test('STA4: unsichere zuerst, dann das auffällige offene, dann die unauffälligen', async () => {
    const s = await server(await basisDb());
    try {
      const l = (await ruf(s, '/api/anlagen/STA4/labels')).daten.labels;
      assert.deepEqual(l.slice(0, 2).map((x: any) => x.status), ['unsicher', 'unsicher']);
      assert.equal(l[2].id, 'STA4-07');
      assert.equal(l[2].prioritaet, 'genau_pruefen');
      assert.ok(l.slice(3, 9).every((x: any) => x.status === 'offen' && !x.auffaellig));
      assert.equal(l[9].status, 'bestaetigt');
    } finally { await s.zu(); }
  });
});

describe('AK-46 Marie kann über die Schnittstelle nichts ändern', () => {
  const schreibend: [string, unknown?][] = [
    ['/api/labels/STA4-01/bestaetigen'], ['/api/labels/STA4-01/fehler', { grund: 'unleserlich' }],
    ['/api/labels/SWR5-02/nachbessern'], ['/api/anlagen/FOE2/freigeben'], ['/api/anlagen/STA4/freigeben'],
  ];
  for (const rolle of ['marie', undefined, 'MAX', 'Max', 'admin', 'max,marie']) {
    test(`Rolle ${JSON.stringify(rolle)}: alle schreibenden Aufrufe 403, Daten unverändert`, async () => {
      const db = await basisDb();
      const s = await server(db);
      try {
        const vorher = JSON.stringify((await ruf(s, '/api/anlagen')).daten);
        for (const [pfad, k] of schreibend) {
          const r = await ruf(s, pfad, { methode: 'POST', rolle, koerper: k });
          assert.equal(r.status, 403, `${pfad} als ${rolle}`);
        }
        assert.equal(JSON.stringify((await ruf(s, '/api/anlagen')).daten), vorher);
      } finally { await s.zu(); }
    });
  }
  test('Marie darf lesen', async () => {
    const s = await server(await basisDb());
    try {
      for (const p of ['/api/anlagen', '/api/anlagen/STA4/labels', '/api/anlagen/STA4/zusammenfassung', '/api/labels/STA4-01']) {
        assert.equal((await ruf(s, p, { rolle: 'marie' })).status, 200, p);
      }
    } finally { await s.zu(); }
  });
});
