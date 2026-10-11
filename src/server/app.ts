// Kleiner HTTP-Server auf node:http. Es gibt bewusst keinen Endpunkt, der mehrere
// Labels auf einmal ändert (AK-11). Labels und Anlagen ändert nur die simulierte Rolle „max“.
// Ausnahmen mit eigener Rollenliste: die Rückmeldung zum Prototyp (AK-51, auch Marie) und
// die Aufgaben der Testleitung (Rückmeldungen ansehen und löschen, Daten zurücksetzen).

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { mockModell, type SprachModell } from '../ai/mock.ts';
import { holeAnlage, holeAnlagen, holeLabel, holeLabels, holeLetzteEntscheidungen, istBildInVerwendung } from '../db/abfragen.ts';
import {
  bessereNach, bestaetigeLabel, erfasseNach, Fachfehler, gebeAnlageFrei, meldeFehler, nimmBestaetigungZurueck,
} from '../db/aktionen.ts';
import { BILD_DATEI, ladeTestdaten, spieleTestdatenEin } from '../db/datenbank.ts';
import { holeRueckmeldungen, loescheRueckmeldungen, speichereRueckmeldung } from '../db/feedback.ts';
import {
  anlageAnsicht, bewerteLabels, labelAnsicht, labelsAusserhalbDerPruefung, labelsFuerMax, zusammenfassung,
} from './ansichten.ts';
import { Ereignisse } from './ereignisse.ts';
import { marieUebersicht } from './marie.ts';
import { CSP_SVG, ladeOberflaeche } from './statisch.ts';

export interface ServerOptionen {
  db: DatabaseSync;
  bilderOrdner: string;
  modell?: SprachModell;
  /** Ordner der gebauten Oberfläche (dist/). Ohne ihn liefert der Server nur die Schnittstelle und die Fotos. */
  oberflaecheOrdner?: string;
  /** Verteiler für das Signal nach jeder Änderung (AK-44); ohne Angabe ein eigener */
  ereignisse?: Ereignisse;
  /** Ordner des aktiven Datensatzes für „Daten zurücksetzen“ (AK-52); ohne ihn gibt es das Zurücksetzen nicht */
  datenOrdner?: string;
}

/** Wird aufgerufen, wenn der Handler nicht zuständig ist (Entwicklungsserver von Vite). */
export type Weiter = () => void;
export type Handler = (req: IncomingMessage, res: ServerResponse, weiter?: Weiter) => Promise<void>;

/** Simulierte Rollen, es gibt keine Anmeldung. Die Testleitung gibt es nur im Prototyp. */
export type Rolle = 'max' | 'marie' | 'testleitung';
const ROLLEN: readonly Rolle[] = ['max', 'marie', 'testleitung'];

const MAX_KOERPER = 10 * 1024;

/** Der Server läuft nur lokal. Andere Host-Namen deuten auf DNS-Rebinding hin und werden abgewiesen. */
const ERLAUBTE_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

function istErlaubterHost(kopf: string | undefined): boolean {
  if (!kopf) return false;
  try {
    return ERLAUBTE_HOSTS.has(new URL(`http://${kopf}`).hostname);
  } catch {
    return false;
  }
}

/**
 * Kommt die Anfrage von einer fremden Webseite? Browser schicken „Origin“ bei EventSource und „Sec-Fetch-Site“
 * bei jeder Anfrage, auch bei no-cors. Die eigene Seite hat dieselbe Adresse wie der Server; Anfragen ohne diese
 * Kopfzeilen (Adresszeile, Werkzeuge) gelten nicht als fremd.
 */
function istFremdeHerkunft(req: IncomingMessage): boolean {
  const seite = req.headers['sec-fetch-site'];
  if (seite !== undefined && seite !== 'same-origin' && seite !== 'none') return true;
  const herkunft = req.headers.origin;
  if (herkunft === undefined) return false;
  try {
    return new URL(herkunft).host !== req.headers.host;
  } catch {
    return true;
  }
}

interface Anfrage {
  rolle: Rolle | null;
  koerper: () => Promise<Record<string, unknown>>;
}

