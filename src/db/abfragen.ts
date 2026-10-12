// Lesende Abfragen. Jede Zeile wird in ein typisiertes Objekt übersetzt.

import type { DatabaseSync } from 'node:sqlite';
import type { Prioritaet } from '../ai/antwortSchema.ts';
import type { Ergebnis } from './protokoll.ts';
import type { Fehlergrund, Status } from './status.ts';

export interface Anlage {
  id: string;
  name: string;
  sollAnzahl: number;
  freigegebenAm: string | null;
  freigegebenVon: string | null;
}

export interface Label {
  id: string;
  anlageId: string;
  bildPfad: string | null;
  ocrText: string;
  ocrKonfidenz: number;
  sprachen: string[];
  konfidenzJeSprache: Record<string, number>;
  sprachKonfidenz: number;
  prioritaet: Prioritaet;
  begruendung: string;
  status: Status;
  letzterFehlergrund: Fehlergrund | null;
  /** Max' Beschreibung beim Grund „Sonstiges“ */
  letzterFehlertext: string | null;
  /** kam mindestens einmal aus der Nachbesserung zurück */
  nachgebessert: boolean;
  /** was die simulierte Nachbesserung liefert; erscheint nie in einer Antwort der Schnittstelle */
  korrektur: { bildPfad: string | null; ocrText: string; ocrKonfidenz: number } | null;
  /** was die Simulation „Foto nachreichen“ liefert; erscheint nie in einer Antwort der Schnittstelle */
  nacherfassung: { bildPfad: string; ocrText: string; ocrKonfidenz: number } | null;
}

export interface Entscheidung {
  id: number;
  anlageId: string;
  labelId: string | null;
  wer: string;
  wann: string;
  ergebnis: Ergebnis;
  grund: string | null;
}

type Zeile = Record<string, unknown>;

function zuAnlage(z: Zeile): Anlage {
  return {
    id: z.id as string,
    name: z.name as string,
    sollAnzahl: z.soll_anzahl as number,
    freigegebenAm: (z.freigegeben_am as string | null) ?? null,
    freigegebenVon: (z.freigegeben_von as string | null) ?? null,
  };
}

function zuLabel(z: Zeile): Label {
  return {
    id: z.id as string,
    anlageId: z.anlage_id as string,
    bildPfad: (z.bild_pfad as string | null) ?? null,
    ocrText: z.ocr_text as string,
    ocrKonfidenz: z.ocr_konfidenz as number,
    sprachen: JSON.parse(z.sprachen as string) as string[],
    konfidenzJeSprache: JSON.parse(z.konfidenz_je_sprache as string) as Record<string, number>,
    sprachKonfidenz: z.sprach_konfidenz as number,
    prioritaet: z.prioritaet as Prioritaet,
    begruendung: z.begruendung as string,
    status: z.status as Status,
    letzterFehlergrund: (z.letzter_fehlergrund as Fehlergrund | null) ?? null,
    letzterFehlertext: (z.letzter_fehlertext as string | null) ?? null,
    nachgebessert: z.nachgebessert === 1,
    korrektur:
      z.korrektur_ocr_text == null
        ? null
        : {
            bildPfad: (z.korrektur_bild_pfad as string | null) ?? null,
            ocrText: z.korrektur_ocr_text as string,
            ocrKonfidenz: z.korrektur_ocr_konfidenz as number,
          },
    nacherfassung:
      z.nacherfassung_bild_pfad == null
        ? null
        : {
            bildPfad: z.nacherfassung_bild_pfad as string,
            ocrText: z.nacherfassung_ocr_text as string,
            ocrKonfidenz: z.nacherfassung_ocr_konfidenz as number,
          },
  };
}

const LABEL_SPALTEN = `l.*, EXISTS (
  SELECT 1 FROM entscheidungen e WHERE e.label_id = l.id AND e.ergebnis = 'nachgebessert'
) AS nachgebessert`;

export function holeAnlagen(db: DatabaseSync): Anlage[] {
  return (db.prepare('SELECT * FROM anlagen ORDER BY name').all() as Zeile[]).map(zuAnlage);
}

export function holeAnlage(db: DatabaseSync, id: string): Anlage | undefined {
  const z = db.prepare('SELECT * FROM anlagen WHERE id = ?').get(id) as Zeile | undefined;
  return z && zuAnlage(z);
}

export function holeLabels(db: DatabaseSync, anlageId: string): Label[] {
  const zeilen = db.prepare(`SELECT ${LABEL_SPALTEN} FROM labels l WHERE l.anlage_id = ? ORDER BY l.id`).all(anlageId);
  return (zeilen as Zeile[]).map(zuLabel);
}

export function holeLabel(db: DatabaseSync, id: string): Label | undefined {
  const z = db.prepare(`SELECT ${LABEL_SPALTEN} FROM labels l WHERE l.id = ?`).get(id) as Zeile | undefined;
  return z && zuLabel(z);
}

/** Ob gerade ein Label auf dieses Foto verweist. Nur solche Fotos liefert der Server aus. */
export function istBildInVerwendung(db: DatabaseSync, datei: string): boolean {
  return db.prepare('SELECT 1 FROM labels WHERE bild_pfad = ? LIMIT 1').get(datei) !== undefined;
}

export function holeEntscheidungen(db: DatabaseSync, labelId: string): Entscheidung[] {
  const zeilen = db.prepare('SELECT * FROM entscheidungen WHERE label_id = ? ORDER BY id').all(labelId) as Zeile[];
  return zeilen.map((z) => ({
    id: z.id as number,
    anlageId: z.anlage_id as string,
    labelId: (z.label_id as string | null) ?? null,
    wer: z.wer as string,
    wann: z.wann as string,
    ergebnis: z.ergebnis as Entscheidung['ergebnis'],
    grund: (z.grund as string | null) ?? null,
  }));
}

export interface LetzteEntscheidung {
  wer: string;
  wann: string;
  grund: string | null;
  notiz: string | null;
}

/** Je Label der jeweils letzte Protokolleintrag je Ergebnis, etwa wann es zuletzt bestätigt wurde (AK-22, AK-43). */
export function holeLetzteEntscheidungen(db: DatabaseSync): Map<string, Partial<Record<Ergebnis, LetzteEntscheidung>>> {
  const zeilen = db.prepare('SELECT label_id, wer, wann, ergebnis, grund, notiz FROM entscheidungen WHERE label_id IS NOT NULL ORDER BY id').all() as Zeile[];
  const je = new Map<string, Partial<Record<Ergebnis, LetzteEntscheidung>>>();
  for (const z of zeilen) {
    const id = z.label_id as string;
    const eintraege = je.get(id) ?? {};
    eintraege[z.ergebnis as Ergebnis] = { wer: z.wer as string, wann: z.wann as string, grund: (z.grund as string | null) ?? null, notiz: (z.notiz as string | null) ?? null };
    je.set(id, eintraege);
  }
  return je;
}
