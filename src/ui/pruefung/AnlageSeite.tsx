// Seite „Übersicht einer Anlage“: lädt die Daten, hält Filter und Kachel-Reihenfolge und schickt
// Max' Entscheidungen an den Server. Nach jedem Schreiben wird neu geladen; nichts wird vorab angenommen.

import { useCallback, useEffect, useRef, useState } from 'react';
import { ladeAnlage, ladeZusammenfassung, ServerFehler, type AnlageMitLabels, type Hinderungsgrund, type Zusammenfassung } from '../api.ts';
import { Fehler, Laden, type MeldungDaten } from '../rahmen.tsx';
import { zumLabel } from '../route.ts';
import { bestaetige, gebeFrei, nimmZurueck } from './aktionen.ts';
import { naechstesLabel, ordneStabil } from './logik.ts';
import { Uebersicht, type UebersichtEreignis } from './Uebersicht.tsx';

export interface Navigation {
  meldung: MeldungDaten | null;
  setMeldung: (m: MeldungDaten | null) => void;
  /** wechselt die Seite und behält dabei die Meldung */
  navigiere: (hash: string, meldung: MeldungDaten | null) => void;
}

function hinderungsgruende(details: unknown): Hinderungsgrund[] {
  return Array.isArray(details)
    ? details.filter((d): d is Hinderungsgrund => typeof d === 'object' && d !== null && typeof (d as Hinderungsgrund).text === 'string')
    : [];
}

