// Hochgeladene Fotos: Typ nur aus den ersten Bytes, nie aus Dateiname oder Angabe des Browsers.
// SVG und alles andere werden abgewiesen, weil sie Skripte enthalten könnten.

export type BildTyp = 'png' | 'jpeg';

/** Höchstens 5 MB je Foto, gilt nur für den Upload. */
export const MAX_FOTO_BYTES = 5 * 1024 * 1024;

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG = [0xff, 0xd8, 0xff];

const beginntMit = (daten: Uint8Array, signatur: number[]) => daten.length > signatur.length && signatur.every((b, i) => daten[i] === b);

export function erkenneBildtyp(daten: Uint8Array): BildTyp | null {
  if (beginntMit(daten, PNG)) return 'png';
  if (beginntMit(daten, JPEG)) return 'jpeg';
  return null;
}

export const ENDUNG: Record<BildTyp, string> = { png: 'png', jpeg: 'jpg' };
export const MEDIENTYP: Record<BildTyp, string> = { png: 'image/png', jpeg: 'image/jpeg' };

/** Hochgeladene Fotos liegen unter einem zufälligen Namen, nie unter dem Namen des Nutzers. */
export const UPLOAD_DATEI = /^uploads\/[a-f0-9]{32}\.(png|jpg)$/;
