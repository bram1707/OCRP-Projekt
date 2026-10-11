# Label-Prüfung (Prototyp)

Prototyp zur Vorprüfung von Sicherheits- und Warnlabels an Anlagen. Max (Qualitätsmanagement) prüft jedes Label einzeln und gibt eine Anlage erst frei, wenn alle Labels bestätigt sind. Marie (Fertigungsleitung) sieht in einer Übersicht, wie viele Labels offen, erledigt oder fehlerhaft sind. Die Spracherkennung ist simuliert, die Anlagen und Labels sind fiktiv. Über die Rolle „Kamera“ lässt sich zusätzlich ein eigenes Foto eines Labels hochladen; das liest eine echte Texterkennung, die lokal auf dem Rechner läuft.

## Starten

1. Prüfen, dass Node.js ab Version 22.18 installiert ist: `node --version`.
2. `npm ci` installiert die Pakete (einmalig).
3. `npm run demo` baut die Oberfläche und startet den Prototyp mit den Demo-Daten.
4. Im Browser `http://127.0.0.1:3000` öffnen.
5. Auf der Startseite die Rolle wählen: Max, Marie oder Kamera.

Was in einem Test zu tun ist und worauf die Testleitung achtet, steht in [`docs/testablauf.md`](docs/testablauf.md). „Daten zurücksetzen“ unten auf der Startseite stellt die Demo-Daten für den nächsten Durchlauf wieder her; die Rückmeldungen bleiben dabei erhalten.

## Eigenes Foto prüfen

1. Auf der Startseite „Kamera · Eigenes Foto hochladen“ wählen.
2. Einen der 3 Plätze der „Testanlage Eigene Fotos“ wählen und ein Foto eines Labels hochladen (PNG oder JPEG, höchstens 5 MB). Bitte nur Labels fotografieren, keine Personen.
3. Die Seite zeigt den gelesenen Text und den Sprachvorschlag. Danach prüft Max das Label wie jedes andere.

Die Texterkennung (tesseract.js) läuft ohne Internet; `npm ci` installiert sie mit den Sprachdaten für Deutsch, Englisch, Polnisch, Französisch und Russisch. Am besten liest sie gerade, scharfe Fotos ohne Spiegelung; schlecht gelesene Fotos landen bei Max als „Unsicher“. Findet sie keinen Text, kann man ihn auf der Kamera-Seite selbst eintippen. Die Fotos liegen unter `daten/` und werden bei „Daten zurücksetzen“ gelöscht. Wer die neue Version in einen Ordner mit älteren Daten entpackt, wählt einmal „Daten zurücksetzen“, damit die Testanlage erscheint.

Die Datei `labyrinth.py` ist ein eigenständiges Spiel und gehört nicht zum Prototyp.

## Für Entwickler

- `npm test` führt alle Tests aus, `npm run typecheck` prüft die Typen.
- `npm start` startet mit den 20 Basis-Testlabels aus `testdaten/` (Datenbank `daten/pruefsystem.sqlite`), `npm run demo` mit den 37 Demo-Labels und den 3 Plätzen für eigene Fotos aus `testdaten/demo/` (Datenbank `daten/demo.sqlite`, eigene Fotos in `daten/uploads-demo/`). Wer von vorn beginnen will, löscht die jeweilige Datei.
- `npm run dev` startet den Entwicklungsserver unter `http://127.0.0.1:5173`.
- `npm run bilder` erzeugt die Bilder der Basisdaten neu, `npm run bilder -- testdaten/demo` die der Demo-Daten.
- `OCR_MODUS=aus` in `.env` schaltet die Texterkennung für eigene Fotos ab; dann wird der Text auf der Kamera-Seite eingetippt.
- Die Spracherkennung läuft im Mock-Modus ohne Schlüssel; im Demo-Modus immer. Ein Schlüssel stünde nur in `.env` (Vorlage: `.env.example`).
- Browser-Tests (`tests/**/*.browser.ts`) laufen nicht mit `npm test`, weil Playwright kein Paket des Projekts ist. Nach `npm run build` startet man sie einzeln, zum Beispiel:
  `node --disable-warning=ExperimentalWarning --test tests/browser/demo.browser.ts`.
  Playwright wird unter `PLAYWRIGHT_PFAD` gesucht (Standard: `/opt/node22/lib/node_modules/playwright/index.mjs`). Mit `BILDER_AUSGABE=<ordner>` speichern einige Tests Bildschirmfotos.
