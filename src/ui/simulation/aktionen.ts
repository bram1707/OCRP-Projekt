// Schreibende Aufrufe der Simulationsseite. Sie ersetzen im Prototyp die Instandhaltung;
// Foto und Text liefert dabei nur der Server aus seinen Testdaten.

import type { LabelAnsicht } from '../api.ts';
import { sendeAlsMax } from '../pruefung/aktionen.ts';

const label = (id: string, aktion: string) => `/api/labels/${encodeURIComponent(id)}/${aktion}`;

export const simuliereNachbesserung = (labelId: string) => sendeAlsMax<LabelAnsicht>(label(labelId, 'nachbessern'));
export const reicheFotoNach = (labelId: string) => sendeAlsMax<LabelAnsicht>(label(labelId, 'nacherfassen'));
