// Kleiner HTTP-Server auf node:http. Es gibt bewusst keinen Endpunkt, der mehrere
// Labels auf einmal ändert (AK-11). Labels und Anlagen ändert nur die simulierte Rolle „max“.
// Ausnahmen mit eigener Rollenliste: die Rückmeldung zum Prototyp (AK-51, auch Marie) und
// die Aufgaben der Testleitung (Rückmeldungen ansehen und löschen, Daten zurücksetzen) und das eigene
// Foto der Kamera (nur im Prototyp, nur für die Testanlage „Eigene Fotos“).

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFile, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { mockModell, type SprachModell } from '../ai/mock.ts';
import { holeAnlage, holeAnlagen, holeLabel, holeLabels, holeLetzteEntscheidungen, istBildInVerwendung } from '../db/abfragen.ts';
import {
  ANLAGE_EIGENE_FOTOS, bessereNach, bestaetigeLabel, erfasseNach, Fachfehler, gebeAnlageFrei, meldeFehler, nimmBestaetigungZurueck,
  nimmFotoAuf, pruefeFotoAufnahme,
} from '../db/aktionen.ts';
import { BILD_DATEI, ladeTestdaten, spieleTestdatenEin } from '../db/datenbank.ts';
import { holeRueckmeldungen, loescheRueckmeldungen, speichereRueckmeldung } from '../db/feedback.ts';
import {
  anlageAnsicht, bewerteLabels, labelAnsicht, labelsAusserhalbDerPruefung, labelsFuerMax, zusammenfassung,
} from './ansichten.ts';
import { ENDUNG, erkenneBildtyp, MAX_FOTO_BYTES, MEDIENTYP, UPLOAD_DATEI, type BildTyp } from '../ocr/bild.ts';
import type { Gelesen, TextLeser } from '../ocr/textLeser.ts';
import { Ereignisse } from './ereignisse.ts';
import { raeumeUploadsAuf } from './uploads.ts';
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
  /** Ordner für eigene Fotos der Kamera (nur im Prototyp); ohne ihn gibt es keinen Upload */
  uploadOrdner?: string;
  /** Texterkennung für eigene Fotos; null = aus, dann wird der Text abgetippt */
  textLeser?: TextLeser | null;
}

/** Wird aufgerufen, wenn der Handler nicht zuständig ist (Entwicklungsserver von Vite). */
export type Weiter = () => void;
export type Handler = (req: IncomingMessage, res: ServerResponse, weiter?: Weiter) => Promise<void>;

/** Simulierte Rollen, es gibt keine Anmeldung. Die Testleitung gibt es nur im Prototyp. */
export type Rolle = 'max' | 'marie' | 'testleitung' | 'kamera';
const ROLLEN: readonly Rolle[] = ['max', 'marie', 'testleitung', 'kamera'];

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
  /** Rohdaten statt JSON, mit eigenem Größenlimit (nur für das eigene Foto) */
  rohdaten: (grenze: number) => Promise<Buffer>;
  suche: URLSearchParams;
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

function leseRohdaten(req: IncomingMessage, grenze: number, meldung = 'Die Anfrage ist zu groß.'): Promise<Buffer> {
  return new Promise((aufloesen, ablehnen) => {
    const teile: Buffer[] = [];
    let groesse = 0;
    req.on('data', (stueck: Buffer) => {
      groesse += stueck.length;
      if (groesse > grenze) {
        // Rest verwerfen statt speichern; die Verbindung wird nach der Antwort geschlossen.
        req.removeAllListeners('data');
        req.resume();
        ablehnen(new Fachfehler(413, meldung));
        return;
      }
      teile.push(stueck);
    });
    req.on('end', () => aufloesen(Buffer.concat(teile)));
    req.on('error', ablehnen);
  });
}

