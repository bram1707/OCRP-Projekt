// Reine Funktionen der Prüfoberfläche, ohne React und ohne Netz, damit sie einzeln testbar sind.

import type { GrundCode } from '../../ai/auffaelligkeit.ts';
import type { Fehlergrund } from '../../db/status.ts';
import type { AnlageAnsicht, Beleg, Grund, LabelAnsicht } from '../api.ts';
import { istPruefbar } from '../status.ts';

/**
 * Prozent abgerundet, wie auf dem Server: 0,896 erscheint als „89 %“, nie als „90 %“.
 * Das Runden auf vier Stellen davor fängt Gleitkomma-Reste ab (0,29 · 100 = 28,999…).
 */
export function prozent(wert: number): string {
  return `${Math.floor(Math.round(wert * 10_000) / 100)} %`;
}

/** „1 Label“, „10 Labels“ */
export function anzahl(n: number, einzahl: string, mehrzahl: string): string {
  return `${n} ${n === 1 ? einzahl : mehrzahl}`;
}

/** Fortschritt nur aus den Zahlen des Servers (AK-12, AK-21). */
export function fortschritt(a: AnlageAnsicht): { text: string; prozent: number } {
  return {
    text: `${a.bestaetigt} von ${a.sollAnzahl} bestätigt`,
    prozent: a.sollAnzahl > 0 ? Math.floor((a.bestaetigt * 100) / a.sollAnzahl) : 0,
  };
}

/**
 * Zählzeile (AK-17), z. B. „10 Labels: 3 auffällig, 6 unauffällig, 1 bestätigt“.
 * Labels in Nachbesserung und ohne Foto stehen mit darin, damit die Summe die Soll-Anzahl ergibt.
 */
export function zaehlzeile(a: AnlageAnsicht): string {
  const teile = [`${a.auffaellig} auffällig`, `${a.unauffaellig} unauffällig`, `${a.bestaetigt} bestätigt`];
  const inNachbesserung = a.zaehlung.fehlerhaft;
  if (inNachbesserung > 0) teile.push(`${inNachbesserung} ${inNachbesserung === 1 ? 'wartet' : 'warten'} auf Nachbesserung`);
  if (a.zaehlung.fehlt > 0) teile.push(`${a.zaehlung.fehlt} ohne Foto`);
  return `${anzahl(a.sollAnzahl, 'Label', 'Labels')}: ${teile.join(', ')}`;
}

/** Was Max in der Liste der Anlagen zu tun hat. */
export function aufgabeText(a: AnlageAnsicht): string {
  const offen = a.auffaellig + a.unauffaellig;
  if (!a.gesperrt) return 'Freigegeben, nichts mehr zu tun';
  if (offen > 0) return `Noch ${anzahl(offen, 'Label', 'Labels')} für Sie`;
  if (a.freigabeMoeglich) return 'Alles bestätigt: bereit zur Freigabe';
  return 'Für Sie gerade nichts zu tun';
}

/** Hinweise zu Labels, die Max gerade nicht prüfen kann. */
export function wartetHinweise(a: AnlageAnsicht): string[] {
  const hinweise: string[] = [];
  const f = a.zaehlung.fehlerhaft;
  if (f > 0) hinweise.push(`${anzahl(f, 'Label wartet', 'Labels warten')} auf Nachbesserung`);
  if (a.zaehlung.fehlt > 0) hinweise.push(`${anzahl(a.zaehlung.fehlt, 'Label', 'Labels')} ohne Foto`);
  return hinweise;
}

/** Auffällig und noch zu prüfen; bestätigte Labels gelten beim Filter als erledigt (AK-18). */
export function istAuffaelligOffen(l: LabelAnsicht): boolean {
  return l.auffaellig && istPruefbar(l.status);
}

export function filtere(labels: readonly LabelAnsicht[], nurAuffaellige: boolean): { sichtbar: LabelAnsicht[]; ausgeblendet: number } {
  const sichtbar = nurAuffaellige ? labels.filter(istAuffaelligOffen) : [...labels];
  return { sichtbar, ausgeblendet: labels.length - sichtbar.length };
}

