// Schreibende Aktionen. Jede betrifft genau ein Label bzw. genau eine Anlage (AK-11)
// und wird mit wer, wann, Ergebnis und Grund protokolliert (AK-22).
// Die KI ruft keine dieser Funktionen auf (AK-03); sie werden nur über Max' Aktionen ausgelöst.

import type { DatabaseSync } from 'node:sqlite';
import type { SprachAntwort } from '../ai/antwortSchema.ts';
import { detectLanguage } from '../ai/detectLanguage.ts';
import { mockModell, type SprachModell } from '../ai/mock.ts';
import { holeAnlage, holeLabel, holeLabels, type Anlage, type Label } from './abfragen.ts';
import { protokolliere } from './protokoll.ts';
import { anfangsstatus, bereinigeFehlertext, FEHLERTEXT_MAX, istFehlergrund, PRUEFBAR, pruefeFreigabe, STATUS_TEXT, type Status } from './status.ts';

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

/** Die einzige Anlage, für die man im Prototyp eigene Fotos hochladen darf (Testanlage „Eigene Fotos“). */
export const ANLAGE_EIGENE_FOTOS = 'EIG1';

/** Die simulierte Instandhaltung hat für eigene Fotos nichts zu liefern; ein neues Foto kommt nur von der Kamera-Seite. */
function nichtFuerEigeneFotos(label: Label): void {
  if (label.anlageId === ANLAGE_EIGENE_FOTOS) {
    throw new Fachfehler(409, `Für Label ${label.id} gibt es ein neues Foto nur über die Kamera-Seite.`);
  }
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
    protokolliere(db, { anlageId: label.anlageId, labelId: label.id, wer, wann: jetzt.toISOString(), ergebnis: 'bestaetigt', grund: null });
    return holeLabel(db, label.id)!;
  });
}

/** `text` zählt nur beim Grund „Sonstiges“; dort ist er Pflicht. */
export function meldeFehler(db: DatabaseSync, labelId: string, grund: unknown, wer: string, jetzt = new Date(), text?: unknown): Label {
  if (!istFehlergrund(grund)) {
    throw new Fachfehler(400, 'Bitte einen Grund wählen: unleserlich, Sprache falsch, Label beschädigt oder Sonstiges.');
  }
  const notiz = grund === 'sonstiges' ? bereinigeFehlertext(text) : null;
  if (grund === 'sonstiges' && notiz === null) {
    throw new Fachfehler(400, `Bitte beschreiben Sie bei „Sonstiges“ kurz, was nicht stimmt (höchstens ${FEHLERTEXT_MAX} Zeichen).`);
  }
  return inTransaktion(db, () => {
    const label = ladePruefbaresLabel(db, labelId);
    db.prepare("UPDATE labels SET status = 'fehlerhaft', letzter_fehlergrund = ?, letzter_fehlertext = ? WHERE id = ?").run(grund, notiz, label.id);
    // Sicherheitsnetz: Ein gemeldetes Label hebt eine gespeicherte Freigabe immer auf.
    db.prepare('UPDATE anlagen SET freigegeben_am = NULL, freigegeben_von = NULL WHERE id = ?').run(label.anlageId);
    protokolliere(db, { anlageId: label.anlageId, labelId: label.id, wer, wann: jetzt.toISOString(), ergebnis: 'fehler', grund, notiz });
    return holeLabel(db, label.id)!;
  });
}

