// „Daten zurücksetzen“ für den nächsten Durchlauf (AK-52, nur im Prototyp). Mit Rückfrage, Fokus auf „Abbrechen“.
// Danach stehen alle Anlagen wieder am Anfang; offene Übersichten von Marie laden über das Signal neu.

import { useEffect, useRef, useState } from 'react';
import { Fehler } from '../rahmen.tsx';
import { KNOPF_NEBEN } from '../stile.ts';
import { setzeDatenZurueck } from './aktionen.ts';
import { Rueckfrage } from './Rueckfrage.tsx';

export const ZURUECKGESETZT = 'Die Daten sind zurückgesetzt. Alle Anlagen stehen wieder am Anfang.';

export function Zuruecksetzen() {
  const [rueckfrage, setRueckfrage] = useState(false);
  const [sendet, setSendet] = useState(false);
  const [meldung, setMeldung] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const knopf = useRef<HTMLButtonElement>(null);
  const fokusZurueck = useRef(false);

  useEffect(() => {
    if (rueckfrage || !fokusZurueck.current) return;
    fokusZurueck.current = false;
    knopf.current?.focus();
  }, [rueckfrage]);

  const schliesse = () => {
    fokusZurueck.current = true;
    setRueckfrage(false);
  };
  const bestaetigen = async () => {
    if (sendet) return;
    setSendet(true);
    setFehler(null);
    try {
      await setzeDatenZurueck();
      setMeldung(ZURUECKGESETZT);
    } catch (e) {
      setFehler(e instanceof Error ? e.message : 'Es wurde nichts zurückgesetzt.');
    } finally {
      setSendet(false);
      schliesse();
    }
  };

  return (
    <div>
      <div role="status" aria-live="polite">
        {meldung && <p className="mb-3 rounded-lg border border-green-200 border-l-4 border-l-green-600 bg-green-50 px-4 py-3 text-green-950">{meldung}</p>}
      </div>
      {fehler && <Fehler text={fehler} />}
      {rueckfrage ? (
        <Rueckfrage
          titel="Alle Daten zurücksetzen?"
          text="Alle Prüfungen, Meldungen, Nachbesserungen und Freigaben gehen verloren. Alle Anlagen stehen danach wieder am Anfang. Die Rückmeldungen bleiben erhalten."
          bestaetigen="Ja, zurücksetzen"
          sendet={sendet}
          onBestaetigen={() => void bestaetigen()}
          onAbbrechen={schliesse}
        />
      ) : (
        <button
          ref={knopf}
          type="button"
          className={KNOPF_NEBEN}
          onClick={() => {
            setMeldung(null);
            setRueckfrage(true);
          }}
        >
          Daten zurücksetzen
        </button>
      )}
    </div>
  );
}