/**
 * Hält die Kacheln an ihrem Platz, bis Max die Übersicht neu öffnet (AK-13): Reihenfolge des
 * ersten Ladens; neue Labels kommen in der Reihenfolge des Servers ans Ende.
 */
export function ordneStabil(labels: readonly LabelAnsicht[], reihenfolge: readonly string[] | null): LabelAnsicht[] {
  if (!reihenfolge) return [...labels];
  const platz = new Map(reihenfolge.map((id, i) => [id, i]));
  const rest = reihenfolge.length;
  return [...labels].sort((a, b) => (platz.get(a.id) ?? rest) - (platz.get(b.id) ?? rest));
}

/** Das relevanteste Label, das Max jetzt prüfen kann, in der Reihenfolge des Servers. */
export function naechstesLabel(labels: readonly LabelAnsicht[], ohne?: string): LabelAnsicht | null {
  return labels.find((l) => istPruefbar(l.status) && l.id !== ohne) ?? null;
}

const GRUND_RANG: readonly GrundCode[] = ['nachgebessert', 'unsicher_sprache', 'unsicher_ocr', 'text_unleserlich', 'abweichende_sprachen'];

/** Der eine Satz für die Kachel (AK-19) und wie viele Gründe es außerdem gibt. */
export function hauptgrund(gruende: readonly Grund[]): { text: string; weitere: string | null } | null {
  const rang = (g: Grund) => {
    const i = GRUND_RANG.indexOf(g.code);
    return i === -1 ? GRUND_RANG.length : i;
  };
  const erster = [...gruende].sort((a, b) => rang(a) - rang(b))[0];
  if (!erster) return null;
  const n = gruende.length - 1;
  return { text: erster.text, weitere: n === 0 ? null : n === 1 ? 'und 1 weiterer Grund' : `und ${n} weitere Gründe` };
}

/** Die ersten Wörter für die Kachel. */
export function ersteWoerter(text: string, anzahlWoerter = 6): string {
  const woerter = text.split(/\s+/).filter(Boolean);
  if (woerter.length === 0) return 'Kein Text erkannt';
  return woerter.slice(0, anzahlWoerter).join(' ') + (woerter.length > anzahlWoerter ? ' …' : '');
}

/** „Deutsch 95 %, Polnisch 87 %“ oder „Keine Sprache erkannt“ */
export function sprachenKurz(l: LabelAnsicht): string {
  if (l.sprachen.length === 0) return 'Keine Sprache erkannt';
  return l.sprachen.map((s) => `${s.name} ${prozent(s.konfidenz)}`).join(', ');
}

/** „Deutsch 95 % – sicher erkannt“ (AK-15, AK-16) */
export function sprachZeile(s: LabelAnsicht['sprachen'][number]): string {
  return `${s.name} ${prozent(s.konfidenz)} – ${s.sicher ? 'sicher erkannt' : 'nicht sicher'}`;
}

/** Sprachkürzel an jeder Markierung, damit sie nicht nur an der Farbe hängt. */
export function kuerzel(code: string): string {
  return code.toUpperCase();
}

export interface Textstueck {
  text: string;
  beleg: { sprache: string; art: Beleg['art'] } | null;
}

/**
 * Zerlegt den Text an den Fundstellen (AK-16, AK-20). Zusammengesetzt ergeben die Stücke genau
 * den Text. Überlappen sich Fundstellen, gewinnt die äußere: das Wort „Hände“ statt des „ä“ darin.
 * Positionen sind Zeichenindizes wie in JavaScript-Zeichenketten (UTF-16), so wie der Server sie liefert.
 */
export function textStuecke(text: string, belege: readonly Beleg[], nurSprachen?: ReadonlySet<string>): Textstueck[] {
  const auswahl = belege
    .filter((b) => (!nurSprachen || nurSprachen.has(b.sprache)) && b.start >= 0 && b.ende <= text.length && b.start < b.ende)
    .sort((a, b) => a.start - b.start || b.ende - b.start - (a.ende - a.start));
  const stuecke: Textstueck[] = [];
  let pos = 0;
  for (const b of auswahl) {
    if (b.start < pos) continue;
    if (b.start > pos) stuecke.push({ text: text.slice(pos, b.start), beleg: null });
    stuecke.push({ text: text.slice(b.start, b.ende), beleg: { sprache: b.sprache, art: b.art } });
    pos = b.ende;
  }
  if (pos < text.length) stuecke.push({ text: text.slice(pos), beleg: null });
  return stuecke;
}

