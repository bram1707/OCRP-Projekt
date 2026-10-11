// Navigation über die Adresse nach „#“, damit der Server keine Rückfall-Seite braucht.
// #/                          Startseite
// #/anlage/STA4               Übersicht einer Anlage
// #/anlage/STA4/label/STA4-03 Einzelansicht
// #/simulation                Simulation der Instandhaltung (nur im Prototyp)
// #/marie                     Übersicht für Marie
// #/marie/zahl/fehlerhaft     Marie: Labels hinter einer Zahl
// #/marie/anlage/STA4         Marie: Labels einer Anlage

export type MarieZahl = 'gesamt' | 'offen' | 'erledigt' | 'fehlerhaft';
export type MarieAuswahl = { art: 'zahl'; zahl: MarieZahl } | { art: 'anlage'; anlageId: string };

export type Route =
  | { seite: 'start' }
  | { seite: 'anlage'; anlageId: string }
  | { seite: 'label'; anlageId: string; labelId: string }
  | { seite: 'simulation' }
  | { seite: 'marie'; auswahl: MarieAuswahl | null }
  | { seite: 'unbekannt' };

const ID = '([A-Z0-9-]{1,32})';
const ANLAGE = new RegExp(`^#/anlage/${ID}$`);
const LABEL = new RegExp(`^#/anlage/${ID}/label/${ID}$`);
const MARIE_ZAHL = /^#\/marie\/zahl\/(gesamt|offen|erledigt|fehlerhaft)$/;
const MARIE_ANLAGE = new RegExp(`^#/marie/anlage/${ID}$`);

export function leseRoute(hash: string): Route {
  if (hash === '' || hash === '#' || hash === '#/') return { seite: 'start' };
  if (hash === '#/simulation') return { seite: 'simulation' };
  if (hash === '#/marie') return { seite: 'marie', auswahl: null };
  const zahl = MARIE_ZAHL.exec(hash);
  if (zahl) return { seite: 'marie', auswahl: { art: 'zahl', zahl: zahl[1] as MarieZahl } };
  const marieAnlage = MARIE_ANLAGE.exec(hash);
  if (marieAnlage) return { seite: 'marie', auswahl: { art: 'anlage', anlageId: marieAnlage[1]! } };
  const label = LABEL.exec(hash);
  if (label) return { seite: 'label', anlageId: label[1]!, labelId: label[2]! };
  const anlage = ANLAGE.exec(hash);
  if (anlage) return { seite: 'anlage', anlageId: anlage[1]! };
  return { seite: 'unbekannt' };
}

/** Wessen Seite eine Adresse ist. Auch eine fehlerhafte Adresse unter #/marie gehört zu Marie, damit ihr Rahmen keine Wege zu Max zeigt. */
export function bereichDerAdresse(hash: string): 'max' | 'marie' | 'simulation' {
  const route = leseRoute(hash);
  if (route.seite === 'simulation') return 'simulation';
  if (route.seite === 'marie' || /^#\/marie(\/|$)/i.test(hash)) return 'marie';
  return 'max';
}

export const zurStartseite = () => '#/';
export const zurAnlage = (anlageId: string) => `#/anlage/${anlageId}`;
export const zumLabel = (anlageId: string, labelId: string) => `#/anlage/${anlageId}/label/${labelId}`;
export const zurSimulation = () => '#/simulation';
export const zuMarie = () => '#/marie';
export const zurMarieZahl = (zahl: MarieZahl) => `#/marie/zahl/${zahl}`;
export const zurMarieAnlage = (anlageId: string) => `#/marie/anlage/${anlageId}`;
