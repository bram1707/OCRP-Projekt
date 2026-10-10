// detectLanguage(ocrText, ocrKonfidenz): Sprachvorschlag für ein Label (Prompt 4, AK-30 bis AK-33).
// Die KI macht nur einen Vorschlag. Sie kennt keine Soll-Sprache und entscheidet nichts.

import { pruefeAntwort, unbekannteAntwort, type SprachAntwort } from './antwortSchema.ts';
import { mockModell, type SprachModell } from './mock.ts';

export const SCHWELLE_SPRACHE = 0.9;
export const SCHWELLE_OCR = 0.8;

/** Die eine Regel für „Sprache nicht sicher erkannt“: unter 90 % oder keine Sprache erkannt (AK-16). */
export function istSpracheUnsicher(sprachKonfidenz: number, sprachen: readonly string[]): boolean {
  return sprachKonfidenz < SCHWELLE_SPRACHE || sprachen.includes('unbekannt');
}

export function istUnsicher(ocrKonfidenz: number, sprachKonfidenz: number, sprachen: readonly string[]): boolean {
  return ocrKonfidenz < SCHWELLE_OCR || istSpracheUnsicher(sprachKonfidenz, sprachen);
}

export async function detectLanguage(
  ocrText: string,
  ocrKonfidenz: number,
  modell: SprachModell = mockModell,
): Promise<SprachAntwort> {
  const ocr = Number.isFinite(ocrKonfidenz) ? Math.min(Math.max(ocrKonfidenz, 0), 1) : 0;
  if (ocrText.trim() === '') return unbekannteAntwort('Kein Text erkannt.');

  let roh: string;
  try {
    roh = await modell(ocrText);
  } catch {
    return unbekannteAntwort('Spracherkennung hat nicht geantwortet, bitte genau prüfen.');
  }

  const ergebnis = pruefeAntwort(roh);
  if (!ergebnis.gueltig) {
    return unbekannteAntwort('Antwort der Spracherkennung war ungültig, bitte genau prüfen.');
  }

  const antwort = ergebnis.antwort;
  // Die Schwellen gelten unabhängig davon, was das Modell selbst als Priorität angibt.
  // Eine „genau_pruefen“-Angabe des Modells wird nie heruntergestuft.
  if (antwort.prioritaet === 'normal' && istUnsicher(ocr, antwort.konfidenz, antwort.sprachen)) {
    antwort.prioritaet = 'genau_pruefen';
  }
  return antwort;
}
