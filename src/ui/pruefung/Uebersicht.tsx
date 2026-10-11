// Übersicht einer Anlage (AK-01, AK-13, AK-17, AK-18). Reine Ansicht: Daten und Zustand kommen
// als Eigenschaften, jede Handlung geht als Ereignis an die Seite (AnlageSeite.tsx).

import type { Ref } from 'react';
import type { AnlageMitLabels, Hinderungsgrund, LabelAnsicht, Zusammenfassung as ZusammenfassungDaten } from '../api.ts';
import { Balken, Fehler, KNOPF_GEWAEHLT, KNOPF_HAUPT, KNOPF_NEBEN, Marke, Meldung, VERWEIS, type MeldungDaten } from '../rahmen.tsx';
import { zumLabel } from '../route.ts';
import { istPruefbar, sperreAnzeige } from '../status.ts';
import { Kachel } from './Kachel.tsx';
import { anzahl, ersteWoerter, filtere, fortschritt, naechstesLabel, sperrgrund, sprachenKurz, zaehlzeile } from './logik.ts';
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
  // Bestätigte Labels stehen nicht mehr zwischen den offenen, sondern in der einklappbaren Zeile „bestätigt“ (Optimierung 2, Punkt 2).
  const bestaetigte = kacheln.filter((l) => l.status === 'bestaetigt');
  const { sichtbar, ausgeblendet } = filtere(kacheln.filter((l) => l.status !== 'bestaetigt'), nurAuffaellige);
  const freigegeben = anlage.freigegebenAm !== null;
  const hatPruefbare = naechstesLabel(labels) !== null;
  const offen = labels.filter((l) => istPruefbar(l.status)).length;
  const ohneDatensatz = anlage.zaehlung.fehlt - ausserhalbDerPruefung.filter((l) => l.status === 'fehlt').length;

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <h1 ref={ueberschriftRef} tabIndex={-1} className="text-2xl font-semibold tracking-tight">
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

      <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3">
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
        {freigabeFehler && <Fehler text={freigabeFehler.text} gruende={freigabeFehler.gruende} />}
      </div>

      {/* Zusammenfassung bzw. „bleibt gesperrt“ stehen über den Kacheln, damit Max nach dem letzten Label sofort sieht, wie es weitergeht. */}
      {!hatPruefbare && anlage.gesperrt && zusammenfassung && (
        zusammenfassung.offenePunkte.length === 0 ? (
          <Zusammenfassung
            daten={zusammenfassung}
            rueckfrage={rueckfrage}
            speichert={speichert}
            abbrechenRef={abbrechenRef}
            freigebenRef={freigebenRef}
            onFreigeben={() => ereignis({ art: 'freigeben' })}
            onBestaetigen={() => ereignis({ art: 'freigabeBestaetigen' })}
            onAbbrechen={() => ereignis({ art: 'freigabeAbbrechen' })}
          />
        ) : (
          <section className="mt-6 rounded-xl border border-amber-300 border-l-4 border-l-amber-600 bg-amber-50 shadow-sm p-5 text-amber-950" data-bleibt-gesperrt="">
            <h2 className="text-xl font-semibold tracking-tight">Sie haben alle Labels geprüft, die Sie jetzt prüfen können.</h2>
            <p className="mt-2">Die Anlage bleibt gesperrt, weil:</p>
            <ul className="mt-1 list-disc pl-6">
              {zusammenfassung.offenePunkte.map((p, i) => (
                <li key={`${p.labelId ?? ''}-${i}`}>{p.text}</li>
              ))}
            </ul>
          </section>
        )
      )}

      {hatPruefbare && (
        <button type="button" className={`${KNOPF_HAUPT} mt-2`} onClick={() => ereignis({ art: 'starten' })}>
          Prüfung starten
        </button>
      )}

      {labels.length > 0 && <h2 className="sr-only">Labels</h2>}
      {labels.length > 0 && (
        <div className="mt-6 flex flex-wrap items-center gap-3" role="group" aria-label="Welche Labels anzeigen">
          <span className="font-semibold">Anzeigen:</span>
          <button
            type="button"
            className={nurAuffaellige ? KNOPF_GEWAEHLT : KNOPF_NEBEN}
            aria-pressed={nurAuffaellige}
            onClick={() => ereignis({ art: 'filter', nurAuffaellige: true })}
          >
            Nur auffällige{nurAuffaellige ? ' (gewählt)' : ''}
          </button>
          <button
            type="button"
            className={!nurAuffaellige ? KNOPF_GEWAEHLT : KNOPF_NEBEN}
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
        labels.length > 0 && <p className="mt-4">{nurAuffaellige ? 'Keine auffälligen Labels mehr offen.' : 'Keine Labels mehr offen.'}</p>
      )}

      {bestaetigte.length > 0 && (
        <details className="mt-6 rounded-xl border border-slate-200 bg-white p-3" open={sichtbar.length === 0 && !nurAuffaellige} data-bestaetigt="">
          <summary className="cursor-pointer font-semibold">
            {anzahl(bestaetigte.length, 'Label', 'Labels')} bestätigt
          </summary>
          <ul className="mt-2 divide-y divide-slate-200">
            {bestaetigte.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2" data-bestaetigt-zeile={l.id}>
                <a href={zumLabel(l.anlageId, l.id)} className={`${VERWEIS} font-semibold`}>
                  Label {l.id}
                </a>
                <span className="text-slate-800">{ersteWoerter(l.ocrText)}</span>
                <span className="text-slate-700">{sprachenKurz(l)}</span>
                {!freigegeben && (
                  <button
                    type="button"
                    className="ml-auto min-h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-sm text-slate-800 hover:bg-slate-50 disabled:opacity-50"
                    disabled={speichert}
                    aria-label={`Bestätigung von ${l.id} zurücknehmen`}
                    onClick={() => ereignis({ art: 'rueckgaengig', labelId: l.id })}
                  >
                    Zurücknehmen
                  </button>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}

    </>
  );
}
