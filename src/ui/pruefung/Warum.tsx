// Markierter Text und der Bereich „Warum?“ (AK-16, AK-20). Jede Markierung trägt ein
// Sprachkürzel, damit sie nicht nur an der Farbe hängt. Einzelne Buchstaben sind umrahmt und gezählt.

import type { LabelAnsicht } from '../api.ts';
import { einzelneBuchstaben, kuerzel, prozent, textStuecke, unsichereSprachen, type Textstueck } from './logik.ts';

const FARBE: Record<string, string> = {
  de: 'bg-yellow-200',
  en: 'bg-lime-200',
  pl: 'bg-pink-200',
  fr: 'bg-orange-200',
  ru: 'bg-cyan-200',
};

function sprachName(l: LabelAnsicht, code: string): string {
  return l.sprachen.find((s) => s.code === code)?.name ?? kuerzel(code);
}

function Markierung({ stueck, name, unsicher }: { stueck: Textstueck; name: string; unsicher: boolean }) {
  const b = stueck.beleg!;
  const rahmen = b.art === 'zeichen' ? 'border-2 border-dashed border-slate-900' : '';
  return (
    <mark className={`rounded px-0.5 text-slate-950 ${FARBE[b.sprache] ?? 'bg-slate-200'} ${rahmen}`} data-sprache={b.sprache} data-art={b.art}>
      {stueck.text}
      <span className="ml-0.5 align-super font-bold" aria-hidden="true">
        {kuerzel(b.sprache)}
      </span>
      <span className="sr-only">
        {' '}
        ({name}
        {unsicher ? ', nicht sicher' : ''})
      </span>
    </mark>
  );
}

/** Text mit Markierungen; ohne `alle` nur die Stellen nicht sicher erkannter Sprachen. */
export function MarkierterText({ label, alle }: { label: LabelAnsicht; alle: boolean }) {
  const unsicher = unsichereSprachen(label);
  const stuecke = textStuecke(label.ocrText, label.belege, alle ? undefined : unsicher);
  if (label.ocrText === '') return <p className="italic text-slate-700">Kein Text erkannt.</p>;
  return (
    <p className="whitespace-pre-wrap break-words text-xl leading-loose" data-text="">
      {stuecke.map((s, i) =>
        s.beleg ? (
          <Markierung key={i} stueck={s} name={sprachName(label, s.beleg.sprache)} unsicher={unsicher.has(s.beleg.sprache)} />
        ) : (
          <span key={i}>{s.text}</span>
        ),
      )}
    </p>
  );
}

/** Erklärung unter dem Text der Einzelansicht: welche Stellen markiert sind. */
export function Legende({ label }: { label: LabelAnsicht }) {
  const unsicher = label.sprachen.filter((s) => !s.sicher);
  if (unsicher.length === 0) return null;
  return (
    <p className="mt-2 text-slate-800">
      Markiert sind Stellen in Sprachen, die nicht sicher erkannt wurden:{' '}
      {unsicher.map((s) => `${kuerzel(s.code)} = ${s.name} ${prozent(s.konfidenz)}, nicht sicher`).join('; ')}.
    </p>
  );
}

/**
 * Belege für Sprache und Auffälligkeit (AK-20, AK-43). `titelId` und `ebene` lassen sich setzen,
 * damit mehrere dieser Bereiche auf einer Seite stehen können (Maries Liste).
 */
export function Warum({
  label,
  titelId = 'warum-titel',
  ebene = 3,
  auffaelligErklaeren = false,
}: {
  label: LabelAnsicht;
  titelId?: string;
  ebene?: 3 | 4;
  /** Satz „Auffällig heißt …“ direkt dabei, wo er nicht schon auf der Seite steht (Maries Liste) */
  auffaelligErklaeren?: boolean;
}) {
  const stuecke = textStuecke(label.ocrText, label.belege);
  const buchstaben = einzelneBuchstaben(stuecke);
  const codes = [...new Set(label.belege.map((b) => b.sprache))];
  const Titel = ebene === 3 ? 'h3' : 'h4';
  const Untertitel = ebene === 3 ? 'h4' : 'h5';
  return (
    <section className="mt-4 rounded-xl border border-slate-200 bg-white shadow-sm p-4" aria-labelledby={titelId}>
      <Titel id={titelId} className="text-lg font-semibold">
        Woran die Sprache erkannt wurde
      </Titel>
      <p className="mt-2">{label.begruendung}</p>
      {label.belege.length === 0 ? (
        <p className="mt-2 font-semibold">Keine typischen Wörter oder Zeichen gefunden.</p>
      ) : (
        <>
          <div className="mt-3 rounded-lg border border-slate-300 bg-slate-50 p-3">
            <MarkierterText label={label} alle />
          </div>
          <ul className="mt-3 list-disc pl-6">
            {codes.map((code) => {
              const s = label.sprachen.find((x) => x.code === code);
              return (
                <li key={code}>
                  {kuerzel(code)} = {sprachName(label, code)}
                  {s ? ` ${prozent(s.konfidenz)}, ${s.sicher ? 'sicher erkannt' : 'nicht sicher'}` : ', nicht als Sprache vorgeschlagen'}
                </li>
              );
            })}
          </ul>
          {buchstaben > 0 && (
            <p className="mt-2">
              Gestrichelt umrahmt: {buchstaben === 1 ? '1 einzelner Buchstabe' : `${buchstaben} einzelne Buchstaben`}. Ein einzelner
              Buchstabe allein reicht nie für eine Sprache.
            </p>
          )}
        </>
      )}
      {label.gruende.length > 0 && (
        <>
          <Untertitel className="mt-4 text-base font-semibold">Warum auffällig</Untertitel>
          {auffaelligErklaeren && <p className="mt-1 text-slate-700">Auffällig heißt: Max soll genauer hinsehen. Es ist kein Fehler.</p>}
          <ul className="mt-1 list-disc pl-6">
            {label.gruende.map((g) => (
              <li key={g.code}>{g.text}</li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
