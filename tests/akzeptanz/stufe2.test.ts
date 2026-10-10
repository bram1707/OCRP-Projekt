// Eigene Akzeptanztests des Test-Agents für Stufe 2 (Server-Seite der Prüfoberfläche):
// Zurücknehmen (F5), Foto nachreichen (F4), Max' Liste ohne Fehlerhaft/Fehlt (H2) und Sperre.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { basisDb, ruf, server, type Srv } from './hilfe.ts';

async function mitServer(f: (s: Srv, db: Awaited<ReturnType<typeof basisDb>>) => Promise<void>): Promise<void> {
  const db = await basisDb();
  const s = await server(db);
  try { await f(s, db); } finally { await s.zu(); }
}
const status = async (s: Srv, id: string) => (await ruf(s, `/api/labels/${id}`)).daten.status;
const bestaetige = (s: Srv, id: string) => ruf(s, `/api/labels/${id}/bestaetigen`, { methode: 'POST', rolle: 'max' });
const zurueck = (s: Srv, id: string, rolle = 'max') => ruf(s, `/api/labels/${id}/zuruecknehmen`, { methode: 'POST', rolle });
const protokoll = (db: any, id: string) =>
  db.prepare('SELECT wer, wann, ergebnis, grund FROM entscheidungen WHERE label_id = ? ORDER BY id').all(id) as any[];

describe('H2, AK-12, AK-13: Max\' Liste', () => {
  test('GET /labels enthält kein Fehlerhaft und kein Fehlt; beide stehen getrennt', () => mitServer(async (s) => {
    for (const a of ['STA4', 'SWR5', 'FOE2']) {
      const d = (await ruf(s, `/api/anlagen/${a}/labels`)).daten;
      assert.ok(d.labels.every((l: any) => !['fehlerhaft', 'fehlt'].includes(l.status)), a);
      assert.ok(d.ausserhalbDerPruefung.every((l: any) => ['fehlerhaft', 'fehlt'].includes(l.status)), a);
    }
    const swr = (await ruf(s, '/api/anlagen/SWR5/labels')).daten;
    assert.deepEqual(swr.ausserhalbDerPruefung.map((l: any) => l.id).sort(), ['SWR5-02', 'SWR5-05']);
  }));

  test('während der Prüfung gemeldet → verlässt die Liste, nach Nachbesserung zurück und vorn', () => mitServer(async (s) => {
    assert.equal((await ruf(s, '/api/labels/STA4-02/fehler', { methode: 'POST', rolle: 'max', koerper: { grund: 'beschaedigt' } })).status, 200);
    let d = (await ruf(s, '/api/anlagen/STA4/labels')).daten;
    assert.ok(!d.labels.some((l: any) => l.id === 'STA4-02'));
    assert.ok(d.ausserhalbDerPruefung.some((l: any) => l.id === 'STA4-02'));
    assert.equal((await ruf(s, '/api/labels/STA4-02/nachbessern', { methode: 'POST', rolle: 'max' })).status, 200);
    d = (await ruf(s, '/api/anlagen/STA4/labels')).daten;
    assert.equal(d.labels[0].id, 'STA4-02');
    assert.equal(d.labels[0].status, 'nachgebessert');
    assert.ok(d.labels[0].letzterFehlergrundText, 'Max\' Meldung bleibt sichtbar');
  }));
});

