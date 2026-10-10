// Übersicht einer Anlage (AK-01, AK-13, AK-17, AK-18). Reine Ansicht: Daten und Zustand kommen
// als Eigenschaften, jede Handlung geht als Ereignis an die Seite (AnlageSeite.tsx).

import type { Ref } from 'react';
import type { AnlageMitLabels, Hinderungsgrund, LabelAnsicht, Zusammenfassung as ZusammenfassungDaten } from '../api.ts';
import { Balken, Fehler, KNOPF_HAUPT, KNOPF_NEBEN, Marke, Meldung, VERWEIS, type MeldungDaten } from '../rahmen.tsx';
import { zurStartseite } from '../route.ts';
import { istPruefbar, sperreAnzeige } from '../status.ts';
import { Kachel } from './Kachel.tsx';
import { anzahl, filtere, fortschritt, naechstesLabel, sperrgrund, zaehlzeile } from './logik.ts';
import { Zusammenfassung } from './Zusammenfassung.tsx';

export type UebersichtEreignis =
  | { art: 'filter'; nurAuffaellige: boolean }
  | { art: 'bestaetigen'; labelId: string }
  | { art: 'rueckgaengig'; labelId: string }
  | { art: 'starten' }
  | { art: 'freigeben' }
  | { art: 'freigabeBestaetigen' }
  | { art: 'freigabeAbbrechen' };

export interface UebersichtDaten {
  daten: AnlageMitLabels;
  /** Kacheln in stabiler Reihenfolge (siehe ordneStabil) */
  kacheln: readonly LabelAnsicht[];
  nurAuffaellige: boolean;
  speichert: boolean;
  meldung: MeldungDaten | null;
  fehler: string | null;
  zusammenfassung: ZusammenfassungDaten | null;
  rueckfrage: boolean;
  freigabeFehler: { text: string; gruende: readonly Hinderungsgrund[] } | null;
}

function datum(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' });
}

