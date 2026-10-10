// Aufbau des Prüfsystems: .env lesen, Spracherkennung wählen, Datenbank öffnen und beim
// ersten Start mit den fiktiven Testdaten füllen. Genutzt von start.ts und vom Entwicklungsserver.

import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { leseKonfiguration, waehleModell, type KiKonfiguration } from '../ai/konfiguration.ts';
import type { SprachModell } from '../ai/mock.ts';
import { istLeer, ladeTestdaten, oeffneDatenbankMitStand, spieleTestdatenEin } from '../db/datenbank.ts';
import type { ServerOptionen } from './app.ts';

export const WURZEL = resolve(import.meta.dirname, '..', '..');

/** Startmeldung, wenn eine Datenbank aus einer älteren Version neu angelegt wurde (Server und Entwicklungsserver). */
export const HINWEIS_DATENBANK_ERSETZT =
  'Die Datenbank stammte aus einer älteren Version und wurde mit den Testdaten neu angelegt (nur fiktive Daten).';

export interface System {
  konfiguration: KiKonfiguration;
  modell: SprachModell;
  db: DatabaseSync;
  bilderOrdner: string;
  /** Eine Datenbank aus einer älteren Version wurde verworfen und neu angelegt. */
  datenbankErsetzt: boolean;
}

export async function bereiteSystemVor(wurzel = WURZEL): Promise<System> {
  const envDatei = join(wurzel, '.env');
  if (existsSync(envDatei)) process.loadEnvFile(envDatei);

  const konfiguration = leseKonfiguration();
  const modell = waehleModell(konfiguration);

  const testdaten = join(wurzel, 'testdaten');
  const dbPfad = process.env.DB_PFAD ?? join(wurzel, 'daten', 'pruefsystem.sqlite');
  mkdirSync(dirname(dbPfad), { recursive: true });
  const { db, ersetzt } = oeffneDatenbankMitStand(dbPfad);
  if (istLeer(db)) await spieleTestdatenEin(db, ladeTestdaten(testdaten), modell);

  return { konfiguration, modell, db, bilderOrdner: join(testdaten, 'bilder'), datenbankErsetzt: ersetzt };
}

/** Optionen für den Server; die gebaute Oberfläche liegt in dist/. */
export function serverOptionen(system: System, wurzel = WURZEL): ServerOptionen {
  return { db: system.db, bilderOrdner: system.bilderOrdner, modell: system.modell, oberflaecheOrdner: join(wurzel, 'dist') };
}