export interface Route {
  /** Jede Route, die nicht GET ist, schreibt und verlangt die Rolle „max“, außer sie nennt eigene `rollen`. */
  methode: 'GET' | 'POST';
  muster: RegExp;
  /**
   * Nur diese Rollen dürfen die Route aufrufen, und nur von der eigenen Seite aus (wie beim Signal, R14).
   * Ohne Angabe: lesen alle, schreiben nur „max“.
   */
  rollen?: { erlaubt: readonly Rolle[]; sonst: string };
  /** Sendet nach Erfolg das Signal (AK-44). Ohne Angabe: jede Route, die nicht GET ist. */
  signal?: boolean;
  aktion: (anfrage: Anfrage, teile: string[]) => Promise<unknown> | unknown;
}

function leseRolle(req: IncomingMessage): Rolle | null {
  const wert = req.headers['x-rolle'];
  return ROLLEN.find((r) => r === wert) ?? null;
}

function leseKoerper(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((aufloesen, ablehnen) => {
    const teile: Buffer[] = [];
    let groesse = 0;
    req.on('data', (stueck: Buffer) => {
      groesse += stueck.length;
      if (groesse > MAX_KOERPER) {
        // Rest verwerfen statt speichern; die Verbindung wird nach der Antwort geschlossen.
        req.removeAllListeners('data');
        req.resume();
        ablehnen(new Fachfehler(413, 'Die Anfrage ist zu groß.'));
        return;
      }
      teile.push(stueck);
    });
    req.on('end', () => {
      const text = Buffer.concat(teile).toString('utf8').trim();
      if (text === '') return aufloesen({});
      try {
        const daten: unknown = JSON.parse(text);
        if (typeof daten !== 'object' || daten === null || Array.isArray(daten)) {
          return ablehnen(new Fachfehler(400, 'Die Anfrage muss ein JSON-Objekt sein.'));
        }
        aufloesen(daten as Record<string, unknown>);
      } catch {
        ablehnen(new Fachfehler(400, 'Die Anfrage ist kein gültiges JSON.'));
      }
    });
    req.on('error', ablehnen);
  });
}

function sendeJson(res: ServerResponse, status: number, daten: unknown): void {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...(status === 413 ? { Connection: 'close' } : {}),
  });
  res.end(JSON.stringify(daten));
}

const NUR_TESTLEITUNG = 'Das darf nur die Testleitung (nur im Prototyp).';

