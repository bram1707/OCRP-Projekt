// Texterkennung für hochgeladene Fotos. Sie macht nur einen Vorschlag, wie die Spracherkennung;
// entscheiden tut Max. Wahl über OCR_MODUS in .env: „tesseract“ (Standard) oder „aus“.
// Ohne Texterkennung tippt man den Text auf der Kamera-Seite ab (Rückfall).

import type { BildTyp } from './bild.ts';

export interface Gelesen {
  text: string;
  /** 0 bis 1 */
  konfidenz: number;
  /** Wörter, die die Texterkennung nur unsicher gelesen hat (Optimierung 2, Punkt 4) */
  unsichereWoerter?: string[];
}

export type TextLeser = (bild: Buffer, typ: BildTyp) => Promise<Gelesen>;

export type OcrModus = 'tesseract' | 'aus';

export function leseOcrModus(env: NodeJS.ProcessEnv = process.env): OcrModus {
  const wert = env.OCR_MODUS?.trim() ?? '';
  if (wert === '' || wert === 'tesseract') return 'tesseract';
  if (wert === 'aus') return 'aus';
  throw new Error(`OCR_MODUS=${wert} ist unbekannt. Erlaubt sind „tesseract“ oder „aus“.`);
}

/** Begrenzt die Sicherheit auf 0..1; Unsinn wird 0. */
export function begrenzeKonfidenz(wert: number): number {
  return Number.isFinite(wert) ? Math.min(Math.max(wert, 0), 1) : 0;
}

/**
 * Lädt tesseract.js nur bei Bedarf. Fehlt die Bibliothek, gibt es keine Texterkennung (null),
 * der Server läuft trotzdem und bietet das Abtippen an.
 */
export async function waehleTextLeser(modus: OcrModus, sprachOrdner: string): Promise<TextLeser | null> {
  if (modus === 'aus') return null;
  try {
    const { erstelleTesseractLeser } = await import('./tesseract.ts');
    return erstelleTesseractLeser({ sprachOrdner });
  } catch (fehler) {
    console.warn(`Texterkennung nicht verfügbar, Text wird abgetippt: ${(fehler as Error).message}`);
    return null;
  }
}
