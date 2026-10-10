// Datenbank öffnen und mit fiktiven Testdaten füllen.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { detectLanguage } from '../ai/detectLanguage.ts';
import { mockModell, type SprachModell } from '../ai/mock.ts';
import { protokolliere } from './protokoll.ts';
import { SCHEMA, SCHEMA_STAND } from './schema.ts';
import { anfangsstatus, istFehlergrund, type Fehlergrund, type Status } from './status.ts';

export interface AnlageDaten {
  id: string;
  name: string;
  sollAnzahl: number;
  /** nur für Ausgangszustände der Testdaten: schon von Max freigegeben */
  freigabe?: { von: string; am: string };
}

export interface LabelDaten {
  id: string;
  anlageId: string;
  /** Dateiname in testdaten/bilder/, null = kein Foto erfasst */
  bild: string | null;
  ocrText: string;
  ocrKonfidenz: number;
  /** Ausgangszustand für Testdaten, der schon von Max entschieden wurde */
  ausgangszustand?: { status: 'bestaetigt' | 'fehlerhaft' | 'nachgebessert'; fehlergrund?: Fehlergrund; am: string };
  /** was die simulierte Nachbesserung liefert: neuer OCR-Text, auf Wunsch ein neues Foto */
  nachKorrektur?: { bild?: string; ocrText: string; ocrKonfidenz: number };
  /** nur bei Labels ohne Foto: was die Simulation „Foto nachreichen“ liefert */
  nacherfassung?: { bild: string; ocrText: string; ocrKonfidenz: number };
}

export interface Testdaten {
  anlagen: AnlageDaten[];
  labels: LabelDaten[];
}

const ID = /^[A-Z0-9-]{1,32}$/;
export const BILD_DATEI = /^[A-Za-z0-9_-]{1,64}\.svg$/;

export function oeffneDatenbank(pfad = ':memory:'): DatabaseSync {
  return oeffneDatenbankMitStand(pfad).db;
}

/**
 * Öffnet die Datenbank. Eine Datei mit älterem Schema (etwa aus Stufe 1) wird geleert und
 * neu angelegt; sie enthält nur fiktive Testdaten. `ersetzt` sagt, ob das passiert ist.
 */
export function oeffneDatenbankMitStand(pfad = ':memory:'): { db: DatabaseSync; ersetzt: boolean } {
  const db = new DatabaseSync(pfad);
  db.exec('PRAGMA foreign_keys = ON;');
  const { user_version: stand } = db.prepare('PRAGMA user_version').get() as { user_version: number };
  const { n: tabellen } = db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name IN ('anlagen', 'labels', 'entscheidungen')").get() as { n: number };
  const ersetzt = tabellen > 0 && stand !== SCHEMA_STAND;
  db.exec('BEGIN IMMEDIATE');
  try {
    if (ersetzt) db.exec('DROP TABLE IF EXISTS entscheidungen; DROP TABLE IF EXISTS labels; DROP TABLE IF EXISTS anlagen;');
    db.exec(SCHEMA);
    db.exec(`PRAGMA user_version = ${SCHEMA_STAND}`);
    db.exec('COMMIT');
  } catch (fehler) {
    db.exec('ROLLBACK');
    db.close();
    throw fehler;
  }
  return { db, ersetzt };
}

export function istLeer(db: DatabaseSync): boolean {
  const zeile = db.prepare('SELECT COUNT(*) AS n FROM anlagen').get() as { n: number };
  return zeile.n === 0;
}

/** Liest anlagen.json und labels.json. Die Erwartungswerte liest nur die Testsuite. */
export function ladeTestdaten(ordner: string): Testdaten {
  const anlagen = JSON.parse(readFileSync(join(ordner, 'anlagen.json'), 'utf8')) as AnlageDaten[];
  const labels = JSON.parse(readFileSync(join(ordner, 'labels.json'), 'utf8')) as LabelDaten[];
  pruefeTestdaten({ anlagen, labels }, join(ordner, 'bilder'));
  return { anlagen, labels };
}

function istTextMitSicherheit(d: { ocrText: unknown; ocrKonfidenz: unknown }): boolean {
  return typeof d.ocrText === 'string' && typeof d.ocrKonfidenz === 'number' && d.ocrKonfidenz >= 0 && d.ocrKonfidenz <= 1;
}

