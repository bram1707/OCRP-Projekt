// Kamera (nur im Prototyp): Man lädt ein eigenes Foto eines Labels für einen Platz der Testanlage „Eigene Fotos“ hoch.
// Der Server liest den Text (Texterkennung) und schätzt die Sprachen; danach prüft Max das Label wie jedes andere.
// Ohne Texterkennung, oder wenn sie nichts findet, tippt man den Text selbst ein.

import { useCallback, useEffect, useRef, useState } from 'react';
import { ladeKamera, type KameraStand } from '../api.ts';
import { prozent, sichereBildUrl, sprachZeile } from '../pruefung/logik.ts';
import { Fehler, KNOPF_GEWAEHLT, KNOPF_HAUPT, KNOPF_NEBEN, Laden, Marke } from '../rahmen.tsx';
import { STATUS_ANZEIGE } from '../status.ts';
import { ladeFotoHoch, type FotoErgebnis } from './aktionen.ts';
import { dateiFehler, groesseText, kannFotoAufnehmen, platzText, vorschlag } from './logik.ts';

const MAX_TEXT = 1000;

export function KameraAnsicht({
  stand,
  gewaehlt,
  datei,
  text,
  tippen,
  sendet,
  ergebnis,
  fehler,
  onPlatz,
  onDatei,
  onText,
  onTippen,
  onSenden,
}: {
  stand: KameraStand;
  gewaehlt: string | null;
  datei: { name: string; size: number } | null;
  text: string;
  /** Text selbst eintippen statt lesen lassen */
  tippen: boolean;
  sendet: boolean;
  ergebnis: FotoErgebnis | null;
  fehler: string | null;
  onPlatz: (id: string) => void;
  onDatei: (datei: File | null) => void;
  onText: (text: string) => void;
  onTippen: (tippen: boolean) => void;
  onSenden: () => void;
}) {
  const ueberschrift = useRef<HTMLHeadingElement>(null);
  useEffect(() => ueberschrift.current?.focus(), []);
  const freigegeben = Boolean(stand.anlage?.freigegebenAm);
  const moeglich = stand.plaetze.filter((p) => kannFotoAufnehmen(p, freigegeben));
  const mussTippen = tippen || !stand.texterkennung;
  const bild = ergebnis ? sichereBildUrl(ergebnis.bildUrl) : null;

  return (
    <>
      <h1 ref={ueberschrift} tabIndex={-1} className="text-2xl font-semibold tracking-tight">
        Eigenes Foto hochladen
      </h1>
      <p className="mt-2 max-w-3xl text-slate-800">
        Diese Seite gibt es nur im Prototyp. Sie ersetzt die Kamera an der Anlage: Sie laden das Foto eines Labels hoch, das System
        liest den Text und schätzt die Sprachen. Danach prüft Max das Label wie jedes andere.
      </p>
      <p className="mt-4 max-w-3xl rounded-lg border border-amber-200 border-l-4 border-l-amber-600 bg-amber-50 px-4 py-3 text-amber-950" data-hinweis-personen="">
        Bitte nur Labels fotografieren, keine Personen. Die Fotos bleiben auf diesem Rechner und werden bei „Daten zurücksetzen“
        gelöscht.
      </p>

      {!stand.upload && <div className="mt-6"><Fehler text="Eigene Fotos sind bei diesem Server nicht eingerichtet." /></div>}
      {stand.upload && !stand.anlage && (
        <p className="mt-6">In diesen Daten gibt es keine Testanlage für eigene Fotos. Bitte den Prototyp mit „npm run demo“ starten. Läuft er schon so, auf der Startseite einmal „Daten zurücksetzen“ wählen (die Daten stammen dann aus einer älteren Version).</p>
      )}

      {stand.upload && stand.anlage && (
        <>
          <h2 className="mt-8 text-xl font-semibold tracking-tight">{stand.anlage.name}</h2>
          <p className="mt-1 text-slate-700">
            {freigegeben
              ? 'Von Max freigegeben. Neue Fotos gibt es erst nach „Daten zurücksetzen“.'
              : `${stand.anlage.bestaetigt} von ${stand.anlage.sollAnzahl} Plätzen von Max bestätigt.`}
          </p>
          <ul className="mt-4 grid gap-3 md:grid-cols-3">
            {stand.plaetze.map((p) => (
              <li key={p.id} className="rounded-xl border border-slate-200 bg-white shadow-sm p-4" data-platz={p.id}>
                <p className="text-lg font-semibold">Platz {p.id}</p>
                <div className="mt-1">
                  <Marke anzeige={STATUS_ANZEIGE[p.status]} />
                </div>
                <p className="mt-2">{platzText(p)}</p>
              </li>
            ))}
          </ul>

          {moeglich.length > 0 && (
            <section aria-labelledby="hochladen-titel" className="mt-8 max-w-3xl rounded-xl border border-slate-200 bg-white shadow-sm p-5">
              <h2 id="hochladen-titel" className="text-xl font-semibold tracking-tight">
                Foto hochladen
              </h2>

              <fieldset className="mt-4">
                <legend className="font-semibold">1. Für welchen Platz?</legend>
                <div className="mt-2 flex flex-wrap gap-3">
                  {moeglich.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className={p.id === gewaehlt ? KNOPF_GEWAEHLT : KNOPF_NEBEN}
                      aria-pressed={p.id === gewaehlt}
                      disabled={sendet}
                      onClick={() => onPlatz(p.id)}
                    >
                      {p.id}
                    </button>
                  ))}
                </div>
              </fieldset>

              <div className="mt-5">
                <label htmlFor="foto-datei" className="block font-semibold">
                  2. Foto wählen (PNG oder JPEG, höchstens 5 MB)
                </label>
                <input
                  id="foto-datei"
                  type="file"
                  accept="image/png,image/jpeg"
                  disabled={sendet}
                  className="mt-2 block w-full rounded-lg border border-slate-300 shadow-sm bg-white p-2"
                  onChange={(e) => onDatei(e.target.files?.[0] ?? null)}
                />
                {datei && (
                  <p className="mt-1 text-slate-700" data-datei="">
                    Gewählt: {datei.name} ({groesseText(datei.size)})
                  </p>
                )}
                <p className="mt-1 text-slate-700">Am besten gerade von vorn, scharf und ohne Spiegelung.</p>
              </div>

              <div className="mt-5">
                {stand.texterkennung ? (
                  <label className="flex items-center gap-3">
                    <input type="checkbox" className="h-6 w-6" checked={tippen} disabled={sendet} onChange={(e) => onTippen(e.target.checked)} />
                    <span>Text selbst eintippen statt lesen lassen</span>
                  </label>
                ) : (
                  <p className="text-slate-800">Die Texterkennung ist ausgeschaltet. Bitte den Text auf dem Label eintippen.</p>
                )}
                {mussTippen && (
                  <>
                    <label htmlFor="foto-text" className="mt-3 block font-semibold">
                      3. Text auf dem Label
                    </label>
                    <textarea
                      id="foto-text"
                      rows={4}
                      maxLength={MAX_TEXT}
                      value={text}
                      disabled={sendet}
                      className="mt-2 block w-full rounded-lg border border-slate-300 shadow-sm p-2"
                      onChange={(e) => onText(e.target.value)}
                    />
                  </>
                )}
              </div>

              <div className="mt-5">
                <button type="button" className={KNOPF_HAUPT} disabled={sendet} onClick={onSenden}>
                  {mussTippen ? 'Foto mit Text senden' : 'Foto hochladen und lesen lassen'}
                </button>
              </div>
            </section>
          )}
        </>
      )}

      <div role="status" aria-live="polite" className="mt-6 max-w-3xl">
        {sendet && (
          <p className="rounded-lg border border-sky-200 border-l-4 border-l-sky-600 bg-sky-50 px-4 py-3 text-sky-950" data-liest="">
            {mussTippen ? 'Das Foto wird gespeichert …' : 'Das Foto wird gelesen … Das dauert einige Sekunden.'}
          </p>
        )}
        {!sendet && ergebnis && (
          <div className="rounded-lg border border-green-200 border-l-4 border-l-green-600 bg-green-50 px-4 py-3 text-green-950" data-ergebnis={ergebnis.id}>
            <p className="font-semibold">
              Foto für Platz {ergebnis.id} gespeichert. Das Label ist jetzt in Max&#39; Prüfung („{ergebnis.statusText}“).
            </p>
            {ergebnis.textGefunden ? (
              <>
                <p className="mt-2">Erkannter Text (Lesesicherheit {prozent(ergebnis.ocrKonfidenz)}):</p>
                <p className="mt-1 whitespace-pre-line rounded border border-green-700 bg-white px-3 py-2 text-slate-900">{ergebnis.ocrText}</p>
                <p className="mt-2">
                  Sprachvorschlag: {ergebnis.sprachen.length > 0 ? ergebnis.sprachen.map(sprachZeile).join('; ') : 'keine Sprache erkannt'}
                </p>
              </>
            ) : (
              <p className="mt-2">
                Auf dem Foto wurde kein Text erkannt. Max sieht das Label als „Unsicher“. Sie können den Text selbst eintippen und das
                Foto für denselben Platz noch einmal senden.
              </p>
            )}
            {bild && <img src={bild} alt={`Hochgeladenes Foto für Platz ${ergebnis.id}`} className="mt-3 max-h-64 rounded border border-slate-300 bg-white object-contain" />}
          </div>
        )}
      </div>
      {fehler && (
        <div className="mt-4 max-w-3xl">
          <Fehler text={fehler} />
        </div>
      )}
    </>
  );
}

