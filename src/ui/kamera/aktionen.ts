// Schreibender Aufruf der Kamera-Seite (nur im Prototyp): genau ein Foto für genau einen Platz der
// Testanlage „Eigene Fotos“. Welche Plätze erlaubt sind und ob das Foto ein PNG oder JPEG ist, prüft der Server.

import { labelPfad, leseAntwort, ServerFehler, type LabelAnsicht } from '../api.ts';

/** Grenze des Servers; die Seite prüft sie vorab, damit niemand 50 MB umsonst sendet. */
export const MAX_FOTO_BYTES = 5 * 1024 * 1024;

/** Antwort auf das Hochladen; `unsichereWoerter` kennt nur diese Antwort (die Texterkennung liefert sie Wort für Wort). */
export type FotoErgebnis = LabelAnsicht & { textGefunden: boolean; unsichereWoerter?: string[] };

/** Sendet das Foto als Rohdaten. Mit `text` wird nicht gelesen, sondern der eingetippte Text genommen. */
export async function ladeFotoHoch(labelId: string, foto: Blob, text?: string): Promise<FotoErgebnis> {
  const adresse = labelPfad(labelId, 'foto') + (text === undefined ? '' : `?text=${encodeURIComponent(text)}`);
  let res: Response;
  try {
    res = await fetch(adresse, {
      method: 'POST',
      headers: { Accept: 'application/json', 'X-Rolle': 'kamera', 'Content-Type': 'application/octet-stream' },
      body: foto,
    });
  } catch {
    throw new ServerFehler(0, 'Keine Verbindung zum Server. Das Foto wurde nicht gespeichert.');
  }
  return leseAntwort<FotoErgebnis>(res);
}
