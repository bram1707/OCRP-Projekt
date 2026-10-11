// Maries Übersicht (AK-40 bis AK-45): vier Zahlen, Anlagen und alle Labels mit Grund, in einer Antwort,
// damit Zahlen und Listen immer zum selben Stand gehören. Nur lesend; nichts aus den Erwartungswerten (AK-61).

import { prozent } from '../ai/auffaelligkeit.ts';
import { SCHWELLE_OCR, SCHWELLE_SPRACHE } from '../ai/detectLanguage.ts';
import type { Anlage, Label, LetzteEntscheidung } from '../db/abfragen.ts';
import type { Ergebnis } from '../db/protokoll.ts';
import {
  FEHLERGRUND_TEXT, GRUPPE_MARIE, GRUPPEN_MARIE, istFehlergrund, pruefeFreigabe, RANG_MARIE, sortiereFuerMarie, STATUS_TEXT,
  type GruppeMarie, type Status,
} from '../db/status.ts';
import { anlageAnsicht, bewerteLabels, labelAnsicht, type LabelAnsicht } from './ansichten.ts';

export interface MarieLabel {
  /** Kennung des Labels; bei Labels ohne Datensatz ein eigener Schlüssel wie „SWR5-nicht-erfasst-1“ */
  schluessel: string;
  anlageId: string;
  anlageName: string;
  status: Status;
  gruppe: GruppeMarie;
  /** ein Satz für die Liste, z. B. „Von Max gemeldet (Label beschädigt), wartet auf Nachbesserung.“ */
  grund: string;
  /** Belege für den Status (AK-43), etwa Datum und Grund der Meldung oder die Schwellen der Erkennung */
  warum: string[];
  /** die Daten des Labels für Foto und Sprachbelege; null, wenn es laut Anlagenliste fehlt und keinen Datensatz hat */
  label: LabelAnsicht | null;
}

export interface MarieAnlage {
  id: string;
  name: string;
  sollAnzahl: number;
  /** größer von Soll-Anzahl und Zahl der Datensätze, damit jedes Label genau einmal zählt */
  gesamt: number;
  bestaetigt: number;
  gesperrt: boolean;
  gruppen: Record<GruppeMarie, number>;
  /** der dringendste Status unter den Labels der Anlage (AK-41) */
  dringendster: Status;
  /** warum die Anlage gesperrt oder freigegeben ist (AK-43) */
  warum: string[];
}

export interface MarieUebersicht {
  zahlen: { gesamt: number } & Record<GruppeMarie, number>;
  anlagen: MarieAnlage[];
  /** alle Labels aller Anlagen in Maries Reihenfolge (AK-41) */
  labels: MarieLabel[];
}

export interface AnlageMitDaten {
  anlage: Anlage;
  labels: readonly Label[];
}

type Entscheidungen = Partial<Record<Ergebnis, LetzteEntscheidung>>;

const DATUM = new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric' });

/**
 * „09.10.2026“, immer in deutscher Zeit, egal wo der Server läuft. Unlesbares bleibt, wie es ist.
 * Nur das Datum: Wann genau Max etwas entschieden hat, braucht Marie nicht; es steht im Protokoll (R13).
 */
export function datumText(iso: string): string {
  const datum = new Date(iso);
  if (Number.isNaN(datum.getTime())) return iso;
  const teile = Object.fromEntries(DATUM.formatToParts(datum).map((t) => [t.type, t.value]));
  return `${teile.day}.${teile.month}.${teile.year}`;
}

const WER: Record<string, string> = { max: 'Max', simulation: 'die simulierte Instandhaltung', kamera: 'die Kamera (eigenes Foto)' };
const wer = (e: LetzteEntscheidung) => WER[e.wer] ?? e.wer;

function fehlergrundText(grund: string | null | undefined): string | null {
  return istFehlergrund(grund) ? FEHLERGRUND_TEXT[grund] : null;
}

/** Ein Satz je Label für die Liste (AK-42). */
export function grundFuerMarie(l: LabelAnsicht, e: Entscheidungen = {}): string {
  const gemeldet = fehlergrundText(l.letzterFehlergrund);
  switch (l.status) {
    case 'fehlt':
      return 'Label nicht erfasst: kein Foto vorhanden.';
    case 'fehlerhaft':
      return `Von Max gemeldet${gemeldet ? ` (${gemeldet})` : ''}, wartet auf Nachbesserung.`;
    case 'unsicher':
      return `${l.hinweis ?? 'Erkennung nicht sicher.'} Max muss genau hinsehen.`;
    case 'nachgebessert':
      return `Nachgebessert${gemeldet ? ` nach Max' Meldung (${gemeldet})` : ''}, wartet auf erneute Prüfung durch Max.`;
    case 'offen':
      // Offen nach dem Zurücknehmen heißt: Max hatte schon geprüft, prüft aber erneut.
      return e.zurueckgenommen
        ? `Max hat seine Bestätigung am ${datumText(e.zurueckgenommen.wann)} zurückgenommen, wartet auf erneute Prüfung.`
        : 'Erfasst, von Max noch nicht geprüft.';
    case 'bestaetigt':
      return e.bestaetigt ? `Von ${wer(e.bestaetigt)} bestätigt am ${datumText(e.bestaetigt.wann)}.` : 'Von Max bestätigt.';
  }
}

