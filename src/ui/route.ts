// Navigation über die Adresse nach „#“, damit der Server keine Rückfall-Seite braucht.
// #/                          Rollenwahl „Wer sind Sie?“ (Startseite)
// #/anlagen                   Max: Anlagen
// #/anlage/STA4               Max: Übersicht einer Anlage
// #/anlage/STA4/label/STA4-03 Max: Einzelansicht
// #/simulation                Instandhaltung, simuliert (nur im Prototyp)
// #/marie                     Übersicht für Marie
// #/marie/zahl/fehlerhaft     Marie: Labels hinter einer Zahl
// #/marie/anlage/STA4         Marie: Labels einer Anlage
// #/rueckmeldungen            Testleitung: Rückmeldungen ansehen (nur im Prototyp)
// #/kamera                    Kamera: eigenes Foto hochladen (nur im Prototyp)

export type MarieZahl = 'gesamt' | 'offen' | 'erledigt' | 'fehlerhaft';
export type MarieAuswahl = { art: 'zahl'; zahl: MarieZahl } | { art: 'anlage'; anlageId: string };

export type Route =
  | { seite: 'rollenwahl' }
  | { seite: 'anlagen' }
  | { seite: 'anlage'; anlageId: string }
  | { seite: 'label'; anlageId: string; labelId: string }
  | { seite: 'simulation' }
  | { seite: 'marie'; auswahl: MarieAuswahl | null }
  | { seite: 'rueckmeldungen' }
  | { seite: 'kamera' }
  | { seite: 'unbekannt' };

/** Wessen Seite: Rollenwahl, Max' Prüfung, Maries Übersicht, die simulierte Instandhaltung oder die Testleitung */
export type Bereich = 'start' | 'max' | 'marie' | 'simulation' | 'testleitung' | 'kamera';

const ID = '([A-Z0-9-]{1,32})';
const ANLAGE = new RegExp(`^#/anlage/${ID}$`);
const LABEL = new RegExp(`^#/anlage/${ID}/label/${ID}$`);
const MARIE_ZAHL = /^#\/marie\/zahl\/(gesamt|offen|erledigt|fehlerhaft)$/;
const MARIE_ANLAGE = new RegExp(`^#/marie/anlage/${ID}$`);

export function leseRoute(hash: string): Route {
  if (hash === '' || hash === '#' || hash === '#/') return { seite: 'rollenwahl' };
  if (hash === '#/anlagen') return { seite: 'anlagen' };
  if (hash === '#/simulation') return { seite: 'simulation' };
  if (hash === '#/rueckmeldungen') return { seite: 'rueckmeldungen' };
  if (hash === '#/kamera') return { seite: 'kamera' };
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

/**
 * Wessen Seite eine Adresse ist. Auch eine fehlerhafte Adresse unter #/marie gehört zu Marie, damit ihr Rahmen
 * keine Wege zu Max zeigt; eine fehlerhafte unter #/anlage gehört zu Max. Alles andere Unbekannte zur Rollenwahl.
 */
export function bereichDerAdresse(hash: string): Bereich {
  switch (leseRoute(hash).seite) {
    case 'rollenwahl':
      return 'start';
    case 'anlagen':
    case 'anlage':
    case 'label':
      return 'max';
    case 'simulation':
      return 'simulation';
    case 'marie':
      return 'marie';
    case 'rueckmeldungen':
      return 'testleitung';
    case 'kamera':
      return 'kamera';
    case 'unbekannt':
      if (/^#\/marie(\/|$)/i.test(hash)) return 'marie';
      if (/^#\/anlagen?(\/|$)/i.test(hash)) return 'max';
      return 'start';
  }
}

/** Die erste Seite jeder Rolle; dorthin führt der Titel in der Kopfzeile. */
export const STARTSEITE_DES_BEREICHS: Record<Bereich, string> = {
  start: '#/',
  max: '#/anlagen',
  marie: '#/marie',
  simulation: '#/simulation',
  testleitung: '#/rueckmeldungen',
  kamera: '#/kamera',
};

export const zurRollenwahl = () => '#/';
export const zurAnlagenliste = () => '#/anlagen';
export const zurAnlage = (anlageId: string) => `#/anlage/${anlageId}`;
export const zumLabel = (anlageId: string, labelId: string) => `#/anlage/${anlageId}/label/${labelId}`;
export const zurSimulation = () => '#/simulation';
export const zuMarie = () => '#/marie';
export const zurMarieZahl = (zahl: MarieZahl) => `#/marie/zahl/${zahl}`;
export const zurMarieAnlage = (anlageId: string) => `#/marie/anlage/${anlageId}`;
export const zuRueckmeldungen = () => '#/rueckmeldungen';
export const zurKamera = () => '#/kamera';