export function KameraSeite() {
  const [stand, setStand] = useState<KameraStand | null>(null);
  const [ladefehler, setLadefehler] = useState<string | null>(null);
  const [gewaehlt, setGewaehlt] = useState<string | null>(null);
  const [datei, setDatei] = useState<File | null>(null);
  const [text, setText] = useState('');
  const [tippen, setTippen] = useState(false);
  const [sendet, setSendet] = useState(false);
  const [ergebnis, setErgebnis] = useState<FotoErgebnis | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const sendetRef = useRef(false);

  const laden = useCallback(async () => {
    const neu = await ladeKamera();
    setStand(neu);
    const freigegeben = Boolean(neu.anlage?.freigegebenAm);
    // Die Auswahl bleibt, solange der Platz noch ein Foto annimmt; sonst der nächste sinnvolle Platz.
    setGewaehlt((alt) => {
      const platz = neu.plaetze.find((p) => p.id === alt);
      return platz && kannFotoAufnehmen(platz, freigegeben) ? alt : vorschlag(neu.plaetze, freigegeben);
    });
  }, []);

  useEffect(() => {
    laden().catch((e: Error) => setLadefehler(e.message));
  }, [laden]);

  async function senden(): Promise<void> {
    if (sendetRef.current || !stand) return;
    const mussTippen = tippen || !stand.texterkennung;
    const problem = !gewaehlt ? 'Bitte zuerst einen Platz wählen.' : dateiFehler(datei) ?? (mussTippen && text.trim() === '' ? 'Bitte den Text auf dem Label eintippen.' : null);
    if (problem) {
      setFehler(problem);
      return;
    }
    sendetRef.current = true;
    setSendet(true);
    setFehler(null);
    setErgebnis(null);
    try {
      const antwort = await ladeFotoHoch(gewaehlt!, datei!, mussTippen ? text.trim() : undefined);
      setErgebnis(antwort);
      // Ohne gefundenen Text gleich das Eintippen anbieten; Datei und Platz bleiben gewählt.
      if (!antwort.textGefunden) {
        setTippen(true);
        setGewaehlt(antwort.id);
      } else {
        // Gelesen: weiter zum nächsten Platz, der ein Foto braucht.
        setGewaehlt(null);
        setDatei(null);
        setText('');
        setTippen(false);
        const feld = document.getElementById('foto-datei') as HTMLInputElement | null;
        if (feld) feld.value = '';
      }
    } catch (e) {
      setFehler(e instanceof Error ? e.message : 'Unbekannter Fehler.');
    } finally {
      await laden().catch(() => undefined);
      sendetRef.current = false;
      setSendet(false);
    }
  }

  if (ladefehler) return <Fehler text={ladefehler} />;
  if (!stand) return <Laden />;
  return (
    <KameraAnsicht
      stand={stand}
      gewaehlt={gewaehlt}
      datei={datei}
      text={text}
      tippen={tippen}
      sendet={sendet}
      ergebnis={ergebnis}
      fehler={fehler}
      onPlatz={setGewaehlt}
      onDatei={(d) => {
        setDatei(d);
        setFehler(d ? dateiFehler(d) : null);
      }}
      onText={setText}
      onTippen={setTippen}
      onSenden={() => void senden()}
    />
  );
}
