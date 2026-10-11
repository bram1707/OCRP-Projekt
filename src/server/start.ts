// Startet den Server: npm run server (npm start baut vorher die Oberfläche)
// Beim ersten Start wird die Datenbank mit den fiktiven Testdaten gefüllt.

import type { AddressInfo } from 'node:net';
import { erstelleServer } from './app.ts';
import { bereiteSystemVor, HINWEIS_DATENBANK_ERSETZT, serverOptionen } from './system.ts';

const system = await bereiteSystemVor();
if (system.datenbankErsetzt) console.log(HINWEIS_DATENBANK_ERSETZT);

const server = erstelleServer(serverOptionen(system));
server.listen(Number(process.env.PORT ?? 3000), '127.0.0.1', () => {
  // Den tatsächlich belegten Port nennen (bei PORT=0 wählt das System einen freien).
  const { port } = server.address() as AddressInfo;
  const daten = system.datensatz === 'demo' ? 'Demo-Daten' : 'Testdaten';
  console.log(`Prüfsystem läuft auf http://127.0.0.1:${port} (Spracherkennung: ${system.konfiguration.modus}, ${daten}, nur fiktive Daten)`);
});
