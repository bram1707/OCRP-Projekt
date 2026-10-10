// Test-Agent Stufe 1 · Durchlauf als Max über die Schnittstelle (statt Durchklicken, es gibt noch keine Oberfläche)

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { basisDb, ruf, server } from './hilfe.ts';

test('Max prüft Stanzanlage 4 Label für Label bis „Freigegeben“', async () => {
  const s = await server(await basisDb());
  const max = { methode: 'POST', rolle: 'max' };
  try {
    for (let runde = 0; runde < 30; runde++) {
      const { anlage, labels, ausserhalbDerPruefung } = (await ruf(s, '/api/anlagen/STA4/labels')).daten;
      if (anlage.freigabeMoeglich) break;
      const naechstes = labels.find((l: any) => ['nachgebessert', 'unsicher', 'offen'].includes(l.status));
      const fehlerhaft = ausserhalbDerPruefung.find((l: any) => l.status === 'fehlerhaft');
      if (fehlerhaft) {
        assert.equal((await ruf(s, `/api/labels/${fehlerhaft.id}/nachbessern`, max)).status, 200);
      } else if (naechstes.id === 'STA4-08' && naechstes.status === 'unsicher') {
        // Unleserliches Label: Max meldet es, es kommt nachgebessert zurück
        assert.equal((await ruf(s, '/api/labels/STA4-08/fehler', { ...max, koerper: { grund: 'unleserlich' } })).status, 200);
      } else {
        assert.equal((await ruf(s, `/api/labels/${naechstes.id}/bestaetigen`, max)).status, 200, naechstes.id);
      }
      // Bis zur Freigabe bleibt die Anlage gesperrt
      assert.equal((await ruf(s, '/api/anlagen')).daten.find((a: any) => a.id === 'STA4').gesperrt, true);
    }
    const z = (await ruf(s, '/api/anlagen/STA4/zusammenfassung')).daten;
    assert.equal(z.freigabeMoeglich, true);
    assert.deepEqual(z.offenePunkte, []);
    assert.ok(z.nachgebessert >= 1);
    const f = await ruf(s, '/api/anlagen/STA4/freigeben', max);
    assert.equal(f.status, 200);
    assert.equal(f.daten.gesperrt, false);
    assert.equal(f.daten.zaehlung.bestaetigt, 10);
  } finally { await s.zu(); }
});

test('Schweißroboter 5 lässt sich wegen fehlendem Foto nicht freigeben, auch wenn alles andere bestätigt ist', async () => {
  const s = await server(await basisDb());
  const max = { methode: 'POST', rolle: 'max' };
  try {
    await ruf(s, '/api/labels/SWR5-02/nachbessern', max);
    for (const id of ['SWR5-01', 'SWR5-02', 'SWR5-03']) assert.equal((await ruf(s, `/api/labels/${id}/bestaetigen`, max)).status, 200, id);
    const f = await ruf(s, '/api/anlagen/SWR5/freigeben', max);
    assert.equal(f.status, 409);
    assert.match(JSON.stringify(f.daten), /SWR5-05/);
  } finally { await s.zu(); }
});
