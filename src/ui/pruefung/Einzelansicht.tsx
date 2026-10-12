// Einzelansicht eines Labels (AK-10, AK-15, AK-16, AK-20, AK-21). Reine Ansicht: Daten und
// Zustand kommen als Eigenschaften, jede Handlung geht als Ereignis an die Seite (LabelSeite.tsx).

import { useId, useState, type Ref } from 'react';
import type { Fehlergrund } from '../../db/status.ts';
import type { AnlageAnsicht, LabelAnsicht } from '../api.ts';
import { Balken, Fehler, KNOPF_HAUPT, KNOPF_NEBEN, Marke, Meldung, VERWEIS, type MeldungDaten } from '../rahmen.tsx';
import { zurAnlage } from '../route.ts';
import { istPruefbar, STATUS_ANZEIGE } from '../status.ts';
import { FEHLERGRUENDE, FEHLERTEXT_MAX, fehlertextGueltig, fortschritt, sichereBildUrl, sprachZeile, type Ablauf } from './logik.ts';
import { Bedeutungen } from './Bedeutungen.tsx';
import { Legende, MarkierterText, Warum } from './Warum.tsx';

export type EinzelEreignis =
  | { art: 'bestaetigen' }
  | { art: 'melden' }
  | { art: 'grund'; grund: Fehlergrund; text?: string }
  | { art: 'abbrechen' }
  | { art: 'warum' }
  | { art: 'foto' }
  | { art: 'bildGeladen' }
  | { art: 'bildFehlt' }
  | { art: 'zuruecknehmen' }
  | { art: 'rueckgaengig'; labelId: string };

export interface EinzelansichtDaten {
  anlage: AnlageAnsicht;
  label: LabelAnsicht;
  zustand: Ablauf;
  warumOffen: boolean;
  fotoGross: boolean;
  /** Das Foto ließ sich nicht laden; dann bleiben die Entscheidungsknöpfe gesperrt, Zurücknehmen geht weiter. */
  fotoFehlt?: boolean;
  fehler: string | null;
  meldung: MeldungDaten | null;
}

