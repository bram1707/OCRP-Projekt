// Zusammenfassung vor der Freigabe (AK-02). Sie erscheint nur, wenn der Server keine offenen
// Punkte meldet; ob freigegeben werden darf, entscheidet beim Klick trotzdem der Server.
// Lehnt er ab, zeigt die Übersicht seine Meldung und Gründe oben (Uebersicht.tsx).

import type { Ref } from 'react';
import type { Zusammenfassung as ZusammenfassungDaten } from '../api.ts';
import { KNOPF_HAUPT, KNOPF_NEBEN } from '../rahmen.tsx';

export function Zusammenfassung({
  daten,
  rueckfrage,
  speichert,
  abbrechenRef,
  freigebenRef,
  onFreigeben,
  onBestaetigen,
  onAbbrechen,
}: {
  daten: ZusammenfassungDaten;
  rueckfrage: boolean;
  speichert: boolean;
  abbrechenRef?: Ref<HTMLButtonElement>;
  freigebenRef?: Ref<HTMLButtonElement>;
  onFreigeben: () => void;
  onBestaetigen: () => void;
  onAbbrechen: () => void;
}) {
  const sprachen = daten.sprachen.map((s) => s.name).join(', ') || 'keine sicher erkannt';
  return (
    <section className="mt-6 rounded-xl border border-green-300 border-l-4 border-l-green-600 bg-white shadow-sm p-5" aria-labelledby="zusammenfassung-titel">
      <h2 id="zusammenfassung-titel" className="text-xl font-semibold tracking-tight">
        Zusammenfassung: alle Labels bestätigt
      </h2>
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-6 gap-y-1">
        <dt className="font-semibold">Labels</dt>
        <dd>
          {daten.anzahlLabels} von {daten.sollAnzahl}
        </dd>
        <dt className="font-semibold">Sicher erkannte Sprachen</dt>
        <dd>{sprachen}</dd>
        <dt className="font-semibold">Davon auffällig gewesen</dt>
        <dd>{daten.auffaellig}</dd>
        <dt className="font-semibold">Nachgebessert</dt>
        <dd>{daten.nachgebessert}</dd>
        <dt className="font-semibold">Offene Punkte</dt>
        <dd>{daten.offenePunkte.length === 0 ? 'Keine offenen Punkte' : daten.offenePunkte.map((p) => p.text).join(' ')}</dd>
      </dl>
      {!rueckfrage ? (
        <button ref={freigebenRef} type="button" className={`${KNOPF_HAUPT} mt-5`} disabled={speichert} onClick={onFreigeben}>
          Anlage freigeben
        </button>
      ) : (
        <div role="group" aria-labelledby="rueckfrage-titel" aria-describedby="rueckfrage-text" data-rueckfrage="" className="mt-5 rounded-lg border border-blue-200 border-l-4 border-l-blue-700 bg-blue-50 p-4">
          <h3 id="rueckfrage-titel" className="text-lg font-semibold">
            {daten.name} jetzt freigeben?
          </h3>
          <p id="rueckfrage-text" className="mt-1">
            Danach ist die Anlage entsperrt. Das ist Ihre Entscheidung, nicht die der Erkennung.
          </p>
          <div className="mt-3 flex flex-wrap gap-3">
            <button ref={abbrechenRef} type="button" className={KNOPF_NEBEN} onClick={onAbbrechen}>
              Abbrechen
            </button>
            <button type="button" className={KNOPF_HAUPT} disabled={speichert} onClick={onBestaetigen}>
              Ja, freigeben
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
