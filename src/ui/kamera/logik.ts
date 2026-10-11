// Texte und Regeln der Kamera-Seite, ohne React, damit sie einzeln testbar sind.

import type { LabelAnsicht, Status } from '../api.ts';
import { MAX_FOTO_BYTES } from './aktionen.ts';

/** Für diese Plätze nimmt der Server ein (neues) Foto an, solange die Anlage nicht freigegeben ist. */
const AUFNAHME: readonly Status[] = ['fehlt', 'offen', 'unsicher', 'fehlerhaft', 'nachgebessert'];

export function kannFotoAufnehmen(platz: LabelAnsicht, anlageFreigegeben: boolean): boolean {
  return !anlageFreigegeben && AUFNAHME.includes(platz.status);
}

/** Was mit dem Platz gerade los ist, in einem Satz. */
export function platzText(platz: LabelAnsicht): string {
  switch (platz.status) {
    case 'fehlt':
      return 'Noch kein Foto.';
    case 'offen':
    case 'unsicher':
      return 'Foto liegt bei Max zur Prüfung.';
    case 'nachgebessert':
      return 'Neues Foto liegt bei Max zur Prüfung.';
    case 'fehlerhaft':
      return `Max hat einen Fehler gemeldet${platz.letzterFehlergrundText ? ` (${platz.letzterFehlergrundText})` : ''}. Bitte ein neues Foto hochladen.`;
    case 'bestaetigt':
      return 'Von Max bestätigt.';
  }
}

/** Der erste Platz, der ein Foto braucht: zuerst gemeldete, dann leere, dann andere. */
export function vorschlag(plaetze: readonly LabelAnsicht[], anlageFreigegeben: boolean): string | null {
  const moeglich = plaetze.filter((p) => kannFotoAufnehmen(p, anlageFreigegeben));
  return (moeglich.find((p) => p.status === 'fehlerhaft') ?? moeglich.find((p) => p.status === 'fehlt') ?? moeglich[0])?.id ?? null;
}

/** Prüft die Datei vor dem Senden; der Server prüft ein zweites Mal nach den ersten Bytes. */
export function dateiFehler(datei: { size: number; type: string } | null): string | null {
  if (!datei) return 'Bitte zuerst ein Foto wählen.';
  if (datei.type !== '' && datei.type !== 'image/png' && datei.type !== 'image/jpeg') return 'Bitte ein Foto als PNG oder JPEG wählen.';
  if (datei.size === 0) return 'Die Datei ist leer.';
  if (datei.size > MAX_FOTO_BYTES) return 'Das Foto ist zu groß. Bitte höchstens 5 MB.';
  return null;
}

export function groesseText(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}