export function Einzelansicht({
  daten,
  ereignis,
  ueberschriftRef,
  gruendeRef,
  bildRef,
}: {
  daten: EinzelansichtDaten;
  ereignis: (e: EinzelEreignis) => void;
  ueberschriftRef?: Ref<HTMLHeadingElement>;
  gruendeRef?: Ref<HTMLHeadingElement>;
  bildRef?: Ref<HTMLImageElement>;
}) {
  const { anlage, label, zustand, warumOffen, fotoGross, fotoFehlt = false, fehler, meldung } = daten;
  const f = fortschritt(anlage);
  const bild = sichereBildUrl(label.bildUrl);
  const pruefbar = istPruefbar(label.status);
  // Die Schwelle kennt nur der Server; er meldet sie als Grund „unsicher_ocr“.
  const textSchlecht = label.gruende.some((g) => g.code === 'unsicher_ocr');

  return (
    <>
      <nav className="mb-3">
        <a href={zurAnlage(anlage.id)} className={VERWEIS}>
          ← Zurück zur Liste {anlage.name}
        </a>
      </nav>
      <div className="mb-4 rounded-xl border border-slate-200 bg-white p-3">
        <p className="mb-2 font-semibold">
          {anlage.name} · Label {label.id} · {f.text}
        </p>
        <Balken prozent={f.prozent} beschriftung={`${anlage.name}: ${f.text}`} />
      </div>

      <Meldung meldung={meldung} onRueckgaengig={(id) => ereignis({ art: 'rueckgaengig', labelId: id })} gesperrt={zustand !== 'bereit'} />
      {fehler && <Fehler text={fehler} />}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 ref={ueberschriftRef} tabIndex={-1} className="text-2xl font-semibold tracking-tight">
          Label {label.id}
        </h1>
        <Marke anzeige={STATUS_ANZEIGE[label.status]} />
        {label.auffaellig && pruefbar && (
          <span className="rounded-full border border-amber-600 bg-amber-50 px-2.5 py-0.5 text-sm font-semibold text-amber-950">Auffällig</span>
        )}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <figure className={fotoGross ? 'md:col-span-2' : ''}>
          {bild ? (
            <img
              ref={bildRef}
              src={bild}
              alt={`Foto von Label ${label.id}`}
              className="max-h-[75vh] w-full rounded-lg border border-slate-300 bg-white object-contain"
              onLoad={() => ereignis({ art: 'bildGeladen' })}
              onError={() => ereignis({ art: 'bildFehlt' })}
            />
          ) : (
            <div className="flex aspect-[48/34] w-full items-center justify-center rounded-lg border border-slate-300 bg-slate-100">
              Kein Foto vorhanden
            </div>
          )}
          {bild && (
            <button type="button" className={`${KNOPF_NEBEN} mt-2`} aria-pressed={fotoGross} onClick={() => ereignis({ art: 'foto' })}>
              {fotoGross ? 'Foto kleiner anzeigen' : 'Foto größer anzeigen'}
            </button>
          )}
        </figure>

        <div>
          <h2 className="text-lg font-semibold">Vom Foto abgelesener Text (automatisch, kann Fehler enthalten)</h2>
          <div
            className={`mt-2 rounded-lg border p-3 ${textSchlecht ? 'border-red-300 bg-red-50' : 'border-slate-300 bg-white'}`}
            data-schlecht-lesbar={textSchlecht ? '' : undefined}
          >
            {textSchlecht && <p className="mb-2 font-bold text-red-900">Text schlecht lesbar</p>}
            <MarkierterText label={label} alle={false} />
          </div>
          <Legende label={label} />

          <h2 className="mt-5 text-lg font-semibold">Erkannte Sprachen (nur ein Vorschlag)</h2>
          <ul className="mt-1">
            {label.sprachen.length === 0 ? (
              <li className="font-semibold">Keine Sprache erkannt</li>
            ) : (
              label.sprachen.map((s) => (
                <li key={s.code} className={s.sicher ? '' : 'font-semibold text-amber-950'}>
                  {sprachZeile(s)}
                </li>
              ))
            )}
          </ul>
          <Bedeutungen label={label} />
          {label.hinweis && <p className="mt-3 rounded-lg border border-amber-200 border-l-4 border-l-amber-600 bg-amber-50 px-3 py-2 text-amber-950">{label.hinweis}</p>}

          {label.letzterFehlergrundText && (label.status === 'nachgebessert' || label.status === 'fehlerhaft') && (
            <p className="mt-3 rounded-lg border border-violet-200 border-l-4 border-l-violet-600 bg-violet-50 px-3 py-2 text-violet-950">
              Von Ihnen gemeldet: {label.letzterFehlergrundText}
            </p>
          )}

          {label.auffaellig && pruefbar && label.gruende.length > 0 && (
            <div className="mt-3">
              <p className="font-semibold">Auffällig:</p>
              <ul className="list-disc pl-6">
                {label.gruende.map((g) => (
                  <li key={g.code}>{g.text}</li>
                ))}
              </ul>
              <p className="mt-1 text-slate-700">Auffällig heißt: bitte genauer hinsehen. Es ist kein Fehler.</p>
            </div>
          )}

          <button
            type="button"
            className={`${KNOPF_NEBEN} mt-4`}
            aria-expanded={warumOffen}
            aria-controls="warum-bereich"
            onClick={() => ereignis({ art: 'warum' })}
          >
            Warum?
          </button>
          <div id="warum-bereich">{warumOffen && <Warum label={label} />}</div>
        </div>
      </div>

      <section className="mt-8 rounded-xl border border-slate-200 bg-white shadow-sm p-4" aria-labelledby="entscheidung-titel">
        <h2 id="entscheidung-titel" className="text-xl font-semibold tracking-tight">
          Ihre Entscheidung
        </h2>
        {pruefbar && <Entscheidung zustand={zustand} fotoFehlt={fotoFehlt} ereignis={ereignis} gruendeRef={gruendeRef} />}
        {label.status === 'bestaetigt' && (
          <div className="mt-2">
            <p>Sie haben dieses Label bestätigt.</p>
            {anlage.freigegebenAm === null ? (
              <>
                <p className="mt-1 text-slate-700">Solange die Anlage nicht freigegeben ist, können Sie die Bestätigung zurücknehmen.</p>
                <button
                  type="button"
                  className={`${KNOPF_NEBEN} mt-3`}
                  disabled={zustand !== 'bereit'}
                  onClick={() => ereignis({ art: 'zuruecknehmen' })}
                >
                  Bestätigung zurücknehmen
                </button>
              </>
            ) : (
              <p className="mt-1 text-slate-700">Die Anlage ist freigegeben.</p>
            )}
          </div>
        )}
        {label.status === 'fehlerhaft' && (
          <p className="mt-2">Dieses Label wartet auf Nachbesserung. Sie können es prüfen, sobald es zurückkommt.</p>
        )}
        {label.status === 'fehlt' && <p className="mt-2">Für dieses Label gibt es kein Foto. Sie können es prüfen, sobald ein Foto vorliegt.</p>}
      </section>
    </>
  );
}

