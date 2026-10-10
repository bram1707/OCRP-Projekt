// Zusammenfassung vor der Freigabe (AK-02). Sie erscheint nur, wenn der Server keine offenen
// Punkte meldet; ob freigegeben werden darf, entscheidet beim Klick trotzdem der Server.

import type { Ref } from 'react';
import type { Hinderungsgrund, Zusammenfassung as ZusammenfassungDaten } from '../api.ts';
import { Fehler, KNOPF_HAUPT, KNOPF_NEBEN } from '../rahmen.tsx';

export function Zusammenfassung({
  daten,
  rueckfrage,
  speichert,
  fehler,
  abbrechenRef,
  freigebenRef,
  onFreigeben,
  onBestaetigen,
  onAbbrechen,
}: {
  daten: ZusammenfassungDaten;
  rueckfrage: boolean;
  speichert: boolean;
  fehler: { text: string; gruende: readonly Hinderungsgrund[] } | null;
  abbrechenRef?: Ref<HTMLButtonElement>;
  freigebenRef?: Ref<HTMLButtonElement>;
  onFreigeben: () => void;
  onBestaetigen: () => void;
  onAbbrechen: () => void;
}) {
  const sprachen = daten.sprachen.map((s) => s.name).join(', ') || 'keine sicher erkannt';
  return (
    <section className="mt-6 rounded-xl border-2 border-green-700 bg-white p-5" aria-labelledby="zusammenfassung-titel">
      <h2 id="zusammenfassung-titel" className="text-2xl font-bold">
        Zusammenfassung: alle Labels bestätigt
      </h2>
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-6 gap-y-1">
        <dt className="font-semibold">Labels</dt>
        <dd>
          {daten.anzahlLabels} von {daten.sollAnzahl}
        </dd>
        <dt className="font-semibold">Gefundene Sprachen</dt>
        <dd>{sprachen}</dd>
        <dt className="font-semibold">Davon auffällig</dt>
        <dd>{daten.auffaellig}</dd>
        <dt className="font-semibold">Nachgebessert</dt>
        <dd>{daten.nachgebessert}</dd>
        <dt className="font-semibold">Offene Punkte</dt>
        <dd>{daten.offenePunkte.length === 0 ? 'Keine offenen Punkte' : daten.offenePunkte.map((p) => p.text).join(' ')}</dd>
      </dl>
      {fehler && (
        <div className="mt-4">
          <Fehler text={fehler.text} gruende={fehler.gruende} />
        </div>
      )}
      {!rueckfrage ? (
        <button ref={freigebenRef} type="button" className={`${KNOPF_HAUPT} mt-5`} disabled={speichert} onClick={onFreigeben}>
          Anlage freigeben
        </button>
      ) : (
        <div role="alertdialog" aria-labelledby="rueckfrage-titel" aria-describedby="rueckfrage-text" className="mt-5 rounded-lg border-2 border-blue-800 bg-blue-50 p-4">
          <h3 id="rueckfrage-titel" className="text-xl font-bold">
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
