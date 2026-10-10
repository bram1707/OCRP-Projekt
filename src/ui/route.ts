// Navigation über die Adresse nach „#“, damit der Server keine Rückfall-Seite braucht.
// #/                          Startseite
// #/anlage/STA4               Übersicht einer Anlage
// #/anlage/STA4/label/STA4-03 Einzelansicht
// #/simulation                Simulation der Instandhaltung (nur im Prototyp)

export type Route =
  | { seite: 'start' }
  | { seite: 'anlage'; anlageId: string }
  | { seite: 'label'; anlageId: string; labelId: string }
  | { seite: 'simulation' }
  | { seite: 'unbekannt' };

const ID = '([A-Z0-9-]{1,32})';
const ANLAGE = new RegExp(`^#/anlage/${ID}$`);
const LABEL = new RegExp(`^#/anlage/${ID}/label/${ID}$`);

export function leseRoute(hash: string): Route {
  if (hash === '' || hash === '#' || hash === '#/') return { seite: 'start' };
  if (hash === '#/simulation') return { seite: 'simulation' };
  const label = LABEL.exec(hash);
  if (label) return { seite: 'label', anlageId: label[1]!, labelId: label[2]! };
  const anlage = ANLAGE.exec(hash);
  if (anlage) return { seite: 'anlage', anlageId: anlage[1]! };
  return { seite: 'unbekannt' };
}

export const zurStartseite = () => '#/';
export const zurAnlage = (anlageId: string) => `#/anlage/${anlageId}`;
export const zumLabel = (anlageId: string, labelId: string) => `#/anlage/${anlageId}/label/${labelId}`;
export const zurSimulation = () => '#/simulation';
