// Startseite: Rollenwahl „Wer sind Sie?“. Im Prototyp gibt es keine Anmeldung, die Rolle wählt man selbst.
// Unten die Aufgaben der Testleitung (Rückmeldungen ansehen, Daten zurücksetzen), nur im Prototyp.

import { useEffect, useRef } from 'react';
import { zuMarie, zuRueckmeldungen, zurAnlagenliste } from '../route.ts';
import { VERWEIS } from '../stile.ts';
import { Zuruecksetzen } from '../testleitung/Zuruecksetzen.tsx';

interface RollenKarte {
  ziel: string;
  wer: string;
  aufgabe: string;
  zusatz: string;
}

const ROLLEN: readonly RollenKarte[] = [
  { ziel: zurAnlagenliste(), wer: 'Max', aufgabe: 'Labels prüfen', zusatz: 'Qualitätsmanagement' },
  { ziel: zuMarie(), wer: 'Marie', aufgabe: 'Übersicht ansehen', zusatz: 'Fertigungsleitung' },
];

export function Startseite() {
  const ueberschrift = useRef<HTMLHeadingElement>(null);
  useEffect(() => ueberschrift.current?.focus(), []);
  return (
    <>
      <h1 ref={ueberschrift} tabIndex={-1} className="mb-2 text-3xl font-bold">
        Wer sind Sie?
      </h1>
      <p className="mb-6 text-slate-700">Im Prototyp gibt es keine Anmeldung; die Rolle wählen Sie selbst.</p>
      <ul className="grid gap-4 md:grid-cols-3">
        {ROLLEN.map((r) => (
          <li key={r.ziel}>
            <a
              href={r.ziel}
              className="flex min-h-32 flex-col justify-center rounded-xl border-2 border-slate-400 bg-white p-5 text-slate-900 no-underline hover:border-blue-800"
              data-rolle={r.wer}
            >
              <span className="text-2xl font-bold">
                {r.wer} · {r.aufgabe}
              </span>
              <span className="mt-1 text-slate-700">({r.zusatz})</span>
            </a>
          </li>
        ))}
      </ul>

      <section aria-labelledby="testleitung-titel" className="mt-12 border-t-2 border-slate-300 pt-6" data-testleitung="">
        <h2 id="testleitung-titel" className="text-2xl font-bold">
          Für die Testleitung
        </h2>
        <p className="mt-1 text-slate-700">Nur für Nutzertests mit dem Prototyp.</p>
        <p className="mt-3">
          <a href={zuRueckmeldungen()} className={VERWEIS}>
            Rückmeldungen ansehen
          </a>
        </p>
        <div className="mt-4">
          <Zuruecksetzen />
        </div>
      </section>
    </>
  );
}
