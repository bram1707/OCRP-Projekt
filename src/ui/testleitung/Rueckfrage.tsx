// Rückfrage vor einem Schritt, der sich nicht rückgängig machen lässt. Der Fokus steht auf „Abbrechen“,
// Escape bricht ab (wie bei der Freigabe einer Anlage).

import { useEffect, useId, useRef } from 'react';
import { KNOPF_HAUPT, KNOPF_NEBEN } from '../stile.ts';

export function Rueckfrage({
  titel,
  text,
  bestaetigen,
  sendet,
  onBestaetigen,
  onAbbrechen,
}: {
  titel: string;
  text: string;
  /** Beschriftung des Knopfs, der den Schritt ausführt */
  bestaetigen: string;
  sendet: boolean;
  onBestaetigen: () => void;
  onAbbrechen: () => void;
}) {
  const id = useId();
  const abbrechen = useRef<HTMLButtonElement>(null);
  const abbrechenAktuell = useRef(onAbbrechen);
  abbrechenAktuell.current = onAbbrechen;
  useEffect(() => abbrechen.current?.focus(), []);
  useEffect(() => {
    const taste = (e: KeyboardEvent) => {
      if (e.key === 'Escape') abbrechenAktuell.current();
    };
    document.addEventListener('keydown', taste);
    return () => document.removeEventListener('keydown', taste);
  }, []);
  return (
    <div role="group" aria-labelledby={`${id}-titel`} aria-describedby={`${id}-text`} data-rueckfrage="" className="mt-3 rounded-lg border border-red-200 border-l-4 border-l-red-600 bg-red-50 p-4 text-red-950">
      <h3 id={`${id}-titel`} className="text-lg font-semibold">
        {titel}
      </h3>
      <p id={`${id}-text`} className="mt-1">
        {text}
      </p>
      <div className="mt-3 flex flex-wrap gap-3">
        <button ref={abbrechen} type="button" className={KNOPF_NEBEN} disabled={sendet} onClick={onAbbrechen}>
          Abbrechen
        </button>
        <button type="button" className={KNOPF_HAUPT} disabled={sendet} onClick={onBestaetigen}>
          {bestaetigen}
        </button>
      </div>
    </div>
  );
}