function pruefeTestdaten(daten: Testdaten, bilderOrdner: string): void {
  const bildDa = (bild: unknown) => typeof bild === 'string' && BILD_DATEI.test(bild) && existsSync(join(bilderOrdner, bild));
  const anlagenIds = new Set<string>();
  for (const a of daten.anlagen) {
    if (!ID.test(a.id) || anlagenIds.has(a.id)) throw new Error(`Ungültige Anlagen-ID: ${a.id}`);
    if (!Number.isInteger(a.sollAnzahl) || a.sollAnzahl < 1) throw new Error(`Ungültige Soll-Anzahl bei ${a.id}`);
    anlagenIds.add(a.id);
  }
  const labelIds = new Set<string>();
  for (const l of daten.labels) {
    if (!ID.test(l.id) || labelIds.has(l.id)) throw new Error(`Ungültige Label-ID: ${l.id}`);
    if (!anlagenIds.has(l.anlageId)) throw new Error(`Label ${l.id} gehört zu unbekannter Anlage ${l.anlageId}`);
    if (l.bild !== null && !bildDa(l.bild)) {
      throw new Error(`Bild für ${l.id} fehlt oder hat einen ungültigen Namen: ${l.bild}`);
    }
    if (l.ausgangszustand?.fehlergrund !== undefined && !istFehlergrund(l.ausgangszustand.fehlergrund)) {
      throw new Error(`Ungültiger Fehlergrund bei ${l.id}`);
    }
    const k = l.nachKorrektur;
    if (k && (!istTextMitSicherheit(k) || (k.bild !== undefined && !bildDa(k.bild)))) {
      throw new Error(`Ungültige Daten für die Nachbesserung von ${l.id}`);
    }
    const n = l.nacherfassung;
    if (n && (l.bild !== null || !istTextMitSicherheit(n) || !bildDa(n.bild))) {
      throw new Error(`Ungültige Daten für das nachgereichte Foto von ${l.id} (nur bei Labels ohne Foto)`);
    }
    labelIds.add(l.id);
  }
}

function plusMinuten(iso: string, minuten: number): string {
  return new Date(new Date(iso).getTime() + minuten * 60_000).toISOString();
}

/** Spielt die Testdaten ein. Die Spracherkennung läuft dabei für jedes Label mit Foto. */
export async function spieleTestdatenEin(
  db: DatabaseSync,
  daten: Testdaten,
  modell: SprachModell = mockModell,
): Promise<void> {
  // Erst alle Erkennungen (asynchron), dann alles in einer Transaktion schreiben.
  const erkennungen = await Promise.all(
    daten.labels.map((l) => (l.bild === null ? detectLanguage('', 0, modell) : detectLanguage(l.ocrText, l.ocrKonfidenz, modell))),
  );

  const neueAnlage = db.prepare(
    'INSERT INTO anlagen (id, name, soll_anzahl, freigegeben_am, freigegeben_von) VALUES (?, ?, ?, ?, ?)',
  );
  const neuesLabel = db.prepare(`
    INSERT INTO labels (id, anlage_id, bild_pfad, ocr_text, ocr_konfidenz, sprachen, konfidenz_je_sprache,
      sprach_konfidenz, prioritaet, begruendung, status, letzter_fehlergrund,
      korrektur_bild_pfad, korrektur_ocr_text, korrektur_ocr_konfidenz,
      nacherfassung_bild_pfad, nacherfassung_ocr_text, nacherfassung_ocr_konfidenz)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

  db.exec('BEGIN IMMEDIATE');
  try {
    for (const a of daten.anlagen) {
      neueAnlage.run(a.id, a.name, a.sollAnzahl, a.freigabe?.am ?? null, a.freigabe?.von ?? null);
    }
    daten.labels.forEach((l, i) => {
      const e = erkennungen[i]!;
      const hatFoto = l.bild !== null;
      const zustand = l.ausgangszustand;
      const status: Status = zustand?.status ?? anfangsstatus(hatFoto, l.ocrKonfidenz, e.konfidenz, e.sprachen);
      neuesLabel.run(
        l.id, l.anlageId, l.bild, hatFoto ? l.ocrText : '', hatFoto ? l.ocrKonfidenz : 0,
        JSON.stringify(e.sprachen), JSON.stringify(e.konfidenzJeSprache), e.konfidenz, e.prioritaet,
        hatFoto ? e.begruendung : 'Kein Foto erfasst.', status, zustand?.fehlergrund ?? null,
        l.nachKorrektur?.bild ?? null, l.nachKorrektur?.ocrText ?? null, l.nachKorrektur?.ocrKonfidenz ?? null,
        l.nacherfassung?.bild ?? null, l.nacherfassung?.ocrText ?? null, l.nacherfassung?.ocrKonfidenz ?? null,
      );
      // Ausgangszustände bekommen dieselben Protokolleinträge wie echte Entscheidungen (AK-22).
      const eintrag = { anlageId: l.anlageId, labelId: l.id, wer: 'max', grund: null };
      if (zustand?.status === 'bestaetigt') {
        protokolliere(db, { ...eintrag, wann: zustand.am, ergebnis: 'bestaetigt' });
      } else if (zustand) {
        protokolliere(db, { ...eintrag, wann: zustand.am, ergebnis: 'fehler', grund: zustand.fehlergrund ?? null });
        if (zustand.status === 'nachgebessert') {
          protokolliere(db, { ...eintrag, wer: 'simulation', wann: plusMinuten(zustand.am, 30), ergebnis: 'nachgebessert' });
        }
      }
    });
    for (const a of daten.anlagen) {
      if (a.freigabe) {
        protokolliere(db, { anlageId: a.id, labelId: null, wer: a.freigabe.von, wann: a.freigabe.am, ergebnis: 'freigegeben', grund: null });
      }
    }
    db.exec('COMMIT');
  } catch (fehler) {
    db.exec('ROLLBACK');
    throw fehler;
  }
}
