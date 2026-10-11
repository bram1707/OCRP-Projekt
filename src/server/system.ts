// Aufbau des Prüfsystems: .env lesen, Spracherkennung wählen, Datenbank öffnen und beim
// ersten Start mit den fiktiven Testdaten füllen. Genutzt von start.ts und vom Entwicklungsserver.
// DATENSATZ=demo wählt die Demo-Daten für Nutzertests (AK-50) mit eigener Datenbank.

import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { leseKonfiguration, waehleModell, type KiKonfiguration } from '../ai/konfiguration.ts';
import type { SprachModell } from '../ai/mock.ts';
import { istLeer, ladeTestdaten, oeffneDatenbankMitStand, spieleTestdatenEin } from '../db/datenbank.ts';
import { leseOcrModus, waehleTextLeser, type OcrModus, type TextLeser } from '../ocr/textLeser.ts';
import type { ServerOptionen } from './app.ts';
import { bereiteUploadOrdnerVor, raeumeUploadsAuf } from './uploads.ts';

export const WURZEL = resolve(import.meta.dirname, '..', '..');

/** Startmeldung, wenn eine Datenbank aus einer älteren Version neu angelegt wurde (Server und Entwicklungsserver). */
export const HINWEIS_DATENBANK_ERSETZT =
  'Die Datenbank stammte aus einer älteren Version und wurde mit den Testdaten neu angelegt (nur fiktive Daten).';

export type Datensatz = 'basis' | 'demo';

/** Ohne Angabe gelten die 20 Testlabels der Entwicklung, mit DATENSATZ=demo die Demo-Anlagen. */
export function leseDatensatz(env: NodeJS.ProcessEnv = process.env): Datensatz {
  const wert = env.DATENSATZ?.trim() ?? '';
  if (wert === '' || wert === 'basis') return 'basis';
  if (wert === 'demo') return 'demo';
  throw new Error(`DATENSATZ=${wert} ist unbekannt. Erlaubt sind „demo“ oder keine Angabe.`);
}

/** Jeder Datensatz hat seine eigene Datenbank; DB_PFAD gilt für beide. */
export function datenbankPfad(wurzel: string, datensatz: Datensatz, env: NodeJS.ProcessEnv = process.env): string {
  return env.DB_PFAD ?? join(wurzel, 'daten', datensatz === 'demo' ? 'demo.sqlite' : 'pruefsystem.sqlite');
}

export interface System {
  konfiguration: KiKonfiguration;
  modell: SprachModell;
  db: DatabaseSync;
  datensatz: Datensatz;
  /** Ordner mit anlagen.json, labels.json und bilder/ des gewählten Datensatzes */
  datenOrdner: string;
  bilderOrdner: string;
  /** Eine Datenbank aus einer älteren Version wurde verworfen und neu angelegt. */
  datenbankErsetzt: boolean;
  /** Eigene Fotos der Kamera, je Datensatz ein Ordner unter daten/ */
  uploadOrdner: string;
  ocrModus: OcrModus;
  /** null = keine Texterkennung (ausgeschaltet oder nicht installiert), dann wird abgetippt */
  textLeser: TextLeser | null;
}

export async function bereiteSystemVor(wurzel = WURZEL): Promise<System> {
  const envDatei = join(wurzel, '.env');
  if (existsSync(envDatei)) process.loadEnvFile(envDatei);

  const datensatz = leseDatensatz();
  const gelesen = leseKonfiguration();
  // Die Demo-Texte sind auf die simulierte Erkennung abgestimmt; nur mit ihr treffen die Szenarien zu.
  const konfiguration: KiKonfiguration = datensatz === 'demo' ? { ...gelesen, modus: 'mock' } : gelesen;
  const modell = waehleModell(konfiguration);

  const datenOrdner = datensatz === 'demo' ? join(wurzel, 'testdaten', 'demo') : join(wurzel, 'testdaten');
  const dbPfad = datenbankPfad(wurzel, datensatz);
  mkdirSync(dirname(dbPfad), { recursive: true });
  const { db, ersetzt } = oeffneDatenbankMitStand(dbPfad);
  if (istLeer(db)) await spieleTestdatenEin(db, ladeTestdaten(datenOrdner), modell);

  // Neben der Datenbank; Fotos ohne Label (etwa nach Löschen der Datenbank) werden gleich entfernt.
  const uploadOrdner = bereiteUploadOrdnerVor(join(dirname(dbPfad), datensatz === 'demo' ? 'uploads-demo' : 'uploads'));
  await raeumeUploadsAuf(db, uploadOrdner);
  const ocrModus = leseOcrModus();
  const textLeser = await waehleTextLeser(ocrModus, join(wurzel, 'daten', 'ocr-sprachen'));

  return {
    konfiguration, modell, db, datensatz, datenOrdner, bilderOrdner: join(datenOrdner, 'bilder'), datenbankErsetzt: ersetzt,
    uploadOrdner, ocrModus, textLeser,
  };
}

/** Optionen für den Server; die gebaute Oberfläche liegt in dist/. */
export function serverOptionen(system: System, wurzel = WURZEL): ServerOptionen {
  return {
    db: system.db, bilderOrdner: system.bilderOrdner, modell: system.modell, datenOrdner: system.datenOrdner,
    oberflaecheOrdner: join(wurzel, 'dist'), uploadOrdner: system.uploadOrdner, textLeser: system.textLeser,
  };
}