/** Belege für den Status eines Labels (AK-43). Woran die Sprache erkannt wurde, zeigt die Oberfläche aus `label.belege`. */
export function warumStatus(l: LabelAnsicht, anlage: Anlage, e: Entscheidungen = {}): string[] {
  const meldung = e.fehler;
  const gemeldet = meldung ? `Max hat ${l.id} am ${datumText(meldung.wann)} gemeldet: ${fehlergrundText(meldung.grund) ?? 'ohne Grund'}.` : null;
  switch (l.status) {
    case 'fehlt':
      return [
        `Laut Anlagenliste gehören ${anlage.sollAnzahl} Labels zu ${anlage.name}. Für ${l.id} gibt es kein Foto.`,
        'Solange ein Label nicht erfasst ist, bleibt die Anlage gesperrt.',
      ];
    case 'fehlerhaft':
      return [gemeldet ?? `Max hat ${l.id} gemeldet.`, 'Nach der Nachbesserung kommt es als „Nachgebessert“ zurück in Max\' Prüfung.'];
    case 'unsicher': {
      const zeilen: string[] = [];
      const unsicher = l.sprachen.filter((s) => !s.sicher);
      if (l.sprachen.length === 0) zeilen.push('Die Erkennung hat keine Sprache sicher zuordnen können. Sie rät nie.');
      if (unsicher.length > 0) {
        zeilen.push(
          `${unsicher.map((s) => `${s.name} ${prozent(s.konfidenz)}`).join(', ')}: unter ${prozent(SCHWELLE_SPRACHE)} gilt eine Sprache als nicht sicher erkannt.`,
        );
      }
      if (l.ocrKonfidenz < SCHWELLE_OCR) {
        zeilen.push(`Texterkennung ${prozent(l.ocrKonfidenz)}: unter ${prozent(SCHWELLE_OCR)} gilt der Text als schlecht lesbar.`);
      }
      if (zeilen.length === 0) zeilen.push('Die Erkennung war nicht sicher.');
      zeilen.push('Deshalb muss Max dieses Label genau ansehen. Die Erkennung macht nur Vorschläge.');
      return zeilen;
    }
    case 'nachgebessert':
      return [
        gemeldet ?? `Max hat ${l.id} gemeldet.`,
        e.nachgebessert ? `Nachgebessert am ${datumText(e.nachgebessert.wann)}.` : 'Es wurde nachgebessert.',
        'Jetzt wartet es auf Max\' erneute Prüfung und zählt deshalb als offen.',
      ];
    case 'offen':
      return e.zurueckgenommen
        ? [`${wer(e.zurueckgenommen)} hat die Bestätigung von ${l.id} am ${datumText(e.zurueckgenommen.wann)} zurückgenommen.`, 'Jetzt wartet es auf Max\' erneute Prüfung.']
        : ['Das Foto ist erfasst. Max hat das Label noch nicht geprüft.'];
    case 'bestaetigt':
      return [e.bestaetigt ? `${wer(e.bestaetigt)} hat ${l.id} am ${datumText(e.bestaetigt.wann)} bestätigt.` : `Max hat ${l.id} bestätigt.`];
  }
}

/** Was ein Status für die Freigabe bedeutet, als Zusatz in „Warum gesperrt?“. */
const SPERRGRUND: Record<Exclude<Status, 'bestaetigt'>, string> = {
  fehlt: 'kein Foto',
  fehlerhaft: 'von Max gemeldet, wartet auf Nachbesserung',
  unsicher: 'Erkennung nicht sicher, Max muss genau hinsehen',
  nachgebessert: 'wartet auf erneute Prüfung durch Max',
  offen: 'wartet auf Max\' Prüfung',
};

/**
 * Warum eine Anlage gesperrt oder freigegeben ist (AK-43). Für Marie nach Status zusammengefasst, in ihrer
 * Rangfolge, statt eine Zeile je Label; Gründe ohne Label (etwa nicht erfasste) kommen von pruefeFreigabe.
 */