/** Ersetzt Foto, Text und Ergebnis der Spracherkennung eines Labels. */
function schreibeErfassung(
  db: DatabaseSync,
  labelId: string,
  erfassung: { bildPfad: string | null; ocrText: string; ocrKonfidenz: number },
  e: SprachAntwort,
): void {
  db.prepare(`UPDATE labels SET bild_pfad = ?, ocr_text = ?, ocr_konfidenz = ?, sprachen = ?, konfidenz_je_sprache = ?,
      sprach_konfidenz = ?, prioritaet = ?, begruendung = ?
    WHERE id = ?`).run(
    erfassung.bildPfad, erfassung.ocrText, erfassung.ocrKonfidenz, JSON.stringify(e.sprachen), JSON.stringify(e.konfidenzJeSprache),
    e.konfidenz, e.prioritaet, e.begruendung, labelId,
  );
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
  nichtFuerEigeneFotos(vorher);
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
      schreibeErfassung(db, label.id, { ...korrektur, bildPfad: korrektur.bildPfad ?? label.bildPfad }, neu);
      db.prepare(`UPDATE labels SET korrektur_bild_pfad = NULL, korrektur_ocr_text = NULL, korrektur_ocr_konfidenz = NULL
        WHERE id = ?`).run(label.id);
    }
    db.prepare("UPDATE labels SET status = 'nachgebessert' WHERE id = ?").run(label.id);
    protokolliere(db, {
      anlageId: label.anlageId, labelId: label.id, wer: 'simulation', wann: jetzt.toISOString(), ergebnis: 'nachgebessert', grund: null,
    });
    return holeLabel(db, label.id)!;
  });
}

/**
 * Simulation „Foto nachreichen“: Für ein Label ohne Foto liefert die Instandhaltung Foto und Text.
 * Beides kommt nur aus den Testdaten auf dem Server, nie aus der Anfrage. Die Spracherkennung
 * läuft, der neue Status kommt wie bei der Erfassung aus ihrem Ergebnis (Offen oder Unsicher).
 */
export async function erfasseNach(
  db: DatabaseSync,
  labelId: string,
  jetzt = new Date(),
  modell: SprachModell = mockModell,
): Promise<Label> {
  const vorher = holeLabel(db, labelId);
  if (!vorher) throw new Fachfehler(404, 'Dieses Label gibt es nicht.');
  nichtFuerEigeneFotos(vorher);
  if (vorher.status !== 'fehlt') {
    throw new Fachfehler(409, `Nur für Labels ohne Foto kann ein Foto nachgereicht werden. Label ${vorher.id} ist „${STATUS_TEXT[vorher.status]}“.`);
  }
  const erfassung = vorher.nacherfassung;
  if (!erfassung) throw new Fachfehler(409, `Für Label ${vorher.id} liegt in der Simulation kein Foto vor.`);
  const neu = await detectLanguage(erfassung.ocrText, erfassung.ocrKonfidenz, modell);

  return inTransaktion(db, () => {
    const label = holeLabel(db, labelId);
    if (!label || label.status !== 'fehlt' || !label.nacherfassung) {
      throw new Fachfehler(409, 'Das Label wurde inzwischen geändert. Bitte neu laden.');
    }
    schreibeErfassung(db, label.id, erfassung, neu);
    const status = anfangsstatus(true, erfassung.ocrKonfidenz, neu.konfidenz, neu.sprachen);
    db.prepare(`UPDATE labels SET status = ?, nacherfassung_bild_pfad = NULL, nacherfassung_ocr_text = NULL,
        nacherfassung_ocr_konfidenz = NULL
      WHERE id = ?`).run(status, label.id);
    protokolliere(db, {
      anlageId: label.anlageId, labelId: label.id, wer: 'simulation', wann: jetzt.toISOString(), ergebnis: 'nacherfasst', grund: null,
    });
    return holeLabel(db, label.id)!;
  });
}

/**
 * Max nimmt eine Bestätigung zurück, solange die Anlage nicht freigegeben ist (F5).
 * Das Label bekommt den Status von vorher: „Nachgebessert“, wenn es aus der Nachbesserung kam,
 * sonst den Status nach der Erfassung (Offen oder Unsicher).
 */
