// Reine Hilfen für Maries Übersicht: Auswahl nach Zahl oder Anlage, Texte für Zahlen und „Warum?“.
// Gezählt wird nur auf dem Server; hier wird nur ausgewählt und beschrieben.

import type { GruppeMarie, MarieAnlage, MarieLabel, MarieUebersicht } from '../api.ts';
import { anzahl } from '../pruefung/logik.ts';
import type { MarieAuswahl, MarieZahl } from '../route.ts';
import { STATUS_ANZEIGE } from '../status.ts';

export const ZAHLEN: readonly MarieZahl[] = ['gesamt', 'offen', 'erledigt', 'fehlerhaft'];

export const ZAHL_TITEL: Record<MarieZahl, string> = {
  gesamt: 'Labels gesamt',
  offen: 'Offen',
  erledigt: 'Erledigt',
  fehlerhaft: 'Fehlerhaft',
};

/** Kurze Zeile unter der Zahl, damit klar ist, was mitgezählt wird (Widerspruch 6). */
export const ZAHL_ZUSATZ: Record<MarieZahl, string> = {
  gesamt: 'laut Anlagenliste',
  offen: 'inkl. nachgebessert',
  erledigt: 'von Max bestätigt',
  fehlerhaft: 'inkl. unsicher und nicht erfasst',
};

/** Die Regel hinter jeder Gruppe (AK-43). */
export const GRUPPE_REGEL: Record<GruppeMarie, string> = {
  offen:
    'Gezählt werden Labels, die Max noch prüfen muss: „Offen“ (noch nicht geprüft) und „Nachgebessert“ (nach einer Meldung ersetzt, wartet auf erneute Prüfung).',
  erledigt: 'Gezählt werden Labels, die Max bestätigt hat („Bestätigt“).',
  fehlerhaft:
    'Gezählt werden Labels, die Max als fehlerhaft gemeldet hat („Fehlerhaft“), bei denen die Erkennung nicht sicher war („Unsicher“) und die nicht erfasst sind („Fehlt“). Jedes davon hält seine Anlage gesperrt.',
};

export const labelsText = (n: number) => anzahl(n, 'Label', 'Labels');

/** Name des „Warum?“ an einer Zahl, z. B. „Warum 4 fehlerhaft?“; das Wort ist der Name der Zahl selbst. */
export function warumZahlText(daten: MarieUebersicht, zahl: MarieZahl): string {
  return `Warum ${daten.zahlen[zahl]} ${zahl}?`;
}

/**
 * Woraus sich „Offen“ und „Fehlerhaft“ zusammensetzen, mit den Statuswörtern der Liste, z. B.
 * „1 Fehlt · 1 Fehlerhaft · 2 Unsicher“; null, wenn es nichts aufzuteilen gibt.
 */
export function aufteilung(daten: MarieUebersicht, zahl: MarieZahl): string | null {
  if (zahl !== 'offen' && zahl !== 'fehlerhaft') return null;
  const je = new Map<string, number>();
  // Die Liste des Servers ist in Maries Rangfolge sortiert, die Reihenfolge der Teile folgt ihr.
  for (const l of daten.labels) if (l.gruppe === zahl) je.set(STATUS_ANZEIGE[l.status].wort, (je.get(STATUS_ANZEIGE[l.status].wort) ?? 0) + 1);
  if (je.size === 0) return null;
  // Geschütztes Leerzeichen: Zahl und Wort bleiben beim Umbruch zusammen.
  return [...je].map(([wort, n]) => `${n}\u00a0${wort}`).join(' · ');
}

/** Zeile unter „Labels gesamt“: Sind mehr Labels erfasst als laut Anlagenliste (M5), sagt sie das. */
export function gesamtZusatz(daten: MarieUebersicht): string {
  return daten.anlagen.some((a) => a.gesamt > a.sollAnzahl) ? 'mehr erfasst als laut Anlagenliste' : ZAHL_ZUSATZ.gesamt;
}

/** Labels je Anlage und die Summe aus den drei Gruppen (AK-40, AK-43); weicht eine Anlage von der Anlagenliste ab, steht deren Zahl dabei. */
export function gesamtRegel(daten: MarieUebersicht): string {
  const je = daten.anlagen
    .map((a) => `${a.name}: ${labelsText(a.gesamt)}${a.gesamt > a.sollAnzahl ? ` (laut Anlagenliste ${a.sollAnzahl})` : ''}`)
    .join('; ');
  const { gesamt, offen, erledigt, fehlerhaft } = daten.zahlen;
  return `Labels je Anlage: ${je}. Jedes Label zählt genau einmal: ${offen} offen + ${erledigt} erledigt + ${fehlerhaft} fehlerhaft = ${gesamt}.`;
}

