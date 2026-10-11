// Seite der Testleitung (#/rueckmeldungen, nur im Prototyp): alle Rückmeldungen, die neueste zuerst,
// und „Alle Rückmeldungen löschen“ mit Rückfrage. Kommentare erscheinen nur als Text.

import { useCallback, useEffect, useRef, useState, type Ref } from 'react';
import type { Rueckmeldung } from '../api.ts';
import { Fehler, Laden } from '../rahmen.tsx';
import { KNOPF_NEBEN } from '../stile.ts';
import { ladeRueckmeldungen, loescheRueckmeldungen } from './aktionen.ts';
import { Rueckfrage } from './Rueckfrage.tsx';
import { RUECKMELDUNG_GESPEICHERT } from './Rueckmeldung.tsx';
import { istSzenario, SZENARIO_TEXT } from './szenarien.ts';

const ZEIT = new Intl.DateTimeFormat('de-DE', {
  timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
});

/** „11.10.2026, 14:03“ in deutscher Zeit; ein ungültiger Zeitpunkt bleibt, wie es ist. */
export function zeitText(iso: string): string {
  const datum = new Date(iso);
  return Number.isNaN(datum.getTime()) ? iso : ZEIT.format(datum);
}

export interface RueckmeldungenDaten {
  liste: readonly Rueckmeldung[];
  rueckfrage: boolean;
  sendet: boolean;
  meldung: string | null;
  fehler: string | null;
}

export function RueckmeldungenAnsicht({
  daten,
  ueberschriftRef,
  loeschenRef,
  onLoeschen,
  onBestaetigen,
  onAbbrechen,
}: {
  daten: RueckmeldungenDaten;
  ueberschriftRef?: Ref<HTMLHeadingElement>;
  loeschenRef?: Ref<HTMLButtonElement>;
  onLoeschen: () => void;
  onBestaetigen: () => void;
  onAbbrechen: () => void;
}) {
  const { liste } = daten;
  return (
    <>
      <h1 ref={ueberschriftRef} tabIndex={-1} className="text-2xl font-semibold tracking-tight">
        Rückmeldungen
      </h1>
      <p className="mt-2 max-w-3xl text-slate-800">
        Rückmeldungen aus den Tests, die neueste zuerst. Sie bleiben erhalten, wenn die Daten zurückgesetzt werden.
      </p>
      <div role="status" aria-live="polite">
        {daten.meldung && <p className="mt-4 rounded-lg border border-green-200 border-l-4 border-l-green-600 bg-green-50 px-4 py-3 text-green-950">{daten.meldung}</p>}
      </div>
      {daten.fehler && (
        <div className="mt-4">
          <Fehler text={daten.fehler} />
        </div>
      )}
      {liste.length === 0 ? (
        <p className="mt-6">Es gibt keine Rückmeldungen.</p>
      ) : (
        <>
          <h2 className="mt-6 text-xl font-semibold tracking-tight">{liste.length === 1 ? '1 Rückmeldung' : `${liste.length} Rückmeldungen`}</h2>
          <ul className="mt-3 grid gap-3">
            {liste.map((r) => (
              <li key={r.id} className="rounded-xl border border-slate-200 bg-white shadow-sm p-4" data-rueckmeldung-eintrag="">
                <p className="font-semibold">
                  {istSzenario(r.szenario) ? SZENARIO_TEXT[r.szenario] : r.szenario} · {zeitText(r.zeitpunkt)}
                </p>
                <p className="mt-1 whitespace-pre-wrap break-words">{r.kommentar}</p>
              </li>
            ))}
          </ul>
          <div className="mt-6">
            {daten.rueckfrage ? (
              <Rueckfrage
                titel="Alle Rückmeldungen endgültig löschen?"
                text="Sie lassen sich danach nicht wiederherstellen. Die Daten der Anlagen bleiben, wie sie sind."
                bestaetigen="Ja, alle löschen"
                sendet={daten.sendet}
                onBestaetigen={onBestaetigen}
                onAbbrechen={onAbbrechen}
              />
            ) : (
              <button ref={loeschenRef} type="button" className={KNOPF_NEBEN} disabled={daten.sendet} onClick={onLoeschen}>
                Alle Rückmeldungen löschen
              </button>
            )}
          </div>
        </>
      )}
    </>
  );
}

export function Rueckmeldungen() {
  const [liste, setListe] = useState<Rueckmeldung[] | null>(null);
  const [ladefehler, setLadefehler] = useState<string | null>(null);
  const [rueckfrage, setRueckfrage] = useState(false);
  const [sendet, setSendet] = useState(false);
  const [meldung, setMeldung] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const ueberschrift = useRef<HTMLHeadingElement>(null);
  const loeschen = useRef<HTMLButtonElement>(null);
  const fokusZurueck = useRef(false);

  const laden = useCallback(async () => {
    try {
      setListe(await ladeRueckmeldungen());
      setLadefehler(null);
    } catch (e) {
      setLadefehler(e instanceof Error ? e.message : 'Unbekannter Fehler.');
    }
  }, []);
  useEffect(() => void laden(), [laden]);
  // Eine Rückmeldung, die auf dieser Seite gesendet wird, erscheint gleich in der Liste.
  useEffect(() => {
    const neu = () => void laden();
    window.addEventListener(RUECKMELDUNG_GESPEICHERT, neu);
    return () => window.removeEventListener(RUECKMELDUNG_GESPEICHERT, neu);
  }, [laden]);

  const geladen = liste !== null;
  useEffect(() => {
    if (geladen) ueberschrift.current?.focus();
  }, [geladen]);
  // Nach „Abbrechen“ zurück auf den Knopf; nach dem Löschen gibt es ihn nicht mehr, dann auf die Überschrift.
  useEffect(() => {
    if (rueckfrage || !fokusZurueck.current) return;
    fokusZurueck.current = false;
    (loeschen.current ?? ueberschrift.current)?.focus();
  }, [rueckfrage, liste]);

  const abbrechen = () => {
    fokusZurueck.current = true;
    setRueckfrage(false);
  };
  const bestaetigen = async () => {
    if (sendet) return;
    setSendet(true);
    setFehler(null);
    try {
      const { geloescht } = await loescheRueckmeldungen();
      setMeldung(geloescht === 1 ? '1 Rückmeldung ist gelöscht.' : `${geloescht} Rückmeldungen sind gelöscht.`);
      // Gelöscht ist gelöscht, auch wenn das Neuladen danach scheitert.
      setListe([]);
      await laden();
    } catch (e) {
      setFehler(e instanceof Error ? e.message : 'Es wurde nichts gelöscht.');
    } finally {
      setSendet(false);
      fokusZurueck.current = true;
      setRueckfrage(false);
    }
  };

  if (ladefehler && !liste) return <Fehler text={ladefehler} />;
  if (!liste) return <Laden />;
  return (
    <RueckmeldungenAnsicht
      daten={{ liste, rueckfrage, sendet, meldung, fehler }}
      ueberschriftRef={ueberschrift}
      loeschenRef={loeschen}
      onLoeschen={() => {
        setMeldung(null);
        setRueckfrage(true);
      }}
      onBestaetigen={() => void bestaetigen()}
      onAbbrechen={abbrechen}
    />
  );
}
