// Schreibende Aktionen. Jede betrifft genau ein Label bzw. genau eine Anlage (AK-11)
// und wird mit wer, wann, Ergebnis und Grund protokolliert (AK-22).
// Die KI ruft keine dieser Funktionen auf (AK-03); sie werden nur über Max' Aktionen ausgelöst.

import type { DatabaseSync } from 'node:sqlite';
import { detectLanguage } from '../ai/detectLanguage.ts';
import { mockModell, type SprachModell } from '../ai/mock.ts';
import { holeAnlage, holeLabel, holeLabels, type Anlage, type Label } from './abfragen.ts';
import { istFehlergrund, PRUEFBAR, pruefeFreigabe, STATUS_TEXT } from './status.ts';

/** Fachlicher Fehler mit passendem HTTP-Status und einer Meldung in einfacher Sprache. */
export class Fachfehler extends Error {
  status: number;
  details: unknown;
  constructor(status: number, meldung: string, details?: unknown) {
    super(meldung);
    this.name = 'Fachfehler';
    this.status = status;
    this.details = details;
  }
}

function inTransaktion<T>(db: DatabaseSync, arbeit: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const ergebnis = arbeit();
    db.exec('COMMIT');
    return ergebnis;
  } catch (fehler) {
    db.exec('ROLLBACK');
    throw fehler;
  }
}

function protokolliere(
  db: DatabaseSync,
  anlageId: string,
  labelId: string | null,
  wer: string,
  jetzt: Date,
  ergebnis: 'bestaetigt' | 'fehler' | 'nachgebessert' | 'freigegeben',
  grund: string | null,
): void {
  db.prepare('INSERT INTO entscheidungen (anlage_id, label_id, wer, wann, ergebnis, grund) VALUES (?, ?, ?, ?, ?, ?)').run(
    anlageId, labelId, wer, jetzt.toISOString(), ergebnis, grund,
  );
}

function ladePruefbaresLabel(db: DatabaseSync, labelId: string): Label {
  const label = holeLabel(db, labelId);
  if (!label) throw new Fachfehler(404, 'Dieses Label gibt es nicht.');
  if (!PRUEFBAR.includes(label.status)) {
    throw new Fachfehler(409, `Label ${label.id} ist „${STATUS_TEXT[label.status]}“ und kann gerade nicht geprüft werden.`);
  }
  return label;
}

export function bestaetigeLabel(db: DatabaseSync, labelId: string, wer: string, jetzt = new Date()): Label {
  return inTransaktion(db, () => {
    const label = ladePruefbaresLabel(db, labelId);
    db.prepare("UPDATE labels SET status = 'bestaetigt' WHERE id = ?").run(label.id);
    protokolliere(db, label.anlageId, label.id, wer, jetzt, 'bestaetigt', null);
    return holeLabel(db, label.id)!;
  });
}

export function meldeFehler(db: DatabaseSync, labelId: string, grund: unknown, wer: string, jetzt = new Date()): Label {
  if (!istFehlergrund(grund)) {
    throw new Fachfehler(400, 'Bitte einen Grund wählen: unleserlich, Sprache falsch oder Label beschädigt.');
  }
  return inTransaktion(db, () => {
    const label = ladePruefbaresLabel(db, labelId);
    db.prepare("UPDATE labels SET status = 'fehlerhaft', letzter_fehlergrund = ? WHERE id = ?").run(grund, label.id);
    // Sicherheitsnetz: Ein gemeldetes Label hebt eine gespeicherte Freigabe immer auf.
    db.prepare('UPDATE anlagen SET freigegeben_am = NULL, freigegeben_von = NULL WHERE id = ?').run(label.anlageId);
    protokolliere(db, label.anlageId, label.id, wer, jetzt, 'fehler', grund);
    return holeLabel(db, label.id)!;
  });
}

/**
 * Simulierte Nachbesserung: Das Label wurde ersetzt und kommt als „Nachgebessert“ zurück
 * in Max' Prüfung. Liegen Korrekturdaten vor (neues Foto, neuer Text), läuft die
 * Spracherkennung erneut. Max' Fehlerhinweis bleibt gespeichert (AK-12).
 */
export async function bessereNach(
  db: DatabaseSync,
  labelId: string,
  jetzt = new Date(),
  modell: SprachModell = mockModell,
): Promise<Label> {
  const vorher = holeLabel(db, labelId);
  if (!vorher) throw new Fachfehler(404, 'Dieses Label gibt es nicht.');
  if (vorher.status !== 'fehlerhaft') {
    throw new Fachfehler(409, `Nur fehlerhafte Labels können nachgebessert werden. Label ${vorher.id} ist „${STATUS_TEXT[vorher.status]}“.`);
  }
  const korrektur = vorher.korrektur;
  const neu = korrektur ? await detectLanguage(korrektur.ocrText, korrektur.ocrKonfidenz, modell) : null;

  return inTransaktion(db, () => {
    // Zwischen Erkennung und Schreiben könnte sich der Status geändert haben: erneut prüfen.
    const label = holeLabel(db, labelId);
    if (!label || label.status !== 'fehlerhaft') {
      throw new Fachfehler(409, 'Das Label wurde inzwischen geändert. Bitte neu laden.');
    }
    if (korrektur && neu) {
      db.prepare(`UPDATE labels SET ocr_text = ?, ocr_konfidenz = ?, sprachen = ?, konfidenz_je_sprache = ?,
          sprach_konfidenz = ?, prioritaet = ?, begruendung = ?, korrektur_ocr_text = NULL, korrektur_ocr_konfidenz = NULL
        WHERE id = ?`).run(
        korrektur.ocrText, korrektur.ocrKonfidenz, JSON.stringify(neu.sprachen), JSON.stringify(neu.konfidenzJeSprache),
        neu.konfidenz, neu.prioritaet, neu.begruendung, label.id,
      );
    }
    db.prepare("UPDATE labels SET status = 'nachgebessert' WHERE id = ?").run(label.id);
    protokolliere(db, label.anlageId, label.id, 'simulation', jetzt, 'nachgebessert', null);
    return holeLabel(db, label.id)!;
  });
}

/** Freigabe nur durch Max und nur, wenn der Server alle Labels als bestätigt sieht (AK-02). */
export function gebeAnlageFrei(db: DatabaseSync, anlageId: string, wer: string, jetzt = new Date()): Anlage {
  return inTransaktion(db, () => {
    const anlage = holeAnlage(db, anlageId);
    if (!anlage) throw new Fachfehler(404, 'Diese Anlage gibt es nicht.');
    if (anlage.freigegebenAm) throw new Fachfehler(409, `${anlage.name} ist bereits freigegeben.`);
    const pruefung = pruefeFreigabe(anlage.sollAnzahl, holeLabels(db, anlage.id));
    if (!pruefung.moeglich) {
      throw new Fachfehler(409, `${anlage.name} kann noch nicht freigegeben werden.`, pruefung.hinderungsgruende);
    }
    db.prepare('UPDATE anlagen SET freigegeben_am = ?, freigegeben_von = ? WHERE id = ?').run(jetzt.toISOString(), wer, anlage.id);
    protokolliere(db, anlage.id, null, wer, jetzt, 'freigegeben', null);
    return holeAnlage(db, anlage.id)!;
  });
}
