// Max' Anlagen (#/anlagen): eine Karte je Anlage, gesperrte zuerst (AK-01, AK-21).

import { useEffect, useRef, useState } from 'react';
import { ladeAnlagen, type AnlageAnsicht } from '../api.ts';
import { aufgabeText, fortschritt, wartetHinweise } from './logik.ts';
import { Balken, Fehler, Laden, Marke } from '../rahmen.tsx';
import { zurAnlage } from '../route.ts';
import { sperreAnzeige } from '../status.ts';

export function AnlagenlisteAnsicht({ anlagen }: { anlagen: readonly AnlageAnsicht[] }) {
  // Gesperrte zuerst; innerhalb in der Reihenfolge des Servers (nach Name).
  const sortiert = [...anlagen].sort((a, b) => Number(b.gesperrt) - Number(a.gesperrt));
  const ueberschrift = useRef<HTMLHeadingElement>(null);
  useEffect(() => ueberschrift.current?.focus(), []);
  return (
    <>
      <h1 ref={ueberschrift} tabIndex={-1} className="mb-2 text-3xl font-bold">
        Anlagen
      </h1>
      <p className="mb-6 text-slate-700">Wählen Sie eine Anlage. Gesperrte Anlagen stehen oben.</p>
      <ul className="grid gap-4 md:grid-cols-2">
        {sortiert.map((a) => {
          const f = fortschritt(a);
          return (
            <li key={a.id}>
              <a
                href={zurAnlage(a.id)}
                className="block rounded-xl border-2 border-slate-400 bg-white p-5 text-slate-900 no-underline hover:border-blue-800"
                data-anlage={a.id}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-2xl font-bold">{a.name}</span>
                  <Marke anzeige={sperreAnzeige(a.gesperrt)} />
                </div>
                <div className="mt-3">{f.text}</div>
                <div className="mt-1">
                  <Balken prozent={f.prozent} beschriftung={`${a.name}: ${f.text}`} />
                </div>
                <div className="mt-3 font-semibold">{aufgabeText(a)}</div>
                {wartetHinweise(a).map((h) => (
                  <div key={h} className="mt-1 text-slate-700">
                    {h}
                  </div>
                ))}
              </a>
            </li>
          );
        })}
      </ul>
    </>
  );
}

export function Anlagenliste() {
  const [anlagen, setAnlagen] = useState<AnlageAnsicht[] | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  useEffect(() => {
    let aktiv = true;
    ladeAnlagen()
      .then((daten) => aktiv && setAnlagen(daten))
      .catch((e: Error) => aktiv && setFehler(e.message));
    return () => {
      aktiv = false;
    };
  }, []);
  if (fehler) return <Fehler text={fehler} />;
  if (!anlagen) return <Laden />;
  return <AnlagenlisteAnsicht anlagen={anlagen} />;
}