/** Alle Routen der Schnittstelle; exportiert, damit ein Test jede schreibende Route als Marie aufrufen kann (AK-46). */
export function routen(optionen: ServerOptionen): Route[] {
  const { db } = optionen;
  const modell = optionen.modell ?? mockModell;

  const anlageOder404 = (id: string) => {
    const anlage = holeAnlage(db, id);
    if (!anlage) throw new Fachfehler(404, 'Diese Anlage gibt es nicht.');
    return anlage;
  };
  const labelAntwort = (id: string) => {
    const label = holeLabel(db, id);
    if (!label) throw new Fachfehler(404, 'Dieses Label gibt es nicht.');
    // Auffälligkeit hängt von den anderen Labels der Anlage ab.
    const bewertung = bewerteLabels(holeLabels(db, label.anlageId));
    return labelAnsicht(label, bewertung.get(label.id));
  };

  return [
    {
      methode: 'GET', muster: /^\/api\/anlagen$/,
      aktion: () => holeAnlagen(db).map((a) => anlageAnsicht(a, holeLabels(db, a.id))),
    },
    {
      methode: 'GET', muster: /^\/api\/anlagen\/([A-Z0-9-]+)\/labels$/,
      aktion: (_a, [id]) => {
        const anlage = anlageOder404(id!);
        const labels = holeLabels(db, anlage.id);
        return {
          anlage: anlageAnsicht(anlage, labels),
          labels: labelsFuerMax(labels),
          ausserhalbDerPruefung: labelsAusserhalbDerPruefung(labels),
        };
      },
    },
    {
      methode: 'GET', muster: /^\/api\/anlagen\/([A-Z0-9-]+)\/zusammenfassung$/,
      aktion: (_a, [id]) => {
        const anlage = anlageOder404(id!);
        return zusammenfassung(anlage, holeLabels(db, anlage.id));
      },
    },
    {
      methode: 'POST', muster: /^\/api\/anlagen\/([A-Z0-9-]+)\/freigeben$/,
      aktion: (_a, [id]) => {
        const anlage = gebeAnlageFrei(db, id!, 'max');
        return anlageAnsicht(anlage, holeLabels(db, anlage.id));
      },
    },
    {
      // Maries Übersicht (AK-40 bis AK-45), nur lesend.
      methode: 'GET', muster: /^\/api\/marie$/,
      aktion: () => marieUebersicht(
        holeAnlagen(db).map((anlage) => ({ anlage, labels: holeLabels(db, anlage.id) })),
        holeLetzteEntscheidungen(db),
      ),
    },
    {
      methode: 'GET', muster: /^\/api\/labels\/([A-Z0-9-]+)$/,
      aktion: (_a, [id]) => labelAntwort(id!),
    },
    {
      methode: 'POST', muster: /^\/api\/labels\/([A-Z0-9-]+)\/bestaetigen$/,
      aktion: (_a, [id]) => {
        bestaetigeLabel(db, id!, 'max');
        return labelAntwort(id!);
      },
    },
    {
      methode: 'POST', muster: /^\/api\/labels\/([A-Z0-9-]+)\/fehler$/,
      aktion: async (anfrage, [id]) => {
        const { grund } = await anfrage.koerper();
        meldeFehler(db, id!, grund, 'max');
        return labelAntwort(id!);
      },
    },
    {
      methode: 'POST', muster: /^\/api\/labels\/([A-Z0-9-]+)\/zuruecknehmen$/,
      aktion: (_a, [id]) => {
        nimmBestaetigungZurueck(db, id!, 'max');
        return labelAntwort(id!);
      },
    },
    // Simulation der Instandhaltung (nur im Prototyp). Die Daten kommen nur aus den Testdaten des Servers.
    {
      methode: 'POST', muster: /^\/api\/labels\/([A-Z0-9-]+)\/nachbessern$/,
      aktion: async (_a, [id]) => {
        await bessereNach(db, id!, new Date(), modell);
        return labelAntwort(id!);
      },
    },
    {
      methode: 'POST', muster: /^\/api\/labels\/([A-Z0-9-]+)\/nacherfassen$/,
      aktion: async (_a, [id]) => {
        await erfasseNach(db, id!, new Date(), modell);
        return labelAntwort(id!);
      },
    },
    // Rückmeldung zum Prototyp (AK-51): die einzige Route, die auch Marie aufrufen darf (Zusatz zu AK-46).
    // Sie schreibt nur in die Tabelle feedback und ändert nichts an Labels, Anlagen oder Protokoll.
    {
      methode: 'POST', muster: /^\/api\/feedback$/,
      rollen: { erlaubt: ['max', 'marie', 'testleitung'], sonst: 'Rückmeldungen gibt es nur über die Seiten des Prototyps.' },
      signal: false,
      aktion: async (anfrage) => {
        const { id, szenario, zeitpunkt } = speichereRueckmeldung(db, await anfrage.koerper(), new Date());
        return { id, szenario, zeitpunkt };
      },
    },
    // Aufgaben der Testleitung (nur im Prototyp).
    {
      methode: 'GET', muster: /^\/api\/feedback$/,
      rollen: { erlaubt: ['testleitung'], sonst: NUR_TESTLEITUNG },
      aktion: () => holeRueckmeldungen(db),
    },
    {
      methode: 'POST', muster: /^\/api\/feedback\/loeschen$/,
      rollen: { erlaubt: ['testleitung'], sonst: NUR_TESTLEITUNG },
      signal: false,
      aktion: () => ({ geloescht: loescheRueckmeldungen(db) }),
    },
    {
      // Spielt den aktiven Datensatz neu ein (AK-52); Rückmeldungen bleiben. Danach ein Signal für offene Übersichten.
      methode: 'POST', muster: /^\/api\/demo\/zuruecksetzen$/,
      rollen: { erlaubt: ['testleitung'], sonst: NUR_TESTLEITUNG },
      aktion: async () => {
        if (!optionen.datenOrdner) throw new Fachfehler(404, 'Zurücksetzen ist bei diesem Server nicht eingerichtet.');
        await spieleTestdatenEin(db, ladeTestdaten(optionen.datenOrdner), modell, { ersetzen: true });
        return { zurueckgesetzt: true };
      },
    },
  ];
}

/** Liefert nur Fotos, auf die gerade ein Label verweist; Fotos der Simulation bleiben bis dahin unsichtbar. */
async function sendeBild(res: ServerResponse, db: DatabaseSync, bilderOrdner: string, datei: string): Promise<void> {
  if (!BILD_DATEI.test(datei) || !istBildInVerwendung(db, datei)) throw new Fachfehler(404, 'Dieses Bild gibt es nicht.');
  let inhalt: Buffer;
  try {
    inhalt = await readFile(join(bilderOrdner, datei));
  } catch {
    throw new Fachfehler(404, 'Dieses Bild gibt es nicht.');
  }
  res.writeHead(200, {
    'Content-Type': 'image/svg+xml',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': CSP_SVG,
  });
  res.end(inhalt);
}

