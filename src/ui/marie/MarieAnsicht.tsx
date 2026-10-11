// Maries Übersicht (AK-40 bis AK-45), rein darstellend: vier Zahlen, darunter die Labels hinter der
// gewählten Zahl oder Anlage, dann alle Anlagen. „Warum?“ steht an jeder Zahl, jeder Anlage und jedem
// Label. Es gibt keinen Knopf zum Bestätigen, Melden, Nachbessern oder Freigeben (AK-46).

import type { Ref } from 'react';
import type { MarieAnlage, MarieLabel, MarieUebersicht } from '../api.ts';
import { sichereBildUrl, sprachenKurz } from '../pruefung/logik.ts';
import { Warum } from '../pruefung/Warum.tsx';
import { Balken, Fehler, Marke, VERWEIS } from '../rahmen.tsx';
import { zuMarie, zurMarieAnlage, zurMarieZahl, type MarieAuswahl, type MarieZahl } from '../route.ts';
import { sperreAnzeige, STATUS_ANZEIGE } from '../status.ts';
import {
  antwort, aufteilung, auswahlLabels, auswahlTitel, fortschrittProzent, fortschrittText, gesamtRegel, gesamtZusatz, GRUPPE_REGEL, gruppenZeile, LEER,
  warumZahlText, ZAHL_TITEL, ZAHL_ZUSATZ, ZAHLEN,
} from './logik.ts';

export interface MarieAnsichtDaten {
  daten: MarieUebersicht;
  auswahl: MarieAuswahl | null;
  /** Uhrzeit des letzten Abrufs, z. B. „04:12:05“ */
  aktualisiert: string | null;
  /** ob das Signal für Änderungen gerade ankommt (AK-44) */
  verbunden: boolean;
}

const SUMMARY = `${VERWEIS} inline-flex min-h-12 cursor-pointer items-center`;

/** Rahmenfarbe je Zahl; Wort und Zahl stehen immer dabei, die Farbe ist nur Zugabe (AK-14). */
const ZAHL_RAHMEN: Record<MarieZahl, string> = {
  gesamt: 'border-slate-500',
  offen: 'border-sky-700',
  erledigt: 'border-green-700',
  fehlerhaft: 'border-red-700',
};

function Zahl({ daten, zahl, gewaehlt }: { daten: MarieUebersicht; zahl: MarieZahl; gewaehlt: boolean }) {
  const wert = daten.zahlen[zahl];
  const gezaehlt = zahl === 'gesamt' ? [] : daten.labels.filter((l) => l.gruppe === zahl);
  const teile = aufteilung(daten, zahl);
  return (
    <li className={`flex flex-col rounded-xl border-2 p-4 ${ZAHL_RAHMEN[zahl]} ${gewaehlt ? 'bg-blue-50' : 'bg-white'}`} data-zahl={zahl}>
      <a href={zurMarieZahl(zahl)} className="block text-slate-900 no-underline" aria-current={gewaehlt ? 'true' : undefined}>
        <span className="block text-lg font-semibold">{ZAHL_TITEL[zahl]}</span>
        <span className="block text-5xl font-bold">{wert}</span>
        <span className="block text-slate-700">{zahl === 'gesamt' ? gesamtZusatz(daten) : ZAHL_ZUSATZ[zahl]}</span>
        {teile && <span className="block font-semibold">{teile}</span>}
        <span className="mt-1 block font-semibold text-blue-800 underline underline-offset-4">
          {gewaehlt ? 'Ausgewählt: Labels stehen unten' : 'Labels zeigen'}
        </span>
      </a>
      <details className="mt-2" data-warum-zahl={zahl}>
        <summary className={SUMMARY}>{warumZahlText(daten, zahl)}</summary>
        <p className="mt-2">{zahl === 'gesamt' ? gesamtRegel(daten) : GRUPPE_REGEL[zahl]}</p>
        {zahl !== 'gesamt' && (
          <p className="mt-2">
            {gezaehlt.length === 0 ? 'Gezählt: keines.' : `Gezählt: ${gezaehlt.map((l) => `${l.label ? l.label.id : `nicht erfasst bei ${l.anlageName}`} (${STATUS_ANZEIGE[l.status].wort})`).join(', ')}.`}
          </p>
        )}
      </details>
    </li>
  );
}