describe('F5 Zurücknehmen (AK-01, AK-02, AK-10, AK-22, AK-46)', () => {
  test('Marie, ohne Rolle oder fremde Rolle → 403, Status bleibt „Bestätigt“', () => mitServer(async (s) => {
    for (const rolle of ['marie', '', 'MAX', 'admin']) {
      assert.equal((await zurueck(s, 'STA4-10', rolle)).status, 403, `Rolle „${rolle}“`);
    }
    assert.equal(await status(s, 'STA4-10'), 'bestaetigt');
  }));

  test('nur bestätigte Labels: Offen, Unsicher, Fehlerhaft, Fehlt → 409, unverändert', () => mitServer(async (s) => {
    for (const [id, st] of [['STA4-01', 'offen'], ['STA4-09', 'unsicher'], ['SWR5-02', 'fehlerhaft'], ['SWR5-05', 'fehlt'], ['SWR5-03', 'nachgebessert']]) {
      assert.equal((await zurueck(s, id!)).status, 409, id);
      assert.equal(await status(s, id!), st, id);
    }
  }));

  test('Status von vorher: Unsicher bleibt Unsicher, Nachgebessert bleibt Nachgebessert, Offen bleibt Offen', () => mitServer(async (s) => {
    for (const [id, vorher] of [['STA4-09', 'unsicher'], ['SWR5-03', 'nachgebessert'], ['STA4-01', 'offen'], ['STA4-08', 'unsicher']]) {
      assert.equal((await bestaetige(s, id!)).status, 200, id);
      assert.equal((await zurueck(s, id!)).status, 200, id);
      assert.equal(await status(s, id!), vorher, id);
    }
    const l = (await ruf(s, '/api/labels/SWR5-03')).daten;
    assert.ok(l.letzterFehlergrundText, 'Fehlerhinweis bleibt nach dem Zurücknehmen');
  }));

  test('Zurücknehmen nach der Freigabe → 409, Anlage bleibt freigegeben', () => mitServer(async (s) => {
    assert.equal((await zurueck(s, 'FOE2-01')).status, 409);
    assert.equal(await status(s, 'FOE2-01'), 'bestaetigt');
    const a = (await ruf(s, '/api/anlagen')).daten.find((x: any) => x.id === 'FOE2');
    assert.equal(a.gesperrt, false);
  }));

  test('alle bestätigt, eines zurückgenommen → wieder gesperrt, Freigabe 409; erneut bestätigt → 200', () => mitServer(async (s) => {
    const ids = (await ruf(s, '/api/anlagen/STA4/labels')).daten.labels.filter((l: any) => l.status !== 'bestaetigt').map((l: any) => l.id);
    for (const id of ids) assert.equal((await bestaetige(s, id)).status, 200, id);
    let zf = (await ruf(s, '/api/anlagen/STA4/zusammenfassung')).daten;
    assert.equal(zf.offenePunkte.length, 0);
    assert.equal((await zurueck(s, 'STA4-05')).status, 200);
    zf = (await ruf(s, '/api/anlagen/STA4/zusammenfassung')).daten;
    assert.ok(zf.offenePunkte.length > 0);
    const frei = await ruf(s, '/api/anlagen/STA4/freigeben', { methode: 'POST', rolle: 'max' });
    assert.equal(frei.status, 409);
    assert.ok(Array.isArray(frei.daten.details) && frei.daten.details.some((d: any) => /STA4-05/.test(d.text)), 'Grund nennt STA4-05');
    assert.equal((await bestaetige(s, 'STA4-05')).status, 200);
    assert.equal((await ruf(s, '/api/anlagen/STA4/freigeben', { methode: 'POST', rolle: 'max' })).status, 200);
  }));

  test('AK-22: Zurücknehmen schreibt einen Eintrag mit wer, wann, Ergebnis', () => mitServer(async (s, db) => {
    await bestaetige(s, 'STA4-01');
    await zurueck(s, 'STA4-01');
    const p = protokoll(db, 'STA4-01');
    assert.deepEqual(p.map((e) => e.ergebnis), ['bestaetigt', 'zurueckgenommen']);
    assert.equal(p[1].wer, 'max');
    assert.ok(!Number.isNaN(Date.parse(p[1].wann)));
  }));

  test('AK-11: kein Sammel-Zurücknehmen', () => mitServer(async (s) => {
    await bestaetige(s, 'STA4-01');
    await bestaetige(s, 'STA4-02');
    for (const pfad of ['/api/labels/STA4-01,STA4-02/zuruecknehmen', '/api/anlagen/STA4/zuruecknehmen', '/api/labels/*/zuruecknehmen', '/api/labels/zuruecknehmen']) {
      assert.notEqual((await ruf(s, pfad, { methode: 'POST', rolle: 'max' })).status, 200, pfad);
    }
    const r = await ruf(s, '/api/labels/STA4-01/zuruecknehmen', { methode: 'POST', rolle: 'max', koerper: { ids: ['STA4-02', 'STA4-10'] } });
    assert.equal(r.status, 200);
    assert.equal(await status(s, 'STA4-02'), 'bestaetigt');
    assert.equal(await status(s, 'STA4-10'), 'bestaetigt');
  }));
});