function leseKoerper(req: IncomingMessage): Promise<Record<string, unknown>> {
  return leseRohdaten(req, MAX_KOERPER).then((roh) => {
    const text = roh.toString('utf8').trim();
    if (text === '') return {};
    let daten: unknown;
    try {
      daten = JSON.parse(text);
    } catch {
      throw new Fachfehler(400, 'Die Anfrage ist kein gültiges JSON.');
    }
    if (typeof daten !== 'object' || daten === null || Array.isArray(daten)) {
      throw new Fachfehler(400, 'Die Anfrage muss ein JSON-Objekt sein.');
    }
    return daten as Record<string, unknown>;
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
const NUR_KAMERA = 'Eigene Fotos lädt nur die Kamera-Seite hoch (nur im Prototyp).';
/** Höchstlänge für abgetippten Text */
export const MAX_ABGETIPPT = 1000;

/** Abgetippter Text aus der Adresse (Rückfall ohne Texterkennung); null = nicht angegeben. */
function abgetippterText(suche: URLSearchParams): string | null {
  const text = suche.get('text');
  if (text === null) return null;
  const sauber = text.replace(/\r\n?/g, '\n').trim();
  if (sauber === '') throw new Fachfehler(400, 'Bitte den Text auf dem Label eintippen.');
  if (sauber.length > MAX_ABGETIPPT) throw new Fachfehler(400, `Der Text darf höchstens ${MAX_ABGETIPPT} Zeichen haben.`);
  return sauber;
}

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
        const { grund, text } = await anfrage.koerper();
        meldeFehler(db, id!, grund, 'max', new Date(), text);
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
    // Kamera (nur im Prototyp): Plätze der Testanlage „Eigene Fotos“ und ob es eine Texterkennung gibt.
    {
      methode: 'GET', muster: /^\/api\/kamera$/,
      aktion: () => {
        const anlage = holeAnlage(db, ANLAGE_EIGENE_FOTOS);
        const labels = anlage ? holeLabels(db, anlage.id) : [];
        const bewertung = bewerteLabels(labels);
        return {
          texterkennung: Boolean(optionen.textLeser) && Boolean(optionen.uploadOrdner),
          upload: Boolean(optionen.uploadOrdner),
          anlage: anlage ? anlageAnsicht(anlage, labels) : null,
          plaetze: labels.map((l) => labelAnsicht(l, bewertung.get(l.id))),
        };
      },
    },
    {
      // Eigenes Foto: Rohdaten (PNG oder JPEG, höchstens 5 MB), Typ nur nach Signatur. Dann Texterkennung oder
      // abgetippter Text (?text=…), Spracherkennung und derselbe Weg zu Max wie ein nachgereichtes Foto.
      methode: 'POST', muster: /^\/api\/labels\/([A-Z0-9-]+)\/foto$/,
      rollen: { erlaubt: ['kamera'], sonst: NUR_KAMERA },
      aktion: async (anfrage, [id]) => {
        const ordner = optionen.uploadOrdner;
        if (!ordner) throw new Fachfehler(404, 'Eigene Fotos sind bei diesem Server nicht eingerichtet.');
        const abgetippt = abgetippterText(anfrage.suche);
        pruefeFotoAufnahme(db, id!);
        const bild = await anfrage.rohdaten(MAX_FOTO_BYTES);
        const typ: BildTyp | null = erkenneBildtyp(bild);
        if (!typ) throw new Fachfehler(415, 'Bitte ein Foto als PNG oder JPEG hochladen.');
        if (abgetippt === null && !optionen.textLeser) {
          throw new Fachfehler(400, 'Die Texterkennung ist ausgeschaltet. Bitte den Text auf dem Label eintippen.');
        }
        let gelesen: Gelesen = { text: abgetippt ?? '', konfidenz: 1 };
        if (abgetippt === null) {
          try {
            gelesen = await optionen.textLeser!(bild, typ);
          } catch {
            throw new Fachfehler(503, 'Die Texterkennung hat das Foto nicht gelesen. Bitte erneut versuchen oder den Text eintippen.');
          }
        }
        const datei = `${randomBytes(16).toString('hex')}.${ENDUNG[typ]}`;
        await writeFile(join(ordner, datei), bild, { flag: 'wx' });
        try {
          const { altesBild } = await nimmFotoAuf(
            db, id!, { bildPfad: `uploads/${datei}`, ocrText: gelesen.text, ocrKonfidenz: gelesen.konfidenz, abgetippt: abgetippt !== null },
            new Date(), modell,
          );
          if (altesBild && UPLOAD_DATEI.test(altesBild)) await unlink(join(ordner, altesBild.slice('uploads/'.length))).catch(() => {});
        } catch (fehler) {
          await unlink(join(ordner, datei)).catch(() => {});
          throw fehler;
        }
        return { ...labelAntwort(id!), textGefunden: gelesen.text.trim() !== '', unsichereWoerter: gelesen.unsichereWoerter ?? [] };
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
        // Erst nach dem erfolgreichen Einspielen: eigene Fotos löschen, auf die kein Label mehr verweist.
        if (optionen.uploadOrdner) await raeumeUploadsAuf(db, optionen.uploadOrdner);
        return { zurueckgesetzt: true };
      },
    },
  ];
}

/**
 * Liefert nur Fotos, auf die gerade ein Label verweist; Fotos der Simulation bleiben bis dahin unsichtbar.
 * Eigene Fotos (uploads/…) kommen aus dem Upload-Ordner, mit dem Typ aus ihren ersten Bytes.
 */
async function sendeBild(res: ServerResponse, optionen: ServerOptionen, datei: string): Promise<void> {
  const hochgeladen = UPLOAD_DATEI.test(datei);
  if (!(BILD_DATEI.test(datei) || (hochgeladen && optionen.uploadOrdner)) || !istBildInVerwendung(optionen.db, datei)) {
    throw new Fachfehler(404, 'Dieses Bild gibt es nicht.');
  }
  let inhalt: Buffer;
  try {
    inhalt = await readFile(hochgeladen ? join(optionen.uploadOrdner!, datei.slice('uploads/'.length)) : join(optionen.bilderOrdner, datei));
  } catch {
    throw new Fachfehler(404, 'Dieses Bild gibt es nicht.');
  }
  const typ = hochgeladen ? erkenneBildtyp(inhalt) : null;
  if (hochgeladen && !typ) throw new Fachfehler(404, 'Dieses Bild gibt es nicht.');
  res.writeHead(200, {
    'Content-Type': typ ? MEDIENTYP[typ] : 'image/svg+xml',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': CSP_SVG,
    ...(hochgeladen ? { 'Cache-Control': 'no-store' } : {}),
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
      const adresse = new URL(req.url ?? '/', 'http://localhost');
      const pfad = adresse.pathname;
      const eigenerPfad = pfad === '/api' || pfad.startsWith('/api/') || pfad.startsWith('/bilder/');
      if (weiter && !eigenerPfad) return weiter();

      if (!istErlaubterHost(req.headers.host)) throw new Fachfehler(421, 'Unbekannte Serveradresse.');

      if (req.method === 'GET' && pfad.startsWith('/bilder/')) {
        await sendeBild(res, optionen, pfad.slice('/bilder/'.length));
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

      const ergebnis = await route.aktion({
        rolle,
        koerper: () => leseKoerper(req),
        rohdaten: (grenze) => leseRohdaten(req, grenze, 'Das Foto ist zu groß. Bitte höchstens 5 MB.'),
        suche: adresse.searchParams,
      }, teile);
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
