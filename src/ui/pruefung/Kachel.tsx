// Eine Kachel der Übersicht (AK-17, AK-19): Vorschaubild, erste Wörter, Sprachen, Status und bei
// auffälligen Labels das Wort „Auffällig“ mit einem Satz als Grund. Bestätigen direkt auf der Kachel
// gibt es nur für unauffällige Labels, und immer nur für dieses eine Label (AK-11).

import type { LabelAnsicht } from '../api.ts';
import { KNOPF_NEBEN, Marke } from '../rahmen.tsx';
import { zumLabel } from '../route.ts';
import { istPruefbar, STATUS_ANZEIGE } from '../status.ts';
import { ersteWoerter, hauptgrund, sichereBildUrl, sprachenKurz } from './logik.ts';

export function Kachel({
  label,
  onBestaetigen,
  gesperrt,
}: {
  label: LabelAnsicht;
  onBestaetigen: (labelId: string) => void;
  /** solange eine Entscheidung gespeichert wird */
  gesperrt: boolean;
}) {
  const grund = label.auffaellig ? hauptgrund(label.gruende) : null;
  const bild = sichereBildUrl(label.bildUrl);
  const direktBestaetigen = !label.auffaellig && istPruefbar(label.status);
  return (
    <li
      className={`relative flex flex-col rounded-xl border-2 bg-white p-4 ${label.auffaellig && istPruefbar(label.status) ? 'border-amber-700' : 'border-slate-400'}`}
      data-kachel={label.id}
    >
      {bild ? (
        <img src={bild} alt={`Foto von Label ${label.id}`} className="mb-3 aspect-[48/34] w-full rounded border border-slate-300 object-contain" />
      ) : (
        <div className="mb-3 flex aspect-[48/34] w-full items-center justify-center rounded border border-slate-300 bg-slate-100">Kein Foto</div>
      )}
      <h3 className="text-xl font-bold">
        {/* Der Verweis deckt die ganze Kachel ab; der Knopf liegt darüber. */}
        <a href={zumLabel(label.anlageId, label.id)} className="text-slate-900 no-underline after:absolute after:inset-0 after:content-['']">
          Label {label.id}
        </a>
      </h3>
      <p className="mt-1 text-slate-800">{ersteWoerter(label.ocrText)}</p>
      <p className="mt-1 text-slate-800">{sprachenKurz(label)}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Marke anzeige={STATUS_ANZEIGE[label.status]} />
        {label.auffaellig && istPruefbar(label.status) && (
          <span className="rounded-md border-2 border-amber-700 bg-amber-50 px-2 py-0.5 font-semibold text-amber-950">Auffällig</span>
        )}
      </div>
      {grund && istPruefbar(label.status) && (
        <p className="mt-2 text-slate-900">
          {grund.text}
          {grund.weitere && <span className="block text-slate-700">… {grund.weitere}</span>}
        </p>
      )}
      {direktBestaetigen && (
        <button
          type="button"
          className={`${KNOPF_NEBEN} relative z-10 mt-3`}
          disabled={gesperrt}
          onClick={() => onBestaetigen(label.id)}
        >
          {label.id} bestätigen
        </button>
      )}
    </li>
  );
}
