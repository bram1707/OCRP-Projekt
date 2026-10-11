// Seite „Übersicht für Marie“: lädt die Übersicht, hört auf das Signal des Servers und lädt nach jeder
// Änderung neu (AK-44). Schreibt nie etwas (AK-46). Ändert sich die Übersicht von selbst, wird das
// angesagt, der Fokus bleibt aber, wo er ist, auch wenn eine Anlage dabei ihren Platz wechselt.

import { useCallback, useEffect, useRef, useState } from 'react';
import { EREIGNISSE, ladeMarie, type MarieUebersicht } from '../api.ts';
import { Fehler, Laden } from '../rahmen.tsx';
import type { MarieAuswahl } from '../route.ts';
import { aenderungsAnsage, uhrzeit } from './logik.ts';
import { MarieAnsicht } from './MarieAnsicht.tsx';

const auswahlSchluessel = (a: MarieAuswahl | null) => (a === null ? '' : a.art === 'zahl' ? `zahl:${a.zahl}` : `anlage:${a.anlageId}`);

/** Wie lange die Seite wartet, bevor sie eine endgültig geschlossene Verbindung selbst neu öffnet. */
const NEU_VERBINDEN_MS = 5000;

/** Wo der Fokus vor dem Neuladen stand: Karte, Zahl oder Zeile (über ihr data-Attribut) und das Element darin. */
interface FokusOrt {
  behaelter: string | null;
  element: 'a' | 'summary' | null;
  inListe: boolean;
}

const BEHAELTER = ['data-marie-label', 'data-marie-anlage', 'data-zahl'] as const;

function merkeFokus(): FokusOrt | null {
  const aktiv = document.activeElement;
  if (!aktiv || aktiv === document.body) return null;
  const inListe = document.querySelector('[data-auswahl]')?.contains(aktiv) ?? false;
  for (const attribut of BEHAELTER) {
    const behaelter = aktiv.closest(`[${attribut}]`);
    if (!behaelter) continue;
    const tag = aktiv.tagName.toLowerCase();
    return { behaelter: `[${attribut}="${CSS.escape(behaelter.getAttribute(attribut) ?? '')}"]`, element: tag === 'a' || tag === 'summary' ? tag : null, inListe };
  }
  return { behaelter: null, element: null, inListe };
}

export function MarieSeite({ auswahl, onAnsage }: { auswahl: MarieAuswahl | null; onAnsage: (text: string) => void }) {
  const [daten, setDaten] = useState<MarieUebersicht | null>(null);
  const [ladefehler, setLadefehler] = useState<string | null>(null);
  const [aktualisiert, setAktualisiert] = useState<string | null>(null);
  const [verbunden, setVerbunden] = useState(true);
  const ueberschrift = useRef<HTMLHeadingElement>(null);
  const auswahlTitel = useRef<HTMLHeadingElement>(null);
  const anfrage = useRef(0);
  const letzte = useRef<MarieUebersicht | null>(null);
  const fokus = useRef<FokusOrt | null>(null);
  const ansage = useRef(onAnsage);
  ansage.current = onAnsage;

  const laden = useCallback(async () => {
    const nummer = ++anfrage.current;
    try {
      const neu = await ladeMarie();
      if (nummer !== anfrage.current) return;
      // Nur ansagen, wenn sich nach dem ersten Laden etwas geändert hat; Maries eigene Auswahl lädt nicht neu.
      const text = letzte.current ? aenderungsAnsage(letzte.current, neu) : null;
      if (text) ansage.current(text);
      letzte.current = neu;
      fokus.current = merkeFokus();
      setDaten(neu);
      setLadefehler(null);
      setAktualisiert(uhrzeit(new Date()));
    } catch (e) {
      if (nummer === anfrage.current) setLadefehler(e instanceof Error ? e.message : 'Unbekannter Fehler.');
    }
  }, []);

  useEffect(() => {
    void laden();
    // Signal nach jeder Änderung. Jede Nachricht lädt neu, auch die erste nach einem Wiederverbinden, die den
    // aktuellen Stand bringt; so geht keine Änderung aus der Lücke verloren.
    let quelle: EventSource | null = null;
    let wartet: ReturnType<typeof setTimeout> | undefined;
    const trenne = () => {
      clearTimeout(wartet);
      quelle?.close();
      quelle = null;
    };
    const verbinde = () => {
      trenne();
      const neu = new EventSource(EREIGNISSE);
      quelle = neu;
      neu.onmessage = () => void laden();
      neu.onopen = () => setVerbunden(true);
      neu.onerror = () => {
        setVerbunden(false);
        // Meist verbindet sich der Browser selbst neu. Hat er aufgegeben (etwa nach einer Fehlerantwort), selbst neu öffnen.
        if (neu.readyState === EventSource.CLOSED) wartet = setTimeout(verbinde, NEU_VERBINDEN_MS);
      };
    };
    verbinde();
    // Verdeckt: Verbindung schließen, denn Browser erlauben nur wenige offene Verbindungen je Server.
    // Wieder sichtbar: neu verbinden; die erste Nachricht bringt den Stand und lädt neu.
    const sichtbar = () => {
      if (document.visibilityState === 'hidden') trenne();
      else verbinde();
    };
    document.addEventListener('visibilitychange', sichtbar);
    return () => {
      trenne();
      document.removeEventListener('visibilitychange', sichtbar);
      // Eine Antwort, die erst nach dem Verlassen der Seite ankommt, wird verworfen und nicht mehr angesagt.
      anfrage.current++;
    };
  }, [laden]);

  // Fokus: beim ersten Anzeigen auf die Überschrift, nach einer Auswahl auf die Überschrift der Liste.
  // Beim automatischen Neuladen bleibt er, wo er ist.
  const geladen = daten !== null;
  const schluessel = auswahlSchluessel(auswahl);
  useEffect(() => {
    if (!geladen) return;
    if (schluessel === '') ueberschrift.current?.focus();
    else auswahlTitel.current?.focus();
  }, [geladen, schluessel]);

  // Nach dem Neuladen: Ging der Fokus verloren (eine Karte wurde umsortiert oder ein Label hat die Liste
  // verlassen), zurück auf dasselbe Element; gibt es das nicht mehr, auf die Überschrift der Liste.
  useEffect(() => {
    const ort = fokus.current;
    fokus.current = null;
    if (!ort || (document.activeElement && document.activeElement !== document.body)) return;
    const behaelter = ort.behaelter ? document.querySelector(ort.behaelter) : null;
    const ziel = behaelter && ort.element ? behaelter.querySelector<HTMLElement>(ort.element) : null;
    if (ziel) ziel.focus();
    else if (ort.inListe) auswahlTitel.current?.focus();
  }, [daten]);

  if (ladefehler && !daten) return <Fehler text={ladefehler} />;
  if (!daten) return <Laden />;
  return (
    <>
      {ladefehler && <Fehler text={ladefehler} />}
      <MarieAnsicht daten={{ daten, auswahl, aktualisiert, verbunden }} ueberschriftRef={ueberschrift} auswahlRef={auswahlTitel} />
    </>
  );
}
