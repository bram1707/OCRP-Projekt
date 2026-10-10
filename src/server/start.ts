// Startet den Server: npm run server
// Beim ersten Start wird die Datenbank mit den fiktiven Testdaten gefüllt.

import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { leseKonfiguration, waehleModell } from '../ai/konfiguration.ts';
import { istLeer, ladeTestdaten, oeffneDatenbank, spieleTestdatenEin } from '../db/datenbank.ts';
import { erstelleServer } from './app.ts';

const wurzel = resolve(import.meta.dirname, '..', '..');
const envDatei = join(wurzel, '.env');
if (existsSync(envDatei)) process.loadEnvFile(envDatei);

const konfiguration = leseKonfiguration();
const modell = waehleModell(konfiguration);

const testdaten = join(wurzel, 'testdaten');
const dbPfad = process.env.DB_PFAD ?? join(wurzel, 'daten', 'pruefsystem.sqlite');
mkdirSync(dirname(dbPfad), { recursive: true });
const db = oeffneDatenbank(dbPfad);
if (istLeer(db)) await spieleTestdatenEin(db, ladeTestdaten(testdaten), modell);

const port = Number(process.env.PORT ?? 3000);
erstelleServer({ db, bilderOrdner: join(testdaten, 'bilder'), modell }).listen(port, '127.0.0.1', () => {
  console.log(`Prüfsystem läuft auf http://127.0.0.1:${port} (Spracherkennung: ${konfiguration.modus}, nur fiktive Daten)`);
});