function Entscheidung({
  zustand,
  fotoFehlt,
  ereignis,
  gruendeRef,
}: {
  zustand: Ablauf;
  fotoFehlt: boolean;
  ereignis: (e: EinzelEreignis) => void;
  gruendeRef?: Ref<HTMLHeadingElement>;
}) {
  const bereit = zustand === 'bereit' && !fotoFehlt;
  if (zustand === 'gruende') return <Gruende ereignis={ereignis} gruendeRef={gruendeRef} />;
  return (
    <div className="mt-2">
      <p className="text-lg font-semibold">Ist das Label auf dem Foto in Ordnung: lesbar, unbeschädigt und in den richtigen Sprachen?</p>
      <div className="mt-3 flex flex-wrap gap-3">
        <button type="button" className={KNOPF_HAUPT} disabled={!bereit} onClick={() => ereignis({ art: 'bestaetigen' })}>
          Ja, bestätigen
        </button>
        <button type="button" className={KNOPF_NEBEN} disabled={!bereit} onClick={() => ereignis({ art: 'melden' })}>
          Nein, Fehler melden
        </button>
      </div>
      {zustand === 'speichert' && <p className="mt-2">Wird gespeichert …</p>}
      {fotoFehlt ? (
        <div className="mt-3">
          <Fehler text="Das Foto konnte nicht geladen werden. Ohne Foto können Sie nicht entscheiden. Bitte laden Sie die Seite neu." />
        </div>
      ) : (
        zustand === 'laedt' && <p className="mt-2">Foto wird geladen …</p>
      )}
      <p className="mt-3 text-slate-700">
        Die erkannten Sprachen sind nur ein Vorschlag. Ist das Label richtig und nur der Vorschlag falsch, bestätigen Sie trotzdem.
      </p>
    </div>
  );
}

/** Die Gründe beim Melden. Eigene Komponente, damit Feld und Text bei jedem Öffnen leer beginnen. */
function Gruende({ ereignis, gruendeRef }: { ereignis: (e: EinzelEreignis) => void; gruendeRef?: Ref<HTMLHeadingElement> }) {
  // „Sonstiges“ öffnet ein Feld für eine kurze Beschreibung; gesendet wird erst mit Text.
  const [sonstigesOffen, setSonstigesOffen] = useState(false);
  const [text, setText] = useState('');
  const feldId = useId();
  return (
    <div className="mt-2" role="group" aria-labelledby="gruende-titel">
      <h3 id="gruende-titel" ref={gruendeRef} tabIndex={-1} className="text-lg font-semibold">
        Was ist am Label nicht in Ordnung?
      </h3>
      <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {FEHLERGRUENDE.map((g) => (
          <button
            key={g.grund}
            type="button"
            aria-expanded={g.grund === 'sonstiges' ? sonstigesOffen : undefined}
            className={`flex min-h-24 flex-col items-start rounded-lg border border-red-200 border-l-4 border-l-red-600 px-4 py-3 text-left text-slate-900 hover:bg-red-50 ${
              g.grund === 'sonstiges' && sonstigesOffen ? 'bg-red-50 ring-1 ring-red-600' : 'bg-white'
            }`}
            onClick={() => (g.grund === 'sonstiges' ? setSonstigesOffen((o) => !o) : ereignis({ art: 'grund', grund: g.grund }))}
          >
            <span className="text-base font-semibold">{g.titel}</span>
            <span>{g.erklaerung}</span>
          </button>
        ))}
      </div>
      {sonstigesOffen && (
        <form
          className="mt-3 rounded-lg border border-red-200 bg-white p-4"
          data-sonstiges=""
          onSubmit={(e) => {
            e.preventDefault();
            if (fehlertextGueltig(text)) ereignis({ art: 'grund', grund: 'sonstiges', text });
          }}
        >
          <label htmlFor={feldId} className="block font-semibold">
            Was stimmt nicht? (Pflichtfeld)
          </label>
          <textarea
            id={feldId}
            // Fokus ins Feld, sobald es sich öffnet: Max soll gleich schreiben können.
            autoFocus
            rows={3}
            maxLength={FEHLERTEXT_MAX}
            required
            value={text}
            onChange={(e) => setText(e.target.value)}
            aria-describedby={`${feldId}-hinweis`}
            className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-base"
          />
          <p id={`${feldId}-hinweis`} className="mt-1 text-slate-700">
            Kurz beschreiben, damit die Instandhaltung weiß, was zu tun ist. Noch {FEHLERTEXT_MAX - text.length} Zeichen.
          </p>
          <button type="submit" className={`${KNOPF_HAUPT} mt-3`} disabled={!fehlertextGueltig(text)}>
            Fehler melden
          </button>
        </form>
      )}
      <button type="button" className={`${KNOPF_NEBEN} mt-3`} onClick={() => ereignis({ art: 'abbrechen' })}>
        Abbrechen
      </button>
    </div>
  );
}
