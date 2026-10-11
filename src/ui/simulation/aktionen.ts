// Schreibende Aufrufe der Simulationsseite. Sie ersetzen im Prototyp die Instandhaltung;
// Foto und Text liefert dabei nur der Server aus seinen Testdaten.

import { labelPfad, type LabelAnsicht } from '../api.ts';
import { sendeAlsMax } from '../pruefung/aktionen.ts';

export const simuliereNachbesserung = (labelId: string) => sendeAlsMax<LabelAnsicht>(labelPfad(labelId, 'nachbessern'));
export const reicheFotoNach = (labelId: string) => sendeAlsMax<LabelAnsicht>(labelPfad(labelId, 'nacherfassen'));
