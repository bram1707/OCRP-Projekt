// Eigene Fotos der Kamera (nur im Prototyp). Sie liegen außerhalb des Projekts unter daten/ und werden
// gelöscht, sobald kein Label mehr auf sie verweist (Daten zurücksetzen, Start mit neuer Datenbank).

import { mkdirSync, readdirSync } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { istBildInVerwendung } from '../db/abfragen.ts';

export function bereiteUploadOrdnerVor(ordner: string): string {
  mkdirSync(ordner, { recursive: true });
  return ordner;
}

/** Löscht jede Datei im Upload-Ordner, auf die kein Label verweist. Gibt die Zahl gelöschter Dateien zurück. */
export async function raeumeUploadsAuf(db: DatabaseSync, ordner: string): Promise<number> {
  let geloescht = 0;
  for (const eintrag of readdirSync(ordner, { withFileTypes: true })) {
    if (!eintrag.isFile() || istBildInVerwendung(db, `uploads/${eintrag.name}`)) continue;
    await unlink(join(ordner, eintrag.name));
    geloescht += 1;
  }
  return geloescht;
}
