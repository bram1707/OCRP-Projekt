// Einstieg der Oberfläche: Seite nach der Adresse (route.ts), Meldungen über Seitenwechsel hinweg.

import { StrictMode, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AnlageSeite, type Navigation } from './pruefung/AnlageSeite.tsx';
import { LabelSeite } from './pruefung/LabelSeite.tsx';
import { MarieSeite } from './marie/MarieSeite.tsx';
import { Fehler, FENSTERTITEL, Rahmen, type MeldungDaten } from './rahmen.tsx';
import { leseRoute, zurStartseite } from './route.ts';
import { Simulation } from './simulation/Simulation.tsx';
import { Startseite } from './start/Startseite.tsx';
import './stil.css';

function App() {
  const [hash, setHash] = useState(() => window.location.hash);
  const [meldung, setMeldung] = useState<MeldungDaten | null>(null);
  // Wechselt die Seite durch eine Aktion, bleibt deren Meldung stehen; sonst verschwindet sie.
  const meldungBehalten = useRef(false);

  useEffect(() => {
    const wechsel = () => {
      setHash(window.location.hash);
      if (meldungBehalten.current) meldungBehalten.current = false;
      else setMeldung(null);
    };
    window.addEventListener('hashchange', wechsel);
    return () => window.removeEventListener('hashchange', wechsel);
  }, []);

  const nav: Navigation = {
    meldung,
    setMeldung,
    navigiere: (ziel, neueMeldung) => {
      setMeldung(neueMeldung);
      if (window.location.hash === ziel) return;
      meldungBehalten.current = true;
      window.location.hash = ziel;
    },
  };

  const route = leseRoute(hash);
  const bereich = route.seite === 'simulation' ? 'simulation' : route.seite === 'marie' ? 'marie' : 'max';
  // Eigener Fenstertitel je Rolle, damit zwei offene Fenster unterscheidbar sind.
  useEffect(() => {
    document.title = FENSTERTITEL[bereich];
  }, [bereich]);
  return (
    <Rahmen bereich={bereich} ansage={meldung?.text ?? null}>
      {route.seite === 'start' && <Startseite />}
      {route.seite === 'anlage' && <AnlageSeite key={route.anlageId} anlageId={route.anlageId} nav={nav} />}
      {route.seite === 'label' && <LabelSeite anlageId={route.anlageId} labelId={route.labelId} nav={nav} />}
      {route.seite === 'simulation' && <Simulation />}
      {route.seite === 'marie' && <MarieSeite auswahl={route.auswahl} onAnsage={(text) => setMeldung({ text })} />}
      {route.seite === 'unbekannt' && (
        <>
          <Fehler text="Diese Seite gibt es nicht." />
          <a href={zurStartseite()} className="font-semibold text-blue-800 underline">
            Zur Startseite
          </a>
        </>
      )}
    </Rahmen>
  );
}

createRoot(document.getElementById('app')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
