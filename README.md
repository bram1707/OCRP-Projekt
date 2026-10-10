# Label-Prüfung (Prototyp)

Prototyp zur Vorprüfung von Sicherheits- und Warnlabels an Anlagen. Max (Qualitätsmanagement) prüft jedes Label einzeln und gibt eine Anlage erst frei, wenn alle Labels bestätigt sind. Texterkennung und Spracherkennung sind simuliert, alle Daten sind fiktiv.

## Starten

Voraussetzung: Node.js ab Version 22.18.

1. `npm ci` installiert die Pakete (einmalig).
2. `npm start` baut die Oberfläche und startet den Server.
3. Im Browser `http://127.0.0.1:3000` öffnen.
4. `npm test` führt alle Tests aus.
5. Optional: `npm run dev` startet den Entwicklungsserver unter `http://127.0.0.1:5173`.

Beim ersten Start legt der Server die Datenbank `daten/pruefsystem.sqlite` mit den Testdaten an. Wer von vorn beginnen will, löscht diese Datei. Die Spracherkennung läuft im Mock-Modus ohne Schlüssel; ein Schlüssel stünde nur in `.env` (Vorlage: `.env.example`).

Die Datei `labyrinth.py` ist ein eigenständiges Spiel und gehört nicht zum Prototyp.
