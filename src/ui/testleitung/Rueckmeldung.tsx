// „Rückmeldung geben“ unten auf jeder Seite (AK-51). Gespeichert werden nur Szenario, Zeitpunkt und Kommentar.
// Bei Marie ist das die einzige Eingabe; sie ändert nichts an Labels oder Anlagen (Zusatz zu AK-46).
// Gesendet wird mit fetch, denn die Seite verbietet das Absenden von Formularen (Content-Security-Policy).

import { useEffect, useId, useRef, useState, type FormEvent, type Ref } from 'react';
import type { Bereich } from '../route.ts';
import { KNOPF_HAUPT, KNOPF_NEBEN } from '../stile.ts';
import { sendeRueckmeldung, type Absender } from './aktionen.ts';
import { SZENARIEN, SZENARIO_TEXT, type Szenario } from './szenarien.ts';

export const MAX_KOMMENTAR = 1000;

/** Mit welcher Rolle die Seite sendet; die Instandhaltung nutzt im Prototyp die Rolle von Max (R9). */
const ABSENDER: Record<Bereich, Absender> = { start: 'testleitung', max: 'max', marie: 'marie', simulation: 'max', testleitung: 'testleitung' };

export interface FormularDaten {
  szenario: Szenario;
  kommentar: string;
  sendet: boolean;
  fehler: string | null;
}

export function RueckmeldungFormular({
  daten,
  feldRef,
  onSzenario,
  onKommentar,
  onSenden,
  onAbbrechen,
}: {
  daten: FormularDaten;
  feldRef?: Ref<HTMLTextAreaElement>;
  onSzenario: (s: Szenario) => void;
  onKommentar: (text: string) => void;
  onSenden: () => void;
  onAbbrechen: () => void;
}) {
  const id = useId();
  const absenden = (e: FormEvent) => {
    e.preventDefault();
    onSenden();
  };
  return (
    <form aria-labelledby={`${id}-titel`} onSubmit={absenden} noValidate data-rueckmeldung="" className="mt-3 w-full max-w-2xl rounded-lg border-2 border-slate-400 bg-white p-4 text-slate-900">
      <h2 id={`${id}-titel`} className="text-xl font-bold">
        Rückmeldung zum Prototyp
      </h2>
      <label htmlFor={`${id}-szenario`} className="mt-3 block font-semibold">
        Zu welchem Teil des Tests?
      </label>
      <select
        id={`${id}-szenario`}
        className="mt-1 min-h-12 rounded-lg border-2 border-slate-700 bg-white px-3 text-lg"
        value={daten.szenario}
        disabled={daten.sendet}
        onChange={(e) => onSzenario(e.target.value as Szenario)}
      >
        {SZENARIEN.map((s) => (
          <option key={s} value={s}>
            {SZENARIO_TEXT[s]}
          </option>
        ))}
      </select>
      <label htmlFor={`${id}-kommentar`} className="mt-3 block font-semibold">
        Ihr Kommentar
      </label>
      <p id={`${id}-hinweis`} className="text-slate-700">
        Bitte keine Namen oder andere Angaben zu Personen eintragen. Höchstens {MAX_KOMMENTAR} Zeichen.
      </p>
      <textarea
        ref={feldRef}
        id={`${id}-kommentar`}
        aria-describedby={`${id}-hinweis${daten.fehler ? ` ${id}-fehler` : ''}`}
        aria-invalid={daten.fehler ? true : undefined}
        className="mt-1 block min-h-32 w-full rounded-lg border-2 border-slate-700 p-2 text-lg"
        maxLength={MAX_KOMMENTAR}
        value={daten.kommentar}
        disabled={daten.sendet}
        onChange={(e) => onKommentar(e.target.value)}
      />
      {daten.fehler && (
        <p id={`${id}-fehler`} role="alert" className="mt-2 font-semibold text-red-800">
          {daten.fehler}
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-3">
        <button type="submit" className={KNOPF_HAUPT} disabled={daten.sendet}>
          Rückmeldung senden
        </button>
        <button type="button" className={KNOPF_NEBEN} disabled={daten.sendet} onClick={onAbbrechen}>
          Abbrechen
        </button>
      </div>
    </form>
  );
}

export function Rueckmeldung({ bereich, szenario }: { bereich: Bereich; szenario: Szenario }) {
  const [offen, setOffen] = useState(false);
  const [daten, setDaten] = useState<FormularDaten>({ szenario, kommentar: '', sendet: false, fehler: null });
  const [danke, setDanke] = useState(false);
  const knopf = useRef<HTMLButtonElement>(null);
  const feld = useRef<HTMLTextAreaElement>(null);
  // Nach dem Schließen zurück auf den Knopf, nicht beim ersten Anzeigen der Seite.
  const fokusZurueck = useRef(false);

  useEffect(() => {
    if (offen) feld.current?.focus();
    else if (fokusZurueck.current) {
      fokusZurueck.current = false;
      knopf.current?.focus();
    }
  }, [offen]);

  const schliesse = () => {
    fokusZurueck.current = true;
    setOffen(false);
  };

  useEffect(() => {
    if (!offen) return;
    const taste = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        fokusZurueck.current = true;
        setOffen(false);
      }
    };
    document.addEventListener('keydown', taste);
    return () => document.removeEventListener('keydown', taste);
  }, [offen]);

  const oeffne = () => {
    // Vorauswahl aus der Seite, die gerade zu sehen ist; ein angefangener Kommentar bleibt.
    setDaten((d) => ({ ...d, szenario, fehler: null }));
    setDanke(false);
    setOffen(true);
  };

  const senden = async () => {
    if (daten.sendet) return;
    const kommentar = daten.kommentar.trim();
    if (kommentar === '') {
      setDaten((d) => ({ ...d, fehler: 'Bitte schreiben Sie einen Kommentar.' }));
      feld.current?.focus();
      return;
    }
    setDaten((d) => ({ ...d, sendet: true, fehler: null }));
    try {
      await sendeRueckmeldung(ABSENDER[bereich], daten.szenario, kommentar);
      setDaten((d) => ({ ...d, kommentar: '', sendet: false }));
      setDanke(true);
      schliesse();
    } catch (e) {
      setDaten((d) => ({ ...d, sendet: false, fehler: e instanceof Error ? e.message : 'Die Rückmeldung wurde nicht gespeichert.' }));
    }
  };

  return (
    <div className="w-full">
      <div role="status" aria-live="polite">
        {danke && <p className="mb-2 font-semibold text-green-800">Danke! Ihre Rückmeldung ist gespeichert.</p>}
      </div>
      {offen ? (
        <RueckmeldungFormular
          daten={daten}
          feldRef={feld}
          onSzenario={(s) => setDaten((d) => ({ ...d, szenario: s }))}
          onKommentar={(text) => setDaten((d) => ({ ...d, kommentar: text, fehler: null }))}
          onSenden={() => void senden()}
          onAbbrechen={schliesse}
        />
      ) : (
        <button ref={knopf} type="button" className={KNOPF_NEBEN} onClick={oeffne} data-rueckmeldung-knopf="">
          Rückmeldung geben
        </button>
      )}
    </div>
  );
}
