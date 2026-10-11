// Was erkannte fremde Warnbegriffe auf Deutsch bedeuten (Optimierung 2, Punkt 3). Kleines eingebautes
// Wörterbuch, keine vollständige Übersetzung; das wäre Aufgabe des echten Sprachmodells.

import type { LabelAnsicht } from '../api.ts';
import { kuerzel } from './logik.ts';

export function Bedeutungen({ label }: { label: Pick<LabelAnsicht, 'bedeutungen' | 'sprachen'> }) {
  if (label.bedeutungen.length === 0) return null;
  const name = (code: string) => label.sprachen.find((s) => s.code === code)?.name ?? kuerzel(code);
  return (
    <div className="mt-3" data-bedeutungen="">
      <p className="font-semibold">Wichtige Wörter auf Deutsch</p>
      <ul className="mt-1 flex flex-wrap gap-2">
        {label.bedeutungen.map((b) => (
          <li key={`${b.sprache}-${b.wort}`} className="rounded-lg border border-slate-300 bg-white px-2 py-1">
            <span lang={b.sprache} className="font-semibold">{b.wort}</span>
            <span className="text-slate-700"> ({name(b.sprache)})</span> = {b.deutsch}
          </li>
        ))}
      </ul>
      <p className="mt-1 text-sm text-slate-700">Aus einem kleinen eingebauten Wörterbuch für Warnbegriffe, keine vollständige Übersetzung.</p>
    </div>
  );
}