/**
 * Bearbeitet die Schnittstelle (/api/…), die Fotos (/bilder/…) und, falls gebaut, die Oberfläche.
 * Mit `weiter` (Entwicklungsserver) reicht er alles andere weiter, ohne es anzusehen.
 */
export function erstelleHandler(optionen: ServerOptionen): Handler {
  const tabelle = routen(optionen);
  const ereignisse = optionen.ereignisse ?? new Ereignisse();
  const oberflaeche = optionen.oberflaecheOrdner ? ladeOberflaeche(optionen.oberflaecheOrdner) : null;

  return async (req, res, weiter) => {
    let geaendert = false;
    try {
      const pfad = new URL(req.url ?? '/', 'http://localhost').pathname;
      const eigenerPfad = pfad === '/api' || pfad.startsWith('/api/') || pfad.startsWith('/bilder/');
      if (weiter && !eigenerPfad) return weiter();

      if (!istErlaubterHost(req.headers.host)) throw new Fachfehler(421, 'Unbekannte Serveradresse.');

      if (req.method === 'GET' && pfad.startsWith('/bilder/')) {
        await sendeBild(res, optionen.db, optionen.bilderOrdner, pfad.slice('/bilder/'.length));
        return;
      }

      // Offene Verbindung für das Signal nach jeder Änderung (AK-44). Sie liefert keine Daten.
      if (req.method === 'GET' && pfad === '/api/ereignisse') {
        // Sonst könnte eine fremde Seite im Browser die begrenzten Plätze belegen (R14).
        if (istFremdeHerkunft(req)) throw new Fachfehler(403, 'Das Signal gibt es nur für die eigene Seite.');
        if (!ereignisse.verbinde(res)) throw new Fachfehler(503, 'Zu viele offene Verbindungen. Bitte später erneut versuchen.');
        return;
      }

      let teile: string[] | null = null;
      const route = tabelle.find((r) => {
        if (r.methode !== req.method) return false;
        const treffer = r.muster.exec(pfad);
        if (treffer) teile = treffer.slice(1);
        return treffer !== null;
      });
      if (!route || !teile) {
        if (req.method === 'GET' && !eigenerPfad) {
          if (oberflaeche?.sende(res, pfad)) return;
          if (!oberflaeche && pfad === '/') {
            throw new Fachfehler(404, 'Die Oberfläche ist noch nicht gebaut. Bitte mit „npm start“ starten.');
          }
        }
        throw new Fachfehler(404, 'Diese Adresse gibt es nicht.');
      }

      const rolle = leseRolle(req);
      if (route.rollen) {
        if (rolle === null || !route.rollen.erlaubt.includes(rolle) || istFremdeHerkunft(req)) {
          throw new Fachfehler(403, route.rollen.sonst);
        }
      } else if (route.methode !== 'GET' && rolle !== 'max') {
        throw new Fachfehler(403, 'Nur Max (Qualitätsmanagement) darf Labels prüfen und Anlagen freigeben.');
      }

      const ergebnis = await route.aktion({ rolle, koerper: () => leseKoerper(req) }, teile);
      sendeJson(res, 200, ergebnis);
      geaendert = route.signal ?? route.methode !== 'GET';
    } catch (fehler) {
      if (fehler instanceof Fachfehler) {
        sendeJson(res, fehler.status, { fehler: fehler.message, details: fehler.details ?? null });
      } else {
        console.error(fehler);
        sendeJson(res, 500, { fehler: 'Interner Fehler. Bitte später erneut versuchen.' });
      }
    }
    // Erst nach der Antwort und außerhalb von try/catch: Das Signal darf die gesendete Antwort nie in den Fehlerweg bringen.
    if (geaendert) ereignisse.melde();
  };
}

export function erstelleServer(optionen: ServerOptionen): Server {
  const ereignisse = optionen.ereignisse ?? new Ereignisse();
  const handler = erstelleHandler({ ...optionen, ereignisse });
  const server = createServer((req, res) => void handler(req, res));
  // Offene Signal-Verbindungen enden nie von selbst; ohne das würde close() ewig warten.
  const schliesse = server.close.bind(server);
  server.close = (fertig?: (fehler?: Error) => void) => {
    ereignisse.schliesseAlle();
    return schliesse(fertig);
  };
  return server;
}
