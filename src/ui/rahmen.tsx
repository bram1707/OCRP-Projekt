// Gemeinsame Bausteine: Seitenrahmen mit Rolle, „Rolle wechseln“, Hinweis „Testversion“ und „Rückmeldung geben“,
// dazu Statusmarke, Fortschrittsbalken, Meldungen und Fehler. Alle Texte vom Server werden von React als Text
// eingesetzt, nie als HTML.

import type { ReactNode } from 'react';
import type { Hinderungsgrund } from './api.ts';
import { STARTSEITE_DES_BEREICHS, zurRollenwahl, zurSimulation, type Bereich } from './route.ts';
import type { StatusAnzeige } from './status.ts';
import { KNOPF_NEBEN, VERWEIS } from './stile.ts';
import { Rueckmeldung } from './testleitung/Rueckmeldung.tsx';
import type { Szenario } from './testleitung/szenarien.ts';

export { KNOPF_GEWAEHLT, KNOPF_HAUPT, KNOPF_NEBEN, VERWEIS } from './stile.ts';
export type { Bereich } from './route.ts';

/** In welcher Rolle man gerade ist; steht oben auf jeder Seite. */
const TITEL: Record<Bereich, string> = {
  start: 'Label-Prüfung · Prototyp',
  max: 'Label-Prüfung · Max (Qualitätsmanagement)',
  marie: 'Übersicht · Marie (Fertigungsleitung)',
  simulation: 'Simulation: Instandhaltung (nur im Prototyp)',
  testleitung: 'Testleitung (nur im Prototyp)',
};

/** Titel des Browserfensters je Bereich, damit mehrere offene Fenster unterscheidbar sind */
export const FENSTERTITEL: Record<Bereich, string> = {
  start: 'Rolle wählen · Label-Prüfung',
  max: 'Label-Prüfung · Max',
  marie: 'Übersicht · Marie (nur ansehen)',
  simulation: 'Simulation · Instandhaltung',
  testleitung: 'Rückmeldungen · Testleitung',
};

export function Rahmen({
  children,
  bereich = 'max',
  ansage = null,
  szenario = 'allgemein',
}: {
  children: ReactNode;
  bereich?: Bereich;
  ansage?: string | null;
  /** Vorauswahl für „Rückmeldung geben“ */
  szenario?: Szenario;
}) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Bleibt beim Seitenwechsel bestehen, damit Bildschirmleser „… bestätigt.“ auch nach dem Sprung zum nächsten Label ansagen. */}
      <div role="status" aria-live="polite" className="sr-only">
        {ansage}
      </div>
      <header className="border-b-2 border-slate-300 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-3">
          <a href={STARTSEITE_DES_BEREICHS[bereich]} className="text-xl font-bold text-slate-900 no-underline">
            {TITEL[bereich]}
          </a>
          {/* Der einzige Weg zu den Seiten einer anderen Rolle führt über die Rollenwahl (R16a). */}
          {bereich !== 'start' && (
            <a href={zurRollenwahl()} className={`${VERWEIS} inline-flex min-h-12 items-center`}>
              Rolle wechseln
            </a>
          )}
        </div>
        <p className="border-t border-amber-300 bg-amber-50 px-4 py-2 text-center text-amber-950">
          Testversion: Texterkennung und Spracherkennung sind simuliert.
        </p>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
      <footer className="mx-auto flex max-w-6xl flex-wrap gap-x-8 gap-y-2 border-t border-slate-300 px-4 py-6 text-slate-700">
        {/* Die Instandhaltung hat keine eigene Karte in der Rollenwahl; sie nutzt Max' Rolle (R9) und ist nur von seinen Seiten aus erreichbar. */}
        {bereich === 'max' && (
          <a href={zurSimulation()} className={`${VERWEIS} inline-flex min-h-12 items-center`}>
            Simulation: Instandhaltung (nur im Prototyp)
          </a>
        )}
        <Rueckmeldung bereich={bereich} szenario={szenario} />
      </footer>
    </div>
  );
}

/** Status als Wort mit eigener Farbe (AK-14). */
export function Marke({ anzeige }: { anzeige: StatusAnzeige }) {
  return (
    <span className={`inline-block rounded-md border-2 px-2 py-0.5 font-semibold ${anzeige.klasse}`} data-marke="">
      {anzeige.wort}
    </span>
  );
}

export function Balken({ prozent, beschriftung }: { prozent: number; beschriftung: string }) {
  const wert = Math.max(0, Math.min(100, prozent));
  return (
    <div
      className="h-4 w-full overflow-hidden rounded-full border border-slate-500 bg-white"
      role="progressbar"
      aria-label={beschriftung}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={wert}
    >
      <div className="h-full bg-green-700" style={{ width: `${wert}%` }} />
    </div>
  );
}

export interface MeldungDaten {
  text: string;
  /** Kennung eines eben bestätigten Labels; dann gibt es „Rückgängig“ */
  rueckgaengig?: string;
}

export function Meldung({
  meldung,
  onRueckgaengig,
  gesperrt = false,
}: {
  meldung: MeldungDaten | null;
  onRueckgaengig?: (labelId: string) => void;
  gesperrt?: boolean;
}) {
  return (
    <div className="min-h-0" data-meldung="">
      {meldung && (
        <p className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border-2 border-green-700 bg-green-50 px-4 py-3 text-green-950">
          <span>{meldung.text}</span>
          {meldung.rueckgaengig && onRueckgaengig && (
            <button type="button" className={KNOPF_NEBEN} disabled={gesperrt} onClick={() => onRueckgaengig(meldung.rueckgaengig!)}>
              Rückgängig
            </button>
          )}
        </p>
      )}
    </div>
  );
}

/** Meldung des Servers, bei abgelehnter Freigabe mit seinen Gründen. */
export function Fehler({ text, gruende = [] }: { text: string; gruende?: readonly Hinderungsgrund[] }) {
  return (
    <div role="alert" className="mb-4 rounded-lg border-2 border-red-700 bg-red-50 px-4 py-3 text-red-950">
      <p className="font-semibold">{text}</p>
      {gruende.length > 0 && (
        <ul className="mt-2 list-disc pl-6">
          {gruende.map((g, i) => (
            <li key={`${g.labelId ?? ''}-${i}`}>{g.text}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Laden({ text = 'Wird geladen …' }: { text?: string }) {
  return <p className="py-8 text-slate-700">{text}</p>;
}
