// Übersetzt Datenbankzeilen in die Antworten der Schnittstelle.
// Hier landet nichts aus den Erwartungswerten der Testdaten (AK-61).

import { bewerteAnlage, type Auffaelligkeit, type Grund } from '../ai/auffaelligkeit.ts';
import { findeBelege, type Beleg } from '../ai/belege.ts';
import { bedeutungen, type Bedeutung } from '../ai/glossar.ts';
import { istSpracheUnsicher, SCHWELLE_OCR, SCHWELLE_SPRACHE } from '../ai/detectLanguage.ts';
import { sprachName } from '../ai/sprachen.ts';
import type { Anlage, Label } from '../db/abfragen.ts';
import {
  FEHLERGRUND_TEXT, IN_MAX_LISTE, istGesperrt, PRUEFBAR, pruefeFreigabe, sortiereFuerMax, STATUS, STATUS_TEXT,
  type Hinderungsgrund, type Status,
} from '../db/status.ts';

export interface LabelAnsicht {
  id: string;
  anlageId: string;
  bildUrl: string | null;
  ocrText: string;
  ocrKonfidenz: number;
  sprachen: { code: string; name: string; konfidenz: number; sicher: boolean }[];
  sprachKonfidenz: number;
  /** „Sprache nicht sicher erkannt“ usw., null wenn alles sicher ist */
  hinweis: string | null;
  prioritaet: 'genau_pruefen' | 'normal';
  begruendung: string;
  status: Status;
  statusText: string;
  letzterFehlergrund: string | null;
  letzterFehlergrundText: string | null;
  auffaellig: boolean;
  gruende: Grund[];
  /** Fundstellen für den „Warum?“-Knopf */
  belege: Beleg[];
  /** Was erkannte fremde Warnbegriffe auf Deutsch bedeuten (kleines Wörterbuch, Optimierung 2) */
  bedeutungen: Bedeutung[];
}

export interface AnlageAnsicht {
  id: string;
  name: string;
  sollAnzahl: number;
  erfasst: number;
  zaehlung: Record<Status, number>;
  /** Labels, die Max jetzt prüfen kann (Offen, Unsicher, Nachgebessert), aufgeteilt nach auffällig/unauffällig (AK-17) */
  auffaellig: number;
  unauffaellig: number;
  bestaetigt: number;
  gesperrt: boolean;
  freigabeMoeglich: boolean;
  freigegebenAm: string | null;
  freigegebenVon: string | null;
}

export function bewerteLabels(labels: readonly Label[]): Map<string, Auffaelligkeit> {
  return bewerteAnlage(labels.map((l) => ({ ...l, hatFoto: l.bildPfad !== null })));
}

function hinweis(l: Label): string | null {
  if (l.bildPfad === null) return 'Label nicht erfasst.';
  const teile: string[] = [];
  if (istSpracheUnsicher(l.sprachKonfidenz, l.sprachen)) teile.push('Sprache nicht sicher erkannt.');
  if (l.ocrKonfidenz < SCHWELLE_OCR) teile.push('Text schlecht lesbar.');
  return teile.length > 0 ? teile.join(' ') : null;
}

export function labelAnsicht(l: Label, a: Auffaelligkeit | undefined): LabelAnsicht {
  const auffaellig = a?.auffaellig ?? false;
  const belege = findeBelege(l.ocrText).flatMap((t) => t.belege).sort((x, y) => x.start - y.start);
  return {
    id: l.id,
    anlageId: l.anlageId,
    bildUrl: l.bildPfad === null ? null : `/bilder/${l.bildPfad}`,
    ocrText: l.ocrText,
    ocrKonfidenz: l.ocrKonfidenz,
    sprachen: l.sprachen
      .filter((code) => code !== 'unbekannt')
      .map((code) => {
        const konfidenz = l.konfidenzJeSprache[code] ?? 0;
        return { code, name: sprachName(code), konfidenz, sicher: konfidenz >= SCHWELLE_SPRACHE };
      }),
    sprachKonfidenz: l.sprachKonfidenz,
    hinweis: hinweis(l),
    // Auffällige Labels sind immer „genau prüfen“, auch bei abweichender Sprachkombination (AK-32).
    prioritaet: auffaellig ? 'genau_pruefen' : l.prioritaet,
    begruendung: l.begruendung,
    status: l.status,
    statusText: STATUS_TEXT[l.status],
    letzterFehlergrund: l.letzterFehlergrund,
    letzterFehlergrundText: l.letzterFehlergrund ? FEHLERGRUND_TEXT[l.letzterFehlergrund] : null,
    auffaellig,
    gruende: a?.gruende ?? [],
    belege,
    bedeutungen: bedeutungen(belege),
  };
}

