// Eine Kachel der Übersicht (AK-17, AK-19): Vorschaubild, erste Wörter, Sprachen, Status und bei
// auffälligen Labels das Wort „Auffällig“ mit einem Satz als Grund. Bestätigen direkt auf der Kachel
// gibt es nur für unauffällige Labels, und immer nur für dieses eine Label (AK-11). Wie in der
// Einzelansicht erst, wenn das Foto geladen ist; lädt es nicht, steht dort ein Hinweis statt des Knopfs.

import { useEffect, useRef, useState, type Ref } from 'react';
import type { LabelAnsicht } from '../api.ts';
import { KNOPF_NEBEN, Marke } from '../rahmen.tsx';
import { zumLabel } from '../route.ts';
import { istPruefbar, STATUS_ANZEIGE } from '../status.ts';
import { ersteWoerter, hauptgrund, sichereBildUrl, sprachenKurz } from './logik.ts';

/** Stand des Vorschaubilds: Bestätigen auf der Kachel gibt es nur bei „da“. */
export type FotoZustand = 'laedt' | 'da' | 'fehlt';

type KachelEigenschaften = {
  label: LabelAnsicht;
  onBestaetigen: (labelId: string) => void;
  /** solange eine Entscheidung gespeichert wird */
  gesperrt: boolean;
};

export function Kachel(eigenschaften: KachelEigenschaften) {
  const bild = sichereBildUrl(eigenschaften.label.bildUrl);
  const [foto, setFoto] = useState<{ fuer: string | null; zustand: FotoZustand }>({ fuer: bild, zustand: 'laedt' });
  const img = useRef<HTMLImageElement>(null);
  // Ist das Foto schon im Speicher, kann „load“ vor dem Einhängen kommen; deshalb einmal selbst nachsehen.
  // Ein kaputtes Foto ist ebenfalls „complete“, hat aber keine Breite.
  useEffect(() => {
    if (img.current?.complete) setFoto({ fuer: bild, zustand: img.current.naturalWidth > 0 ? 'da' : 'fehlt' });
  }, [bild]);
  const zustand: FotoZustand = bild === null ? 'fehlt' : foto.fuer === bild ? foto.zustand : 'laedt';
  return <KachelAnsicht {...eigenschaften} foto={zustand} bildRef={img} onFoto={(z) => setFoto({ fuer: bild, zustand: z })} />;
}

export function KachelAnsicht({
  label,
  onBestaetigen,
  gesperrt,
  foto,
  bildRef,
  onFoto,
}: KachelEigenschaften & { foto: FotoZustand; bildRef?: Ref<HTMLImageElement>; onFoto?: (zustand: FotoZustand) => void }) {
  const grund = label.auffaellig ? hauptgrund(label.gruende) : null;
  const bild = sichereBildUrl(label.bildUrl);
  const direktBestaetigen = !label.auffaellig && istPruefbar(label.status);
  return (
    <li
      className={`relative flex flex-col rounded-xl border shadow-sm bg-white p-4 ${label.auffaellig && istPruefbar(label.status) ? 'border-amber-500 ring-1 ring-amber-500' : 'border-slate-200'}`}
      data-kachel={label.id}
    >
      {bild ? (
        <img
          ref={bildRef}
          src={bild}
          alt={`Foto von Label ${label.id}`}
          className="mb-3 aspect-[48/34] w-full rounded border border-slate-300 object-contain"
          onLoad={() => onFoto?.('da')}
          onError={() => onFoto?.('fehlt')}
        />
      ) : (
        <div className="mb-3 flex aspect-[48/34] w-full items-center justify-center rounded border border-slate-300 bg-slate-100">Kein Foto</div>
      )}
      <h3 className="text-lg font-semibold">
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
          <span className="rounded-full border border-amber-600 bg-amber-50 px-2.5 py-0.5 text-sm font-semibold text-amber-950">Auffällig</span>
        )}
      </div>
      {grund && istPruefbar(label.status) && (
        <p className="mt-2 text-slate-900">
          {grund.text}
          {grund.weitere && <span className="block text-slate-700">… {grund.weitere}</span>}
        </p>
      )}
      {direktBestaetigen && foto !== 'fehlt' && (
        <button
          type="button"
          className={`${KNOPF_NEBEN} relative z-10 mt-3`}
          disabled={gesperrt || foto !== 'da'}
          onClick={() => onBestaetigen(label.id)}
        >
          {label.id} bestätigen
        </button>
      )}
      {direktBestaetigen && foto === 'fehlt' && (
        <p className="mt-3 font-semibold text-slate-900" data-foto-fehlt="">
          {bild ? 'Das Foto lädt nicht. ' : ''}Bitte in der Einzelansicht prüfen.
        </p>
      )}
    </li>
  );
}