function warumAnlage(anlage: Anlage, labels: readonly Label[], gesperrt: boolean): string[] {
  const zeilen: string[] = [];
  if (labels.length > anlage.sollAnzahl) {
    zeilen.push(`Angelegt sind ${labels.length} Labels, laut Anlagenliste sind es ${anlage.sollAnzahl}. Gezählt werden alle ${labels.length}.`);
  }
  if (!gesperrt) {
    const am = anlage.freigegebenAm ? ` am ${datumText(anlage.freigegebenAm)}` : '';
    return [...zeilen, `Max hat die Anlage${am} freigegeben. Alle ${labels.length} Labels sind bestätigt.`];
  }
  const pruefung = pruefeFreigabe(anlage.sollAnzahl, labels);
  if (pruefung.moeglich) return [...zeilen, 'Alle Labels sind bestätigt. Max hat die Anlage noch nicht freigegeben.'];
  for (const status of (Object.keys(SPERRGRUND) as (keyof typeof SPERRGRUND)[]).sort((a, b) => RANG_MARIE[a] - RANG_MARIE[b])) {
    const ids = labels.filter((l) => l.status === status).map((l) => l.id);
    if (ids.length === 0) continue;
    const anzahl = ids.length === 1 ? '1 Label' : `${ids.length} Labels`;
    zeilen.push(`${anzahl} „${STATUS_TEXT[status]}“ (${SPERRGRUND[status]}): ${ids.join(', ')}.`);
  }
  return [...zeilen, ...pruefung.hinderungsgruende.filter((h) => h.labelId === null).map((h) => h.text)];
}

export function marieUebersicht(anlagen: readonly AnlageMitDaten[], entscheidungen: ReadonlyMap<string, Entscheidungen>): MarieUebersicht {
  const alleLabels: MarieLabel[] = [];
  const marieAnlagen: MarieAnlage[] = [];
  /** je Anlage: wie viele ihrer Labels den dringendsten Status haben (für die Reihenfolge) */
  const imDringendsten = new Map<string, number>();

  for (const { anlage, labels } of anlagen) {
    const bewertung = bewerteLabels(labels);
    const eigene: MarieLabel[] = labels.map((roh) => {
      const l = labelAnsicht(roh, bewertung.get(roh.id));
      const e = entscheidungen.get(roh.id) ?? {};
      return {
        schluessel: l.id,
        anlageId: anlage.id,
        anlageName: anlage.name,
        status: l.status,
        gruppe: GRUPPE_MARIE[l.status],
        grund: grundFuerMarie(l, e),
        warum: warumStatus(l, anlage, e),
        label: l,
      };
    });
    // Labels, die laut Anlagenliste fehlen und gar keinen Datensatz haben (AK-45).
    const ohneDatensatz = Math.max(0, anlage.sollAnzahl - labels.length);
    for (let i = 1; i <= ohneDatensatz; i++) {
      eigene.push({
        schluessel: `${anlage.id}-nicht-erfasst-${i}`,
        anlageId: anlage.id,
        anlageName: anlage.name,
        status: 'fehlt',
        gruppe: 'fehlerhaft',
        grund: 'Label nicht erfasst: laut Anlagenliste vorhanden, aber nicht fotografiert.',
        warum: [
          // „angelegt“: Auch ein Label ohne Foto (Status „Fehlt“) ist angelegt und steht schon als eigene Zeile da.
          `Laut Anlagenliste gehören ${anlage.sollAnzahl} Labels zu ${anlage.name}, angelegt sind nur ${labels.length}.`,
          'Solange ein Label nicht erfasst ist, bleibt die Anlage gesperrt.',
        ],
        label: null,
      });
    }

    const a = anlageAnsicht(anlage, labels);
    const gruppen = Object.fromEntries(GRUPPEN_MARIE.map((g) => [g, eigene.filter((x) => x.gruppe === g).length])) as Record<GruppeMarie, number>;
    const dringendster = eigene.reduce<Status>((d, x) => (RANG_MARIE[x.status] < RANG_MARIE[d] ? x.status : d), 'bestaetigt');
    imDringendsten.set(anlage.id, eigene.filter((x) => x.status === dringendster).length);
    marieAnlagen.push({
      id: anlage.id,
      name: anlage.name,
      sollAnzahl: anlage.sollAnzahl,
      gesamt: eigene.length,
      bestaetigt: a.bestaetigt,
      gesperrt: a.gesperrt,
      gruppen,
      dringendster,
      warum: warumAnlage(anlage, labels, a.gesperrt),
    });
    alleLabels.push(...eigene);
  }

  // Dringendste Anlage zuerst: nach ihrem dringendsten Status, dann gesperrte vor freigegebenen (eine
  // vollständig bestätigte, aber gesperrte Anlage braucht noch Max), dann wie viele Labels den dringendsten
  // Status haben, dann nach Name.
  const anzahlIm = (a: MarieAnlage) => imDringendsten.get(a.id) ?? 0;
  marieAnlagen.sort(
    (x, y) =>
      RANG_MARIE[x.dringendster] - RANG_MARIE[y.dringendster] ||
      Number(y.gesperrt) - Number(x.gesperrt) ||
      anzahlIm(y) - anzahlIm(x) ||
      x.name.localeCompare(y.name, 'de'),
  );

  const labelsSortiert = sortiereFuerMarie(alleLabels);
  const zaehle = (g: GruppeMarie) => labelsSortiert.filter((l) => l.gruppe === g).length;
  return {
    zahlen: { gesamt: labelsSortiert.length, offen: zaehle('offen'), erledigt: zaehle('erledigt'), fehlerhaft: zaehle('fehlerhaft') },
    anlagen: marieAnlagen,
    labels: labelsSortiert,
  };
}