function ansichtenSortiert(labels: readonly Label[], status: readonly Status[]): LabelAnsicht[] {
  const bewertung = bewerteLabels(labels);
  return sortiereFuerMax(labels.filter((l) => status.includes(l.status)).map((l) => labelAnsicht(l, bewertung.get(l.id))));
}

/** Max' Liste in Relevanz-Reihenfolge (AK-13, AK-19, AK-32), ohne fehlerhafte und fehlende Labels. */
export function labelsFuerMax(labels: readonly Label[]): LabelAnsicht[] {
  return ansichtenSortiert(labels, IN_MAX_LISTE);
}

/**
 * Labels, die Max gerade nicht prüfen kann: in Nachbesserung (Fehlerhaft) oder ohne Foto (Fehlt).
 * Labels, die laut Anlagenliste fehlen und gar keinen Datensatz haben, stehen nur in
 * `zaehlung.fehlt` und in den offenen Punkten der Zusammenfassung.
 */
export function labelsAusserhalbDerPruefung(labels: readonly Label[]): LabelAnsicht[] {
  return ansichtenSortiert(labels, ['fehlerhaft', 'fehlt']);
}

export function anlageAnsicht(anlage: Anlage, labels: readonly Label[]): AnlageAnsicht {
  const bewertung = bewerteLabels(labels);
  const zaehlung = Object.fromEntries(STATUS.map((s) => [s, 0])) as Record<Status, number>;
  for (const l of labels) zaehlung[l.status] += 1;
  // Labels, die laut Anlagenliste fehlen und gar keinen Datensatz haben, zählen ebenfalls als „Fehlt“.
  zaehlung.fehlt += Math.max(0, anlage.sollAnzahl - labels.length);

  // Die Zählzeile beschreibt, was Max jetzt prüfen kann; Fehlerhaft und Fehlt stehen in `zaehlung`.
  const zuPruefen = labels.filter((l) => PRUEFBAR.includes(l.status));
  const auffaellig = zuPruefen.filter((l) => bewertung.get(l.id)?.auffaellig).length;
  return {
    id: anlage.id,
    name: anlage.name,
    sollAnzahl: anlage.sollAnzahl,
    erfasst: labels.filter((l) => l.bildPfad !== null).length,
    zaehlung,
    auffaellig,
    unauffaellig: zuPruefen.length - auffaellig,
    bestaetigt: zaehlung.bestaetigt,
    gesperrt: istGesperrt(anlage.freigegebenAm, anlage.sollAnzahl, labels),
    freigabeMoeglich: pruefeFreigabe(anlage.sollAnzahl, labels).moeglich,
    freigegebenAm: anlage.freigegebenAm,
    freigegebenVon: anlage.freigegebenVon,
  };
}

export interface Zusammenfassung {
  anlageId: string;
  name: string;
  anzahlLabels: number;
  sollAnzahl: number;
  /** sicher erkannte Sprachen aller Labels */
  sprachen: { code: string; name: string }[];
  /** wie viele Labels auffällig waren (auch wenn schon bestätigt) */
  auffaellig: number;
  nachgebessert: number;
  offenePunkte: Hinderungsgrund[];
  freigabeMoeglich: boolean;
  gesperrt: boolean;
}

/** Zusammenfassung vor der Freigabe (AK-02). */
export function zusammenfassung(anlage: Anlage, labels: readonly Label[]): Zusammenfassung {
  const bewertung = bewerteLabels(labels);
  // Nur sicher erkannte Sprachen zählen als „gefunden“; unsichere Vorschläge stehen beim Label.
  const codes = new Set(
    labels
      .filter((l) => l.bildPfad !== null)
      .flatMap((l) => Object.entries(l.konfidenzJeSprache))
      .filter(([, k]) => k >= SCHWELLE_SPRACHE)
      .map(([code]) => code),
  );
  const pruefung = pruefeFreigabe(anlage.sollAnzahl, labels);
  return {
    anlageId: anlage.id,
    name: anlage.name,
    anzahlLabels: labels.length,
    sollAnzahl: anlage.sollAnzahl,
    sprachen: [...codes].sort().map((code) => ({ code, name: sprachName(code) })),
    auffaellig: labels.filter((l) => bewertung.get(l.id)?.auffaellig).length,
    nachgebessert: labels.filter((l) => l.nachgebessert).length,
    offenePunkte: pruefung.hinderungsgruende,
    freigabeMoeglich: pruefung.moeglich,
    gesperrt: istGesperrt(anlage.freigegebenAm, anlage.sollAnzahl, labels),
  };
}
