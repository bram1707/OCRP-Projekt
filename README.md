# Label-Prüfung (Prototyp)

Prototyp zur Vorprüfung von Sicherheits- und Warnlabels an Anlagen. Max (Qualitätsmanagement) prüft jedes Label einzeln und gibt eine Anlage erst frei, wenn alle Labels bestätigt sind. Marie (Fertigungsleitung) sieht in einer Übersicht, wie viele Labels offen, erledigt oder fehlerhaft sind. Texterkennung und Spracherkennung sind simuliert, alle Daten sind fiktiv.

## Starten

1. Prüfen, dass Node.js ab Version 22.18 installiert ist: `node --version`.
2. `npm ci` installiert die Pakete (einmalig).
3. `npm run demo` baut die Oberfläche und startet den Prototyp mit den Demo-Daten.
4. Im Browser `http://127.0.0.1:3000` öffnen.
5. Auf der Startseite die Rolle wählen: Max oder Marie.

Was in einem Test zu tun ist und worauf die Testleitung achtet, steht in [`docs/testablauf.md`](docs/testablauf.md). „Daten zurücksetzen“ unten auf der Startseite stellt die Demo-Daten für den nächsten Durchlauf wieder her; die Rückmeldungen bleiben dabei erhalten.

Die Datei `labyrinth.py` ist ein eigenständiges Spiel und gehört nicht zum Prototyp.

## Für Entwickler

- `npm test` führt alle Tests aus, `npm run typecheck` prüft die Typen.
- `npm start` startet mit den 20 Basis-Testlabels aus `testdaten/` (Datenbank `daten/pruefsystem.sqlite`), `npm run demo` mit den 37 Demo-Labels aus `testdaten/demo/` (Datenbank `daten/demo.sqlite`). Wer von vorn beginnen will, löscht die jeweilige Datei.
- `npm run dev` startet den Entwicklungsserver unter `http://127.0.0.1:5173`.
- `npm run bilder` erzeugt die Bilder der Basisdaten neu, `npm run bilder -- testdaten/demo` die der Demo-Daten.
- Die Spracherkennung läuft im Mock-Modus ohne Schlüssel; im Demo-Modus immer. Ein Schlüssel stünde nur in `.env` (Vorlage: `.env.example`).
- Browser-Tests (`tests/**/*.browser.ts`) laufen nicht mit `npm test`, weil Playwright kein Paket des Projekts ist. Nach `npm run build` startet man sie einzeln, zum Beispiel:
  `node --disable-warning=ExperimentalWarning --test tests/browser/demo.browser.ts`.
  Playwright wird unter `PLAYWRIGHT_PFAD` gesucht (Standard: `/opt/node22/lib/node_modules/playwright/index.mjs`). Mit `BILDER_AUSGABE=<ordner>` speichern einige Tests Bildschirmfotos.