export function Uebersicht({
  zustand,
  ereignis,
  ueberschriftRef,
  abbrechenRef,
  freigebenRef,
}: {
  zustand: UebersichtDaten;
  ereignis: (e: UebersichtEreignis) => void;
  ueberschriftRef?: Ref<HTMLHeadingElement>;
  abbrechenRef?: Ref<HTMLButtonElement>;
  freigebenRef?: Ref<HTMLButtonElement>;
}) {
  const { daten, kacheln, nurAuffaellige, speichert, meldung, fehler, zusammenfassung, rueckfrage, freigabeFehler } = zustand;
  const { anlage, labels, ausserhalbDerPruefung } = daten;
  const f = fortschritt(anlage);
  const { sichtbar, ausgeblendet } = filtere(kacheln, nurAuffaellige);
  const hatPruefbare = naechstesLabel(labels) !== null;
  const offen = labels.filter((l) => istPruefbar(l.status)).length;
  const ohneDatensatz = anlage.zaehlung.fehlt - ausserhalbDerPruefung.filter((l) => l.status === 'fehlt').length;

  return (
    <>
      <nav className="mb-3">
        <a href={zurStartseite()} className={VERWEIS}>
          Alle Anlagen
        </a>
      </nav>

      <div className="flex flex-wrap items-center gap-3">
        <h1 ref={ueberschriftRef} tabIndex={-1} className="text-3xl font-bold">
          {anlage.name}
        </h1>
        <Marke anzeige={sperreAnzeige(anlage.gesperrt)} />
      </div>
      {!anlage.gesperrt && anlage.freigegebenAm && (
        <p className="mt-1 text-slate-700">Freigegeben am {datum(anlage.freigegebenAm)}.</p>
      )}

      {anlage.gesperrt && (
        <details className="mt-2" data-warum-gesperrt="">
          <summary className={`${VERWEIS} cursor-pointer`}>Warum noch gesperrt?</summary>
          <ul className="mt-2 list-disc pl-6">
            {offen > 0 && <li>Noch {anzahl(offen, 'Label', 'Labels')} von Ihnen zu prüfen.</li>}
            {ausserhalbDerPruefung.map((l) => (
              <li key={l.id}>{sperrgrund(l)}</li>
            ))}
            {ohneDatensatz > 0 && <li>{anzahl(ohneDatensatz, 'Label', 'Labels')} laut Anlagenliste nicht erfasst.</li>}
            {offen === 0 && ausserhalbDerPruefung.length === 0 && ohneDatensatz <= 0 && <li>Alle Labels sind bestätigt. Es fehlt nur noch Ihre Freigabe.</li>}
          </ul>
        </details>
      )}

      <div className="mt-4 rounded-xl border-2 border-slate-300 bg-white p-3">
        <p className="mb-2 font-semibold">{f.text}</p>
        <Balken prozent={f.prozent} beschriftung={`${anlage.name}: ${f.text}`} />
        <p className="mt-3" data-zaehlzeile="">
          {zaehlzeile(anlage)}
        </p>
        <p className="mt-1 text-slate-700">Auffällig heißt: bitte genauer hinsehen. Es ist kein Fehler.</p>
      </div>

      <div className="mt-4">
        <Meldung meldung={meldung} onRueckgaengig={(id) => ereignis({ art: 'rueckgaengig', labelId: id })} gesperrt={speichert} />
        {fehler && <Fehler text={fehler} />}
      </div>

      {hatPruefbare && (
        <button type="button" className={`${KNOPF_HAUPT} mt-2`} onClick={() => ereignis({ art: 'starten' })}>
          Prüfung starten
        </button>
      )}

      {labels.length > 0 && (
        <div className="mt-6 flex flex-wrap items-center gap-3" role="group" aria-label="Welche Labels anzeigen">
          <span className="font-semibold">Anzeigen:</span>
          <button
            type="button"
            className={`${KNOPF_NEBEN} ${nurAuffaellige ? 'border-blue-800 bg-blue-50' : ''}`}
            aria-pressed={nurAuffaellige}
            onClick={() => ereignis({ art: 'filter', nurAuffaellige: true })}
          >
            Nur auffällige{nurAuffaellige ? ' (gewählt)' : ''}
          </button>
          <button
            type="button"
            className={`${KNOPF_NEBEN} ${!nurAuffaellige ? 'border-blue-800 bg-blue-50' : ''}`}
            aria-pressed={!nurAuffaellige}
            onClick={() => ereignis({ art: 'filter', nurAuffaellige: false })}
          >
            Alle{!nurAuffaellige ? ' (gewählt)' : ''}
          </button>
          {nurAuffaellige && <span data-ausgeblendet="">{anzahl(ausgeblendet, 'Label', 'Labels')} ausgeblendet</span>}
        </div>
      )}

      {sichtbar.length > 0 ? (
        <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sichtbar.map((l) => (
            <Kachel key={l.id} label={l} gesperrt={speichert} onBestaetigen={(id) => ereignis({ art: 'bestaetigen', labelId: id })} />
          ))}
        </ul>
      ) : (
        nurAuffaellige && <p className="mt-4">Keine auffälligen Labels mehr offen.</p>
      )}

      {!hatPruefbare && anlage.gesperrt && zusammenfassung && (
        zusammenfassung.offenePunkte.length === 0 ? (
          <Zusammenfassung
            daten={zusammenfassung}
            rueckfrage={rueckfrage}
            speichert={speichert}
            fehler={freigabeFehler}
            abbrechenRef={abbrechenRef}
            freigebenRef={freigebenRef}
            onFreigeben={() => ereignis({ art: 'freigeben' })}
            onBestaetigen={() => ereignis({ art: 'freigabeBestaetigen' })}
            onAbbrechen={() => ereignis({ art: 'freigabeAbbrechen' })}
          />
        ) : (
          <section className="mt-6 rounded-xl border-2 border-amber-700 bg-amber-50 p-5 text-amber-950" data-bleibt-gesperrt="">
            <h2 className="text-2xl font-bold">Sie haben alle Labels geprüft, die Sie jetzt prüfen können.</h2>
            <p className="mt-2">Die Anlage bleibt gesperrt, weil:</p>
            <ul className="mt-1 list-disc pl-6">
              {zusammenfassung.offenePunkte.map((p, i) => (
                <li key={`${p.labelId ?? ''}-${i}`}>{p.text}</li>
              ))}
            </ul>
          </section>
        )
      )}
    </>
  );
}