export function AnlageSeite({ anlageId, nav }: { anlageId: string; nav: Navigation }) {
  const [daten, setDaten] = useState<AnlageMitLabels | null>(null);
  const [reihenfolge, setReihenfolge] = useState<string[] | null>(null);
  const [nurAuffaellige, setNurAuffaellige] = useState(false);
  const [speichert, setSpeichert] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ladefehler, setLadefehler] = useState<string | null>(null);
  const [zusammenfassung, setZusammenfassung] = useState<Zusammenfassung | null>(null);
  const [rueckfrage, setRueckfrage] = useState(false);
  const [freigabeFehler, setFreigabeFehler] = useState<{ text: string; gruende: Hinderungsgrund[] } | null>(null);
  const speichertRef = useRef(false);
  const ueberschrift = useRef<HTMLHeadingElement>(null);
  const abbrechen = useRef<HTMLButtonElement>(null);
  const freigebenKnopf = useRef<HTMLButtonElement>(null);

  const anfrage = useRef(0);

  const laden = useCallback(async () => {
    // Nur die Antwort auf die jüngste Anfrage zählt.
    const nummer = ++anfrage.current;
    const neu = await ladeAnlage(anlageId);
    const fertig = naechstesLabel(neu.labels) === null && neu.anlage.gesperrt;
    const zf = fertig ? await ladeZusammenfassung(anlageId) : null;
    if (nummer !== anfrage.current) return;
    setDaten(neu);
    // Die Reihenfolge des ersten Ladens bleibt, bis Max die Übersicht neu öffnet (AK-13).
    setReihenfolge((alt) => alt ?? neu.labels.map((l) => l.id));
    setZusammenfassung(zf);
  }, [anlageId]);

  /** Nach einer Entscheidung auf der Kachel bleibt der Fokus bei dieser Kachel (ist sie ausgeblendet: auf der Überschrift). */
  const fokusAufKachel = (labelId: string) =>
    requestAnimationFrame(() =>
      (document.querySelector<HTMLElement>(`[data-kachel="${CSS.escape(labelId)}"] a`) ?? ueberschrift.current)?.focus(),
    );

  useEffect(() => {
    setDaten(null);
    setReihenfolge(null);
    setLadefehler(null);
    laden().catch((e: Error) => setLadefehler(e.message));
  }, [laden]);

  // Beim Öffnen springt der Fokus auf die Überschrift.
  const geladen = daten !== null;
  useEffect(() => {
    if (geladen) ueberschrift.current?.focus();
  }, [geladen, anlageId]);

  useEffect(() => {
    if (rueckfrage) abbrechen.current?.focus();
  }, [rueckfrage]);

  // Nach dem Schließen der Rückfrage geht der Fokus zurück auf „Anlage freigeben“ (oder die Überschrift,
  // wenn der Knopf fehlt), sobald nichts mehr gespeichert wird und der Knopf wieder bedienbar ist.
  const fokusZurueck = useRef(false);
  const schliesseRueckfrage = () => {
    fokusZurueck.current = true;
    setRueckfrage(false);
  };
  useEffect(() => {
    if (rueckfrage || speichert || !fokusZurueck.current) return;
    fokusZurueck.current = false;
    (freigebenKnopf.current ?? ueberschrift.current)?.focus();
  }, [rueckfrage, speichert]);

  useEffect(() => {
    if (!rueckfrage) return;
    const taste = (e: KeyboardEvent) => {
      if (e.key === 'Escape') schliesseRueckfrage();
    };
    document.addEventListener('keydown', taste);
    return () => document.removeEventListener('keydown', taste);
  }, [rueckfrage]);

  /** Genau ein schreibender Aufruf zur Zeit; weitere Klicks werden verworfen. `danach` läuft auch nach einem Fehler. */
  async function schreibe(arbeit: () => Promise<void>, danach?: () => void): Promise<void> {
    if (speichertRef.current) return;
    speichertRef.current = true;
    setSpeichert(true);
    setFehler(null);
    setFreigabeFehler(null);
    try {
      await arbeit();
    } catch (e) {
      setFehler(e instanceof Error ? e.message : 'Unbekannter Fehler.');
      await laden().catch(() => undefined);
    } finally {
      speichertRef.current = false;
      setSpeichert(false);
      danach?.();
    }
  }

  function ereignis(e: UebersichtEreignis): void {
    switch (e.art) {
      case 'filter':
        setNurAuffaellige(e.nurAuffaellige);
        return;
      case 'starten': {
        const erstes = daten && naechstesLabel(daten.labels);
        if (erstes) nav.navigiere(zumLabel(anlageId, erstes.id), null);
        return;
      }
      case 'bestaetigen': {
        setRueckfrage(false);
        // Die bestätigte Kachel wandert in die Zeile „bestätigt“; der Fokus geht auf die Kachel, die an ihre Stelle rückt.
        const offene = ordneStabil(daten?.labels ?? [], reihenfolge).filter((l) => l.status !== 'bestaetigt');
        const platz = offene.findIndex((l) => l.id === e.labelId);
        const danach = offene[platz + 1] ?? offene[platz - 1];
        void schreibe(
          async () => {
            await bestaetige(e.labelId);
            nav.setMeldung({ text: `${e.labelId} bestätigt. Es steht jetzt unten unter „bestätigt“.` });
            await laden();
          },
          () => fokusAufKachel(danach?.id ?? e.labelId),
        );
        return;
      }
      case 'rueckgaengig':
        // Eine offene Rückfrage zur Freigabe gilt danach nicht mehr.
        setRueckfrage(false);
        void schreibe(
          async () => {
            await nimmZurueck(e.labelId);
            nav.setMeldung({ text: `Bestätigung von ${e.labelId} zurückgenommen.` });
            await laden();
          },
          () => fokusAufKachel(e.labelId),
        );
        return;
      case 'freigeben':
        setFreigabeFehler(null);
        setRueckfrage(true);
        return;
      case 'freigabeAbbrechen':
        schliesseRueckfrage();
        return;
      case 'freigabeBestaetigen':
        void schreibe(async () => {
          try {
            await gebeFrei(anlageId);
            setRueckfrage(false);
            nav.setMeldung({ text: `${daten?.anlage.name ?? anlageId} ist freigegeben.` });
            await laden();
            ueberschrift.current?.focus();
          } catch (fehlerFreigabe) {
            if (fehlerFreigabe instanceof ServerFehler) {
              setFreigabeFehler({ text: fehlerFreigabe.message, gruende: hinderungsgruende(fehlerFreigabe.details) });
              await laden();
              schliesseRueckfrage();
              return;
            }
            throw fehlerFreigabe;
          }
        });
        return;
    }
  }

  if (ladefehler) return <Fehler text={ladefehler} />;
  if (!daten) return <Laden />;
  return (
    <Uebersicht
      zustand={{
        daten,
        kacheln: ordneStabil(daten.labels, reihenfolge),
        nurAuffaellige,
        speichert,
        meldung: nav.meldung,
        fehler,
        zusammenfassung,
        rueckfrage,
        freigabeFehler,
      }}
      ereignis={ereignis}
      ueberschriftRef={ueberschrift}
      abbrechenRef={abbrechen}
      freigebenRef={freigebenKnopf}
    />
  );
}