/** Die Labels hinter einer Zahl oder Anlage, in Maries Reihenfolge (die Liste des Servers ist schon sortiert). */
export function auswahlLabels(daten: MarieUebersicht, auswahl: MarieAuswahl): MarieLabel[] {
  if (auswahl.art === 'anlage') return daten.labels.filter((l) => l.anlageId === auswahl.anlageId);
  if (auswahl.zahl === 'gesamt') return daten.labels;
  return daten.labels.filter((l) => l.gruppe === auswahl.zahl);
}

export function auswahlAnlage(daten: MarieUebersicht, auswahl: MarieAuswahl): MarieAnlage | null {
  return auswahl.art === 'anlage' ? (daten.anlagen.find((a) => a.id === auswahl.anlageId) ?? null) : null;
}

/** Überschrift der Liste, z. B. „Fehlerhaft: 4 Labels“ oder „Stanzanlage 4: 10 Labels“; null bei unbekannter Anlage. */
export function auswahlTitel(daten: MarieUebersicht, auswahl: MarieAuswahl): string | null {
  if (auswahl.art === 'anlage') {
    const a = auswahlAnlage(daten, auswahl);
    return a ? `${a.name}: ${labelsText(a.gesamt)}` : null;
  }
  return `${ZAHL_TITEL[auswahl.zahl]}: ${labelsText(daten.zahlen[auswahl.zahl])}`;
}

/** Text, wenn hinter einer Zahl keine Labels stehen. */
export const LEER: Record<MarieZahl, string> = {
  gesamt: 'Es sind keine Labels erfasst.',
  offen: 'Kein Label wartet auf Max.',
  erledigt: 'Noch kein Label ist bestätigt.',
  fehlerhaft: 'Kein Label ist fehlerhaft, unsicher oder nicht erfasst.',
};

/** Die Antwort auf Maries Frage „Ist alles geprüft?“ in einem Satz. */
export function antwort(daten: MarieUebersicht): string {
  const { gesamt, erledigt } = daten.zahlen;
  const gesperrt = daten.anlagen.filter((a) => a.gesperrt);
  if (gesamt > 0 && erledigt === gesamt) {
    if (gesperrt.length === 0) return `Ja. Alle ${labelsText(gesamt)} sind bestätigt und alle Anlagen freigegeben.`;
    return `Alle ${labelsText(gesamt)} sind bestätigt. Noch nicht freigegeben: ${gesperrt.map((a) => a.name).join(', ')}.`;
  }
  return `Nein. ${gesamt - erledigt} von ${labelsText(gesamt)} sind noch nicht erledigt.`;
}

export function fortschrittText(a: MarieAnlage): string {
  return `${a.bestaetigt} von ${a.gesamt} bestätigt`;
}

export function fortschrittProzent(a: MarieAnlage): number {
  return a.gesamt > 0 ? Math.floor((a.bestaetigt * 100) / a.gesamt) : 0;
}

/** „2 fehlerhaft · 2 offen · 1 erledigt“ in Maries Reihenfolge, ohne leere Gruppen. */
export function gruppenZeile(a: MarieAnlage): string {
  const teile = (['fehlerhaft', 'offen', 'erledigt'] as const).filter((g) => a.gruppen[g] > 0).map((g) => `${a.gruppen[g]}\u00a0${g}`);
  return teile.join(' · ');
}

/**
 * Ansage für Bildschirmleser, wenn sich die Übersicht von selbst ändert: die vier Zahlen und jede Anlage,
 * die freigegeben oder wieder gesperrt wurde. null, wenn sich daran nichts geändert hat.
 */
export function aenderungsAnsage(alt: MarieUebersicht, neu: MarieUebersicht): string | null {
  const zahlenGleich = ZAHLEN.every((z) => alt.zahlen[z] === neu.zahlen[z]);
  const sperren = neu.anlagen.flatMap((a) => {
    const vorher = alt.anlagen.find((x) => x.id === a.id);
    if (!vorher || vorher.gesperrt === a.gesperrt) return [];
    return [a.gesperrt ? `${a.name} ist wieder gesperrt.` : `${a.name} ist jetzt freigegeben.`];
  });
  if (zahlenGleich && sperren.length === 0) return null;
  const { gesamt, offen, erledigt, fehlerhaft } = neu.zahlen;
  return [`Neuer Stand: ${gesamt} gesamt, ${offen} offen, ${erledigt} erledigt, ${fehlerhaft} fehlerhaft.`, ...sperren].join(' ');
}
