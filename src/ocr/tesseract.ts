// Lokale Texterkennung mit tesseract.js. Die Sprachdaten kommen aus den mitinstallierten Paketen
// @tesseract.js-data/*; tesseract.js braucht sie in einem Ordner und bekommt sie dort als Kopie.
// Es gibt keinen Zugriff aufs Internet.
// Es liest immer nur ein Foto gleichzeitig; nach 30 Sekunden wird abgebrochen.

import { copyFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { begrenzeKonfidenz, type Gelesen, type TextLeser } from './textLeser.ts';

/** Dieselben Sprachen wie die Spracherkennung (U4). */
export const OCR_SPRACHEN = ['deu', 'eng', 'pol', 'fra', 'rus', 'tur', 'bul', 'chi_sim'] as const;
export const ZEITLIMIT_MS = 30_000;
/** Wörter unter dieser Lesesicherheit (in Prozent) zeigt die Kamera-Seite als „unsicher gelesen“. */
export const WORT_SCHWELLE = 60;

const require = createRequire(import.meta.url);

type Tesseract = typeof import('tesseract.js');
type Worker = Awaited<ReturnType<Tesseract['createWorker']>>;

/**
 * Legt die Sprachdaten aus node_modules in einen gemeinsamen Ordner (kopiert nur, was fehlt oder abweicht).
 * Fehlt ein Paket, bricht es hier ab, und der Server läuft ohne Texterkennung.
 */
export function bereiteSprachdatenVor(ordner: string): string {
  mkdirSync(ordner, { recursive: true });
  for (const code of OCR_SPRACHEN) {
    const paket = dirname(require.resolve(`@tesseract.js-data/${code}/package.json`));
    const quelle = join(paket, '4.0.0_best_int', `${code}.traineddata.gz`);
    const ziel = join(ordner, `${code}.traineddata.gz`);
    if (!existsSync(ziel) || statSync(ziel).size !== statSync(quelle).size) copyFileSync(quelle, ziel);
  }
  return ordner;
}

export type TesseractLeser = TextLeser & { beende: () => Promise<void> };

export function erstelleTesseractLeser({ sprachOrdner, zeitlimitMs = ZEITLIMIT_MS }: { sprachOrdner: string; zeitlimitMs?: number }): TesseractLeser {
  const tesseract = require('tesseract.js') as Tesseract;
  const langPath = bereiteSprachdatenVor(sprachOrdner);
  let worker: Promise<Worker> | null = null;
  let warteschlange: Promise<unknown> = Promise.resolve();

  const holeWorker = () => {
    // Ein lokaler Pfad als langPath: tesseract.js liest dort und nie aus dem Internet.
    worker ??= tesseract.createWorker([...OCR_SPRACHEN], tesseract.OEM.LSTM_ONLY, {
      langPath,
      cacheMethod: 'none',
      gzip: true,
      logger: () => {},
      errorHandler: () => {},
    });
    return worker;
  };

  const lies = async (bild: Buffer): Promise<Gelesen> => {
    const w = await holeWorker();
    let uhr: NodeJS.Timeout | undefined;
    const abbruch = new Promise<never>((_, ablehnen) => {
      uhr = setTimeout(() => ablehnen(new Error('Zeitlimit der Texterkennung überschritten.')), zeitlimitMs);
    });
    try {
      const { data } = await Promise.race([w.recognize(bild, {}, { text: true, blocks: true }), abbruch]);
      const woerter = (data.blocks ?? []).flatMap((b) => b.paragraphs.flatMap((p) => p.lines.flatMap((l) => l.words)));
      const unsichereWoerter = [...new Set(woerter.filter((x) => x.confidence < WORT_SCHWELLE && /\p{L}/u.test(x.text)).map((x) => x.text))];
      return { text: data.text.trim(), konfidenz: begrenzeKonfidenz(data.confidence / 100), unsichereWoerter };
    } catch (fehler) {
      // Ein hängender Worker wird verworfen; beim nächsten Foto startet ein neuer.
      worker = null;
      void w.terminate().catch(() => {});
      throw fehler;
    } finally {
      clearTimeout(uhr);
    }
  };

  const leser: TextLeser = (bild) => {
    const auftrag = warteschlange.then(() => lies(bild));
    warteschlange = auftrag.catch(() => {});
    return auftrag;
  };
  return Object.assign(leser, {
    beende: async () => {
      const w = worker;
      worker = null;
      if (w) await (await w).terminate();
    },
  });
}