/** Einzelne Buchstaben als Beleg sind leicht zu übersehen und werden deshalb gezählt. */
export function einzelneBuchstaben(stuecke: readonly Textstueck[]): number {
  return stuecke.filter((s) => s.beleg?.art === 'zeichen').length;
}

/** Sprachen, die nicht sicher erkannt wurden; ihre Stellen sind immer markiert (AK-16). */
export function unsichereSprachen(l: LabelAnsicht): Set<string> {
  return new Set(l.sprachen.filter((s) => !s.sicher).map((s) => s.code));
}

export interface FehlergrundAuswahl {
  grund: Fehlergrund;
  titel: string;
  erklaerung: string;
}

/** Genau drei Gründe (AK-10). */
export const FEHLERGRUENDE: readonly FehlergrundAuswahl[] = [
  { grund: 'unleserlich', titel: 'Unleserlich', erklaerung: 'auf dem Foto nicht zu lesen' },
  { grund: 'sprache_falsch', titel: 'Sprache falsch', erklaerung: 'eine Sprache fehlt oder es steht eine falsche drauf' },
  { grund: 'beschaedigt', titel: 'Label beschädigt', erklaerung: 'eingerissen, verblasst oder verschmutzt' },
];

/** Warum Max ein Label gerade nicht prüfen kann. */
export function sperrgrund(l: LabelAnsicht): string {
  if (l.status === 'fehlerhaft') {
    return `Label ${l.id} wartet auf Nachbesserung${l.letzterFehlergrundText ? ` (von Ihnen gemeldet: ${l.letzterFehlergrundText})` : ''}.`;
  }
  if (l.status === 'fehlt') return `Label ${l.id}: kein Foto vorhanden.`;
  return `Label ${l.id} ist „${l.statusText}“.`;
}

const BILD_URL = /^\/bilder\/([A-Za-z0-9_-]{1,64}\.svg|uploads\/[a-f0-9]{32}\.(png|jpg))$/;

/** Nur Fotos vom eigenen Server unter /bilder/ werden angezeigt. */
export function sichereBildUrl(url: string | null): string | null {
  return url !== null && BILD_URL.test(url) ? url : null;
}

/**
 * Ablauf einer Entscheidung in der Einzelansicht. Gesendet wird nur aus „bereit“ bzw. aus der
 * Grundauswahl, und erst wieder, wenn das nächste Label vollständig angezeigt ist. So lösen
 * Doppelklicks und gedrückt gehaltene Tasten nie eine zweite Entscheidung aus (AK-11).
 */
export type Ablauf = 'laedt' | 'bereit' | 'gruende' | 'speichert';
export type AblaufEreignis =
  | 'angezeigt'
  | 'bestaetigen'
  | 'melden'
  | 'grundGewaehlt'
  | 'abbrechen'
  | 'zuruecknehmen'
  | 'gespeichert'
  | 'fehlgeschlagen';

export function ablauf(zustand: Ablauf, ereignis: AblaufEreignis): { zustand: Ablauf; senden: boolean } {
  switch (`${zustand}:${ereignis}`) {
    case 'laedt:angezeigt':
      return { zustand: 'bereit', senden: false };
    case 'bereit:bestaetigen':
      return { zustand: 'speichert', senden: true };
    case 'bereit:zuruecknehmen':
      return { zustand: 'speichert', senden: true };
    case 'bereit:melden':
      return { zustand: 'gruende', senden: false };
    case 'gruende:grundGewaehlt':
      return { zustand: 'speichert', senden: true };
    case 'gruende:abbrechen':
      return { zustand: 'bereit', senden: false };
    case 'speichert:gespeichert':
      return { zustand: 'laedt', senden: false };
    case 'speichert:fehlgeschlagen':
      return { zustand: 'bereit', senden: false };
    default:
      return { zustand, senden: false };
  }
}
