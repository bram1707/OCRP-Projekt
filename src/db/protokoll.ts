// Das Entscheidungsprotokoll (AK-22): wer, wann, Ergebnis, Grund. Geschrieben wird nur hier.

import type { DatabaseSync } from 'node:sqlite';

export type Ergebnis = 'bestaetigt' | 'fehler' | 'nachgebessert' | 'freigegeben';

export interface Eintrag {
  anlageId: string;
  labelId: string | null;
  wer: string;
  /** Zeitpunkt als ISO-Text */
  wann: string;
  ergebnis: Ergebnis;
  grund: string | null;
}

export function protokolliere(db: DatabaseSync, e: Eintrag): void {
  db.prepare('INSERT INTO entscheidungen (anlage_id, label_id, wer, wann, ergebnis, grund) VALUES (?, ?, ?, ?, ?, ?)').run(
    e.anlageId, e.labelId, e.wer, e.wann, e.ergebnis, e.grund,
  );
}