function AnlageKarte({ a, gewaehlt }: { a: MarieAnlage; gewaehlt: boolean }) {
  return (
    <li className={`relative flex flex-col rounded-xl border-2 p-5 ${gewaehlt ? 'border-blue-800 bg-blue-50' : 'border-slate-400 bg-white'}`} data-marie-anlage={a.id}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-2xl font-bold">
          {/* Der Verweis deckt die ganze Karte ab; „Warum?“ liegt darüber. */}
          <a
            href={zurMarieAnlage(a.id)}
            className="text-slate-900 no-underline after:absolute after:inset-0 after:content-['']"
            aria-current={gewaehlt ? 'true' : undefined}
          >
            {a.name}
          </a>
        </h3>
        <Marke anzeige={sperreAnzeige(a.gesperrt)} />
      </div>
      <div className="mt-3">{fortschrittText(a)}</div>
      <div className="mt-1">
        <Balken prozent={fortschrittProzent(a)} beschriftung={`${a.name}: ${fortschrittText(a)}`} />
      </div>
      <div className="mt-2 font-semibold">{gruppenZeile(a)}</div>
      {gewaehlt && <div className="mt-1 font-semibold text-blue-900">Ausgewählt: Labels stehen oben</div>}
      {/* Nur so breit wie nötig, damit daneben ein Klick die Karte öffnet. */}
      <details className="relative z-10 mt-2 w-fit" data-warum-anlage={a.id}>
        <summary className={SUMMARY}>{a.gesperrt ? `Warum ist ${a.name} gesperrt?` : `Warum ist ${a.name} freigegeben?`}</summary>
        <ul className="mt-2 list-disc pl-6">
          {a.warum.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
      </details>
    </li>
  );
}

function LabelZeile({ l }: { l: MarieLabel }) {
  const bild = l.label ? sichereBildUrl(l.label.bildUrl) : null;
  const erfasst = l.label !== null && l.status !== 'fehlt';
  // Eindeutiger Name für „Warum?“, auch bei mehreren nicht erfassten Labels einer Anlage.
  const name = l.label ? `Label ${l.label.id}` : `nicht erfasstes Label ${l.schluessel.split('-').pop()} von ${l.anlageName}`;
  return (
    <li className="rounded-xl border-2 border-slate-400 bg-white p-4" data-marie-label={l.schluessel}>
      <div className="flex flex-wrap gap-4">
        {bild ? (
          <img src={bild} alt={`Foto von Label ${l.schluessel}`} className="h-28 w-40 rounded border border-slate-300 object-contain" />
        ) : (
          <div className="flex h-28 w-40 items-center justify-center rounded border border-slate-300 bg-slate-100">Kein Foto</div>
        )}
        {/* Mindestbreite: auf schmalen Bildschirmen rutscht der Text unter das Foto statt neben ihm zu quetschen. */}
        <div className="min-w-48 flex-1">
          <h3 className="text-xl font-bold">{l.label ? `Label ${l.label.id}` : 'Label nicht erfasst'}</h3>
          <p className="text-slate-700">{l.anlageName}</p>
          <div className="mt-2">
            <Marke anzeige={STATUS_ANZEIGE[l.status]} />
          </div>
          <p className="mt-2">{l.grund}</p>
          {erfasst && <p className="mt-1 text-slate-800">Vorgeschlagene Sprachen: {sprachenKurz(l.label!)}</p>}
          <details className="mt-2" data-warum-label={l.schluessel}>
            <summary className={SUMMARY}>
              Warum?<span className="sr-only"> ({name})</span>
            </summary>
            <ul className="mt-2 list-disc pl-6">
              {l.warum.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
            {erfasst && <Warum label={l.label!} titelId={`warum-${l.schluessel}`} ebene={4} auffaelligErklaeren />}
          </details>
        </div>
      </div>
    </li>
  );
}

function Auswahl({ daten, auswahl, auswahlRef }: { daten: MarieUebersicht; auswahl: MarieAuswahl; auswahlRef?: Ref<HTMLHeadingElement> }) {
  const titel = auswahlTitel(daten, auswahl);
  const labels = auswahlLabels(daten, auswahl);
  return (
    <section className="mt-8" aria-labelledby="auswahl-titel" data-auswahl="">
      <h2 id="auswahl-titel" ref={auswahlRef} tabIndex={-1} className="text-2xl font-bold">
        {titel ?? 'Anlage nicht gefunden'}
      </h2>
      {titel === null ? (
        <Fehler text="Diese Anlage gibt es nicht." />
      ) : (
        <>
          <p className="mt-1 text-slate-700">Die dringendsten stehen oben.</p>
          {labels.length === 0 ? (
            <p className="mt-3 font-semibold">{auswahl.art === 'zahl' ? LEER[auswahl.zahl] : 'Diese Anlage hat keine Labels.'}</p>
          ) : (
            <ul className="mt-3 grid grid-cols-1 gap-3">
              {labels.map((l) => (
                <LabelZeile key={l.schluessel} l={l} />
              ))}
            </ul>
          )}
        </>
      )}
      <a href={zuMarie()} className={`${VERWEIS} mt-3 inline-flex min-h-12 items-center`}>
        Liste schließen
      </a>
    </section>
  );
}

export function MarieAnsicht({
  daten: { daten, auswahl, aktualisiert, verbunden },
  ueberschriftRef,
  auswahlRef,
}: {
  daten: MarieAnsichtDaten;
  ueberschriftRef?: Ref<HTMLHeadingElement>;
  auswahlRef?: Ref<HTMLHeadingElement>;
}) {
  const gewaehlteZahl = auswahl?.art === 'zahl' ? auswahl.zahl : null;
  const gewaehlteAnlage = auswahl?.art === 'anlage' ? auswahl.anlageId : null;
  return (
    <>
      <h1 ref={ueberschriftRef} tabIndex={-1} className="text-3xl font-bold">
        Ist alles geprüft?
      </h1>
      <p className="mt-2 text-xl font-semibold" data-antwort="">
        {antwort(daten)}
      </p>
      {verbunden ? (
        <p className="mt-1 text-slate-700" data-aktualisiert="">
          {aktualisiert ? `Aktualisiert um ${aktualisiert}. ` : ''}Die Übersicht aktualisiert sich von selbst.
        </p>
      ) : (
        <p className="mt-1 rounded-lg border-2 border-amber-700 bg-amber-50 px-3 py-2 text-amber-950" data-aktualisiert="" role="alert">
          {aktualisiert ? `Stand ${aktualisiert}. ` : ''}Gerade keine Verbindung zum Server, die Zahlen sind vielleicht nicht aktuell. Die Seite
          versucht es von selbst weiter.
        </p>
      )}

      <section className="mt-6" aria-labelledby="zahlen-titel">
        <h2 id="zahlen-titel" className="sr-only">
          Zahlen
        </h2>
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {ZAHLEN.map((z) => (
            <Zahl key={z} daten={daten} zahl={z} gewaehlt={gewaehlteZahl === z} />
          ))}
        </ul>
      </section>

      {auswahl && <Auswahl daten={daten} auswahl={auswahl} auswahlRef={auswahlRef} />}

      <section className="mt-8" aria-labelledby="anlagen-titel">
        <h2 id="anlagen-titel" className="text-2xl font-bold">
          Anlagen
        </h2>
        <p className="mt-1 text-slate-700">Die dringendste steht oben. Ein Klick zeigt ihre Labels.</p>
        <ul className="mt-3 grid gap-4 md:grid-cols-2">
          {daten.anlagen.map((a) => (
            <AnlageKarte key={a.id} a={a} gewaehlt={gewaehlteAnlage === a.id} />
          ))}
        </ul>
      </section>
    </>
  );
}
