// Seite „Einzelansicht“: lädt Label und Anlage, führt den Entscheidungsablauf (logik.ts → ablauf)
// und öffnet nach einer Entscheidung das nächste offene Label (F3).

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Fehlergrund } from '../../db/status.ts';
import { ladeAnlage, ladeLabel, ServerFehler, type AnlageMitLabels, type LabelAnsicht } from '../api.ts';
import { Fehler, Laden } from '../rahmen.tsx';
import { zumLabel, zurAnlage } from '../route.ts';
import { bestaetige, meldeFehler, nimmZurueck } from './aktionen.ts';
import type { Navigation } from './AnlageSeite.tsx';
import { Einzelansicht, type EinzelEreignis } from './Einzelansicht.tsx';
import { ablauf, FEHLERGRUENDE, naechstesLabel, type Ablauf, type AblaufEreignis } from './logik.ts';

export function LabelSeite({ anlageId, labelId, nav }: { anlageId: string; labelId: string; nav: Navigation }) {
  const [daten, setDaten] = useState<{ anlage: AnlageMitLabels; label: LabelAnsicht } | null>(null);
  const [ladefehler, setLadefehler] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [zustand, setZustand] = useState<Ablauf>('laedt');
  const [warumOffen, setWarumOffen] = useState(false);
  const [fotoGross, setFotoGross] = useState(false);
  const [fotoFehlt, setFotoFehlt] = useState(false);
  // Der Ablauf steht zusätzlich in einer Ref, damit zwei Klicks im selben Augenblick ihn nicht doppelt durchlaufen.
  const zustandRef = useRef<Ablauf>('laedt');
  // Ebenso, ob das Foto fehlt: dann gibt es kein Bestätigen und kein Melden, Zurücknehmen aber schon.
  const fotoFehltRef = useRef(false);
  const ueberschrift = useRef<HTMLHeadingElement>(null);
  const gruende = useRef<HTMLHeadingElement>(null);
  const bild = useRef<HTMLImageElement>(null);
  const anfrage = useRef(0);

  const schritt = useCallback((e: AblaufEreignis): boolean => {
    const r = ablauf(zustandRef.current, e);
    zustandRef.current = r.zustand;
    setZustand(r.zustand);
    return r.senden;
  }, []);

  /** Das Foto lädt nicht: Die Seite ist trotzdem fertig angezeigt, nur entscheiden kann Max ohne Foto nicht. */
  const fotoLaedtNicht = useCallback(() => {
    fotoFehltRef.current = true;
    setFotoFehlt(true);
    schritt('angezeigt');
  }, [schritt]);

  const laden = useCallback(async () => {
    const nummer = ++anfrage.current;
    zustandRef.current = 'laedt';
    setZustand('laedt');
    fotoFehltRef.current = false;
    setFotoFehlt(false);
    const [anlage, label] = await Promise.all([ladeAnlage(anlageId), ladeLabel(labelId)]);
    if (nummer !== anfrage.current) return;
    if (label.anlageId !== anlageId) throw new Error(`Label ${label.id} gehört nicht zu dieser Anlage.`);
    setDaten({ anlage, label });
    // Ohne Foto gibt es nichts abzuwarten; ist das Foto schon im Speicher, kommt kein neues „load“.
    // Ein kaputtes Foto ist ebenfalls „complete“, hat aber keine Breite: dann bleiben die Entscheidungsknöpfe gesperrt.
    requestAnimationFrame(() => {
      if (nummer !== anfrage.current) return;
      if (label.bildUrl === null) schritt('angezeigt');
      else if (bild.current?.complete) {
        if (bild.current.naturalWidth > 0) schritt('angezeigt');
        else fotoLaedtNicht();
      }
    });
  }, [anlageId, labelId, schritt, fotoLaedtNicht]);

  useEffect(() => {
    setDaten(null);
    setLadefehler(null);
    setFehler(null);
    setWarumOffen(false);
    setFotoGross(false);
    laden().catch((e: Error) => setLadefehler(e.message));
  }, [laden]);

  // Nach jedem Wechsel des Labels springt der Fokus auf die Überschrift, nie auf einen Knopf.
  const geladeneId = daten?.label.id;
  useEffect(() => {
    if (geladeneId) ueberschrift.current?.focus();
  }, [geladeneId]);

  useEffect(() => {
    if (zustand === 'gruende') gruende.current?.focus();
  }, [zustand]);

  useEffect(() => {
    if (zustand !== 'gruende') return;
    const taste = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      schritt('abbrechen');
      ueberschrift.current?.focus();
    };
    document.addEventListener('keydown', taste);
    return () => document.removeEventListener('keydown', taste);
  }, [zustand, schritt]);

  /**
   * Nach einem Fehler beim Speichern: Meldung zeigen und, wenn der Server geantwortet hat, den aktuellen Stand
   * neu laden (etwa wenn das Label inzwischen anderswo entschieden wurde). Der Fokus geht auf die Überschrift.
   */
  async function zeigeFehler(e: unknown): Promise<void> {
    schritt('fehlgeschlagen');
    setFehler(e instanceof Error ? e.message : 'Unbekannter Fehler.');
    if (e instanceof ServerFehler && e.status !== 0) await laden().catch((f: Error) => setLadefehler(f.message));
    ueberschrift.current?.focus();
  }

  /** Speichert eine Entscheidung und öffnet danach das nächste offene Label oder die Übersicht. */
  async function entscheide(arbeit: () => Promise<unknown>, meldungText: string, rueckgaengig?: string): Promise<void> {
    setFehler(null);
    try {
      await arbeit();
    } catch (e) {
      await zeigeFehler(e);
      return;
    }
    schritt('gespeichert');
    const meldung = { text: meldungText, rueckgaengig };
    try {
      const neu = await ladeAnlage(anlageId);
      const naechstes = naechstesLabel(neu.labels, labelId);
      nav.navigiere(naechstes ? zumLabel(anlageId, naechstes.id) : zurAnlage(anlageId), meldung);
    } catch {
      nav.navigiere(zurAnlage(anlageId), meldung);
    }
  }

  async function nimmZurueckUndZeige(id: string): Promise<void> {
    setFehler(null);
    try {
      await nimmZurueck(id);
    } catch (e) {
      await zeigeFehler(e);
      return;
    }
    schritt('gespeichert');
    const meldung = { text: `Bestätigung von ${id} zurückgenommen.` };
    if (id === labelId) {
      nav.setMeldung(meldung);
      await laden().catch((e: Error) => setLadefehler(e.message));
      // Der Knopf „Bestätigung zurücknehmen“ ist weg; der Fokus geht wie bei jedem Label auf die Überschrift.
      ueberschrift.current?.focus();
    } else {
      nav.navigiere(zumLabel(anlageId, id), meldung);
    }
  }

  function ereignis(e: EinzelEreignis): void {
    switch (e.art) {
      case 'bildGeladen':
        schritt('angezeigt');
        return;
      case 'bildFehlt':
        fotoLaedtNicht();
        return;
      case 'warum':
        setWarumOffen((w) => !w);
        return;
      case 'foto':
        setFotoGross((g) => !g);
        return;
      case 'melden':
        if (!fotoFehltRef.current) schritt('melden');
        return;
      case 'abbrechen':
        schritt('abbrechen');
        ueberschrift.current?.focus();
        return;
      case 'bestaetigen':
        if (!fotoFehltRef.current && schritt('bestaetigen')) void entscheide(() => bestaetige(labelId), `${labelId} bestätigt.`, labelId);
        return;
      case 'grund': {
        const grund: Fehlergrund = e.grund;
        const titel = FEHLERGRUENDE.find((g) => g.grund === grund)?.titel ?? grund;
        if (!fotoFehltRef.current && schritt('grundGewaehlt')) {
          void entscheide(() => meldeFehler(labelId, grund), `${labelId} gemeldet (${titel}). Es kommt nach der Nachbesserung zurück.`);
        }
        return;
      }
      case 'zuruecknehmen':
        if (schritt('zuruecknehmen')) void nimmZurueckUndZeige(labelId);
        return;
      case 'rueckgaengig':
        if (schritt('zuruecknehmen')) void nimmZurueckUndZeige(e.labelId);
        return;
    }
  }

  if (ladefehler) return <Fehler text={ladefehler} />;
  if (!daten) return <Laden />;
  return (
    <Einzelansicht
      daten={{ anlage: daten.anlage.anlage, label: daten.label, zustand, warumOffen, fotoGross, fotoFehlt, fehler, meldung: nav.meldung }}
      ereignis={ereignis}
      ueberschriftRef={ueberschrift}
      gruendeRef={gruende}
      bildRef={bild}
    />
  );
}
