// Liefert die gebaute Oberfläche aus dist/ aus. Der Ordner wird beim Start einmal eingelesen;
// danach gibt es nur exakte Treffer auf diese Dateien, keinen Rückfall auf index.html und
// keinen Zugriff auf andere Dateien des Projekts.

import { readdirSync, readFileSync } from 'node:fs';
import type { ServerResponse } from 'node:http';
import { extname, join, relative, sep } from 'node:path';

const TYPEN: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};

/** Die Oberfläche lädt nur eigene Dateien und spricht nur mit dem eigenen Server. */
export const CSP_OBERFLAECHE = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

/** SVGs dürfen keine Skripte ausführen. */
export const CSP_SVG = "default-src 'none'; style-src 'unsafe-inline'";

interface Datei {
  inhalt: Buffer;
  kopf: Record<string, string>;
}

export interface Oberflaeche {
  /** Antwortet und gibt true zurück, wenn es zu diesem Pfad eine Datei gibt. */
  sende(res: ServerResponse, pfad: string): boolean;
}

function kopfzeilen(pfad: string, endung: string): Record<string, string> {
  const kopf: Record<string, string> = { 'Content-Type': TYPEN[endung]!, 'X-Content-Type-Options': 'nosniff' };
  if (endung === '.html') {
    Object.assign(kopf, {
      'Content-Security-Policy': CSP_OBERFLAECHE,
      // Die Oberfläche setzt selbst „X-Rolle: max“, darf also in keinem fremden Rahmen laufen.
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer',
    });
  }
  if (endung === '.svg') kopf['Content-Security-Policy'] = CSP_SVG;
  // Dateien unter assets/ tragen einen Prüfwert im Namen und ändern sich nie.
  kopf['Cache-Control'] = pfad.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache';
  return kopf;
}

function sammle(ordner: string, wurzel: string, dateien: Map<string, Datei>): void {
  for (const eintrag of readdirSync(ordner, { withFileTypes: true })) {
    if (eintrag.name.startsWith('.')) continue;
    const voll = join(ordner, eintrag.name);
    if (eintrag.isDirectory()) {
      sammle(voll, wurzel, dateien);
      continue;
    }
    const endung = extname(eintrag.name).toLowerCase();
    if (!eintrag.isFile() || !(endung in TYPEN)) continue;
    const pfad = '/' + relative(wurzel, voll).split(sep).join('/');
    dateien.set(pfad, { inhalt: readFileSync(voll), kopf: kopfzeilen(pfad, endung) });
  }
}

/** Liest dist/ ein. Gibt null zurück, wenn die Oberfläche noch nicht gebaut ist. */
export function ladeOberflaeche(ordner: string): Oberflaeche | null {
  const dateien = new Map<string, Datei>();
  try {
    sammle(ordner, ordner, dateien);
  } catch {
    return null;
  }
  const start = dateien.get('/index.html');
  if (!start) return null;
  dateien.set('/', start);

  return {
    sende(res, pfad) {
      const datei = dateien.get(pfad);
      if (!datei) return false;
      res.writeHead(200, datei.kopf);
      res.end(datei.inhalt);
      return true;
    },
  };
}
