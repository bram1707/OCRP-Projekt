// Startseite: Rollenwahl „Wer sind Sie?“. Im Prototyp gibt es keine Anmeldung, die Rolle wählt man selbst.
// Unten die Aufgaben der Testleitung (Rückmeldungen ansehen, Daten zurücksetzen), nur im Prototyp.

import { useEffect, useRef } from 'react';
import { zuMarie, zuRueckmeldungen, zurAnlagenliste, zurKamera } from '../route.ts';
import { VERWEIS } from '../stile.ts';
import { Zuruecksetzen } from '../testleitung/Zuruecksetzen.tsx';

interface RollenKarte {
  ziel: string;
  /** Pfade eines einfachen Symbols (24 × 24) */
  symbol: readonly string[];
  wer: string;
  aufgabe: string;
  zusatz: string;
}

const ROLLEN: readonly RollenKarte[] = [
  { ziel: zurAnlagenliste(), symbol: ['M9 12l2 2 4-4', 'M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6z'], wer: 'Max', aufgabe: 'Labels prüfen', zusatz: 'Qualitätsmanagement' },
  { ziel: zuMarie(), symbol: ['M4 20V10', 'M10 20V4', 'M16 20v-7', 'M22 20H2'], wer: 'Marie', aufgabe: 'Übersicht ansehen', zusatz: 'Fertigungsleitung' },
  { ziel: zurKamera(), symbol: ['M4 8h3l2-3h6l2 3h3v11H4z', 'M12 16.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z'], wer: 'Kamera', aufgabe: 'Eigenes Foto hochladen', zusatz: 'nur im Prototyp' },
];

export function Startseite() {
  const ueberschrift = useRef<HTMLHeadingElement>(null);
  useEffect(() => ueberschrift.current?.focus(), []);
  return (
    <>
      <h1 ref={ueberschrift} tabIndex={-1} className="mb-2 text-2xl font-semibold tracking-tight">
        Wer sind Sie?
      </h1>
      <p className="mb-6 text-slate-700">Im Prototyp gibt es keine Anmeldung; die Rolle wählen Sie selbst.</p>
      <ul className="grid gap-4 md:grid-cols-3">
        {ROLLEN.map((r) => (
          <li key={r.ziel}>
            <a
              href={r.ziel}
              className="flex min-h-32 items-start gap-4 rounded-xl border border-slate-200 bg-white shadow-sm p-5 text-slate-900 no-underline transition hover:-translate-y-0.5 hover:border-blue-400 hover:shadow-md"
              data-rolle={r.wer}
            >
              <span aria-hidden="true" className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
                <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  {r.symbol.map((d) => (
                    <path key={d} d={d} />
                  ))}
                </svg>
              </span>
              <span className="flex flex-col">
                <span className="text-lg font-semibold tracking-tight">
                  {r.wer} · {r.aufgabe}
                </span>
                <span className="mt-1 text-slate-600">({r.zusatz})</span>
              </span>
            </a>
          </li>
        ))}
      </ul>

      <section aria-labelledby="testleitung-titel" className="mt-12 border-t border-slate-200 pt-6" data-testleitung="">
        <h2 id="testleitung-titel" className="text-xl font-semibold tracking-tight">
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