describe('F4 Foto nachreichen (AK-45, AK-46, AK-61)', () => {
  test('Marie oder ohne Rolle → 403, Label bleibt „Fehlt“', () => mitServer(async (s) => {
    for (const rolle of ['marie', '']) {
      assert.equal((await ruf(s, '/api/labels/SWR5-05/nacherfassen', { methode: 'POST', rolle })).status, 403);
    }
    assert.equal(await status(s, 'SWR5-05'), 'fehlt');
  }));

  test('nur für Labels ohne Foto; andere → 409', () => mitServer(async (s) => {
    for (const id of ['STA4-01', 'SWR5-02', 'SWR5-03', 'STA4-10']) {
      const vorher = await status(s, id);
      assert.equal((await ruf(s, `/api/labels/${id}/nacherfassen`, { methode: 'POST', rolle: 'max' })).status, 409, id);
      assert.equal(await status(s, id), vorher, id);
    }
  }));

  test('Text und Foto kommen nur vom Server, nie aus der Anfrage; zweites Nachreichen → 409', () => mitServer(async (s, db) => {
    const r = await ruf(s, '/api/labels/SWR5-05/nacherfassen', {
      methode: 'POST', rolle: 'max', koerper: { ocrText: 'Hallo', ocrKonfidenz: 1, bild: '../../etc/passwd', status: 'bestaetigt' },
    });
    assert.equal(r.status, 200);
    const l = (await ruf(s, '/api/labels/SWR5-05')).daten;
    assert.match(l.ocrText, /Zutritt für Unbefugte verboten/);
    assert.notEqual(l.status, 'bestaetigt');
    assert.ok(['offen', 'unsicher'].includes(l.status));
    assert.match(l.bildUrl, /^\/bilder\/SWR5-05\.svg$/);
    assert.equal((await ruf(s, l.bildUrl)).status, 200);
    assert.equal((await ruf(s, '/api/labels/SWR5-05/nacherfassen', { methode: 'POST', rolle: 'max' })).status, 409);
    const p = protokoll(db, 'SWR5-05');
    assert.equal(p.at(-1).ergebnis, 'nacherfasst');
  }));

  test('nach dem Nachreichen bleibt die Anlage gesperrt, bis Max das Label bestätigt', () => mitServer(async (s) => {
    await ruf(s, '/api/labels/SWR5-02/nachbessern', { methode: 'POST', rolle: 'max' });
    await ruf(s, '/api/labels/SWR5-05/nacherfassen', { methode: 'POST', rolle: 'max' });
    for (const id of ['SWR5-01', 'SWR5-02', 'SWR5-03']) assert.equal((await bestaetige(s, id)).status, 200, id);
    assert.equal((await ruf(s, '/api/anlagen/SWR5/freigeben', { methode: 'POST', rolle: 'max' })).status, 409);
    assert.equal((await bestaetige(s, 'SWR5-05')).status, 200);
    assert.equal((await ruf(s, '/api/anlagen/SWR5/freigeben', { methode: 'POST', rolle: 'max' })).status, 200);
  }));
});

describe('F4 neues Foto nach der Nachbesserung', () => {
  test('STA4-08-neu.svg erst nach der Nachbesserung abrufbar', () => mitServer(async (s) => {
    assert.equal((await ruf(s, '/bilder/STA4-08-neu.svg')).status, 404);
    await ruf(s, '/api/labels/STA4-08/fehler', { methode: 'POST', rolle: 'max', koerper: { grund: 'unleserlich' } });
    assert.equal((await ruf(s, '/bilder/STA4-08-neu.svg')).status, 404, 'auch im Status „Fehlerhaft“ noch nicht');
    await ruf(s, '/api/labels/STA4-08/nachbessern', { methode: 'POST', rolle: 'max' });
    const l = (await ruf(s, '/api/labels/STA4-08')).daten;
    assert.equal(l.bildUrl, '/bilder/STA4-08-neu.svg');
    assert.equal((await ruf(s, l.bildUrl)).status, 200);
    assert.equal(l.status, 'nachgebessert');
    assert.ok(l.sprachen.every((x: any) => x.sicher), 'neuer Text sicher erkannt');
  }));
});