export function nimmBestaetigungZurueck(db: DatabaseSync, labelId: string, wer: string, jetzt = new Date()): Label {
  return inTransaktion(db, () => {
    const label = holeLabel(db, labelId);
    if (!label) throw new Fachfehler(404, 'Dieses Label gibt es nicht.');
    if (label.status !== 'bestaetigt') {
      throw new Fachfehler(409, `Nur bestätigte Labels können zurückgenommen werden. Label ${label.id} ist „${STATUS_TEXT[label.status]}“.`);
    }
    const anlage = holeAnlage(db, label.anlageId)!;
    if (anlage.freigegebenAm) {
      throw new Fachfehler(409, `${anlage.name} ist bereits freigegeben. Eine Bestätigung lässt sich nur vor der Freigabe zurücknehmen.`);
    }
    const vorher: Status = label.nachgebessert
      ? 'nachgebessert'
      : anfangsstatus(label.bildPfad !== null, label.ocrKonfidenz, label.sprachKonfidenz, label.sprachen);
    db.prepare('UPDATE labels SET status = ? WHERE id = ?').run(vorher, label.id);
    protokolliere(db, { anlageId: label.anlageId, labelId: label.id, wer, wann: jetzt.toISOString(), ergebnis: 'zurueckgenommen', grund: null });
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
    protokolliere(db, { anlageId: anlage.id, labelId: null, wer, wann: jetzt.toISOString(), ergebnis: 'freigegeben', grund: null });
    return holeAnlage(db, anlage.id)!;
  });
}



/** Aus diesen Status nimmt die Kamera ein (neues) Foto auf; ein bestätigtes Label bleibt, wie es ist. */
const AUFNAHME_MOEGLICH: readonly Status[] = ['fehlt', 'offen', 'unsicher', 'fehlerhaft', 'nachgebessert'];

/** Prüft vor dem Speichern des Fotos, ob für dieses Label ein Foto aufgenommen werden darf. */
export function pruefeFotoAufnahme(db: DatabaseSync, labelId: string): Label {
  const label = holeLabel(db, labelId);
  if (!label) throw new Fachfehler(404, 'Dieses Label gibt es nicht.');
  if (label.anlageId !== ANLAGE_EIGENE_FOTOS) {
    throw new Fachfehler(409, 'Eigene Fotos gibt es nur für die Plätze der Testanlage „Eigene Fotos“.');
  }
  const anlage = holeAnlage(db, label.anlageId)!;
  if (anlage.freigegebenAm) throw new Fachfehler(409, `${anlage.name} ist bereits freigegeben.`);
  if (!AUFNAHME_MOEGLICH.includes(label.status)) {
    throw new Fachfehler(409, `Label ${label.id} ist „${STATUS_TEXT[label.status]}“. Dafür wird kein neues Foto gebraucht.`);
  }
  return label;
}

/**
 * Eigenes Foto (Kamera, nur im Prototyp): Foto und gelesener Text ersetzen den bisherigen Stand.
 * War das Label gemeldet, kommt es als „Nachgebessert“ zurück zu Max (wie die Nachbesserung),
 * sonst bekommt es den Status nach der Erfassung (Offen oder Unsicher). Gibt das ersetzte Foto zurück,
 * damit der Server die alte Datei löschen kann.
 */
export async function nimmFotoAuf(
  db: DatabaseSync,
  labelId: string,
  erfassung: { bildPfad: string; ocrText: string; ocrKonfidenz: number; abgetippt: boolean },
  jetzt = new Date(),
  modell: SprachModell = mockModell,
): Promise<{ label: Label; altesBild: string | null }> {
  pruefeFotoAufnahme(db, labelId);
  const erkannt = await detectLanguage(erfassung.ocrText, erfassung.ocrKonfidenz, modell);
  const neu: SprachAntwort = erfassung.abgetippt
    ? { ...erkannt, begruendung: `Text abgetippt, nicht automatisch gelesen. ${erkannt.begruendung}` }
    : erkannt;

  return inTransaktion(db, () => {
    const label = pruefeFotoAufnahme(db, labelId);
    const nachbesserung = label.status === 'fehlerhaft' || label.status === 'nachgebessert';
    schreibeErfassung(db, label.id, erfassung, neu);
    const status: Status = nachbesserung ? 'nachgebessert' : anfangsstatus(true, erfassung.ocrKonfidenz, neu.konfidenz, neu.sprachen);
    db.prepare('UPDATE labels SET status = ? WHERE id = ?').run(status, label.id);
    protokolliere(db, {
      anlageId: label.anlageId, labelId: label.id, wer: 'kamera', wann: jetzt.toISOString(),
      ergebnis: nachbesserung ? 'nachgebessert' : 'nacherfasst', grund: null,
    });
    return { label: holeLabel(db, label.id)!, altesBild: label.bildPfad };
  });
}
