// Simulation der Instandhaltung (nur im Prototyp, F4). Eigene Seite, nicht in Max' Ansichten:
// Hier werden gemeldete Labels „ausgetauscht“ und fehlende Fotos nachgereicht.

import { useCallback, useEffect, useRef, useState } from 'react';
import { ladeAnlage, ladeAnlagen, type LabelAnsicht } from '../api.ts';
import { Fehler, KNOPF_HAUPT, Laden, Marke } from '../rahmen.tsx';
import { STATUS_ANZEIGE } from '../status.ts';
import { reicheFotoNach, simuliereNachbesserung } from './aktionen.ts';

export interface Wartend {
  anlageName: string;
  label: LabelAnsicht;
}

export function SimulationAnsicht({
  wartend,
  speichert,
  meldung,
  fehler,
  onNachbessern,
  onFotoNachreichen,
}: {
  wartend: readonly Wartend[];
  speichert: boolean;
  meldung: string | null;
  fehler: string | null;
  onNachbessern: (labelId: string) => void;
  onFotoNachreichen: (labelId: string) => void;
}) {
  const ueberschrift = useRef<HTMLHeadingElement>(null);
  useEffect(() => ueberschrift.current?.focus(), []);
  return (
    <>
      <h1 ref={ueberschrift} tabIndex={-1} className="text-2xl font-semibold tracking-tight">
        Instandhaltung simulieren
      </h1>
      <p className="mt-2 max-w-3xl text-slate-800">
        Diese Seite gibt es nur im Prototyp. Sie ersetzt die Instandhaltung, die gemeldete Labels austauscht und fehlende Fotos
        nachreicht. Max nutzt sie nicht; die Labels kommen danach wieder in seine Prüfung.
      </p>
      <div role="status" aria-live="polite">
        {meldung && <p className="mt-4 rounded-lg border border-green-200 border-l-4 border-l-green-600 bg-green-50 px-4 py-3 text-green-950">{meldung}</p>}
      </div>
      {fehler && (
        <div className="mt-4">
          <Fehler text={fehler} />
        </div>
      )}
      {wartend.length === 0 ? (
        <p className="mt-6">Gerade wartet kein Label auf die Instandhaltung.</p>
      ) : (
        <ul className="mt-6 grid gap-4">
          {wartend.map(({ anlageName, label }) => (
            <li key={label.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white shadow-sm p-4" data-wartend={label.id}>
              <div>
                <p className="text-lg font-semibold">
                  {anlageName} · Label {label.id}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <Marke anzeige={STATUS_ANZEIGE[label.status]} />
                  <span>
                    {label.status === 'fehlerhaft'
                      ? `Gemeldet: ${label.letzterFehlergrundText ?? 'ohne Grund'}`
                      : 'Kein Foto vorhanden'}
                  </span>
                </div>
              </div>
              {label.status === 'fehlerhaft' ? (
                <button type="button" className={KNOPF_HAUPT} disabled={speichert} onClick={() => onNachbessern(label.id)}>
                  Nachbesserung simulieren
                </button>
              ) : (
                <button type="button" className={KNOPF_HAUPT} disabled={speichert} onClick={() => onFotoNachreichen(label.id)}>
                  Foto nachreichen
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export function Simulation() {
  const [wartend, setWartend] = useState<Wartend[] | null>(null);
  const [ladefehler, setLadefehler] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [meldung, setMeldung] = useState<string | null>(null);
  const [speichert, setSpeichert] = useState(false);
  const speichertRef = useRef(false);
  const fokusDanach = useRef(false);

  const laden = useCallback(async () => {
    const anlagen = await ladeAnlagen();
    const je = await Promise.all(anlagen.map((a) => ladeAnlage(a.id)));
    setWartend(
      // Außerhalb der Prüfung liefert der Server nur „Fehlerhaft“ und „Fehlt“.
      // Die Testanlage „Eigene Fotos“ bekommt neue Fotos nur über die Kamera-Seite.
      je
        .filter(({ anlage }) => anlage.id !== 'EIG1')
        .flatMap(({ anlage, ausserhalbDerPruefung }) => ausserhalbDerPruefung.map((label) => ({ anlageName: anlage.name, label }))),
    );
  }, []);

  useEffect(() => {
    laden().catch((e: Error) => setLadefehler(e.message));
  }, [laden]);

  async function schreibe(arbeit: () => Promise<unknown>, text: string): Promise<void> {
    if (speichertRef.current) return;
    speichertRef.current = true;
    setSpeichert(true);
    setFehler(null);
    try {
      await arbeit();
      setMeldung(text);
    } catch (e) {
      setFehler(e instanceof Error ? e.message : 'Unbekannter Fehler.');
    } finally {
      await laden().catch(() => undefined);
      speichertRef.current = false;
      fokusDanach.current = true;
      setSpeichert(false);
    }
  }

  // Die Zeile mit dem gedrückten Knopf ist weg; der Fokus geht auf den Knopf der nächsten Zeile oder die Überschrift.
  useEffect(() => {
    if (speichert || !fokusDanach.current) return;
    fokusDanach.current = false;
    (document.querySelector<HTMLElement>('[data-wartend] button') ?? document.querySelector<HTMLElement>('h1'))?.focus();
  }, [speichert, wartend]);

  if (ladefehler) return <Fehler text={ladefehler} />;
  if (!wartend) return <Laden />;
  return (
    <SimulationAnsicht
      wartend={wartend}
      speichert={speichert}
      meldung={meldung}
      fehler={fehler}
      onNachbessern={(id) => void schreibe(() => simuliereNachbesserung(id), `${id} nachgebessert. Es ist wieder in Max' Prüfung.`)}
      onFotoNachreichen={(id) => void schreibe(() => reicheFotoNach(id), `Foto für ${id} nachgereicht. Das Label ist jetzt in Max' Prüfung.`)}
    />
  );
}
