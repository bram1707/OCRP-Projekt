# Ablauf für die Testleitung

Dieser Ablauf gehört zum Prototyp der Label-Prüfung. Er beschreibt, was in jedem Szenario geschehen soll und worauf die Testleitung achtet. Die Testperson sieht diese Datei nicht; in der Oberfläche steht nie, was „richtig“ wäre.

## Vorbereitung

1. Prototyp nach der README starten (`npm run demo`, `http://127.0.0.1:3000`).
2. Auf der Startseite unten „Daten zurücksetzen“ wählen und bestätigen. Alle drei Anlagen stehen dann auf „Gesperrt“, nichts ist geprüft.
3. Für das Marie-Szenario ein zweites Browserfenster öffnen und dort „Marie · Übersicht ansehen“ wählen. Die Übersicht aktualisiert sich von selbst.
4. Der Testperson sagen: Sie dürfen laut denken, es gibt keine falschen Antworten, unten auf jeder Seite können Sie „Rückmeldung geben“.

## Szenario 1: Presse 3

**Aufgabe an die Testperson (als Max):** „Prüfen Sie die Labels der Presse 3 und geben Sie die Anlage frei, wenn alles stimmt.“

**Was geschehen soll:** 12 Labels, alle Deutsch und Polnisch, alle korrekt. Max bestätigt jedes Label einzeln, danach „Anlage freigeben“ mit Rückfrage. Die Anlage steht auf „Freigegeben“.

**Beobachten:**
- Findet die Testperson „Prüfung starten“ ohne Hilfe?
- Liest sie den Text auf dem Bild, oder bestätigt sie nur noch? (Kein „Alle bestätigen“ ist Absicht.)
- Wie lange dauert ein Label? Ab welchem Label wird es schneller?

## Szenario 2: Montagelinie 1

**Aufgabe:** „Prüfen Sie die Labels der Montagelinie 1.“

**Was geschehen soll:** 15 Labels. MON1-11 steht vorn und hat nur Deutsch, alle anderen haben Deutsch und Englisch. Die Testperson meldet MON1-11 mit „Nein, Fehler melden“ und dem Grund „Sprache falsch“ und bestätigt die übrigen 14. Die Freigabe geht dann nicht („14 von 15 bestätigt“).

Danach als **Instandhaltung** (über „Rolle wechseln“): „Nachbesserung simulieren“ für MON1-11. Dann wieder als Max: MON1-11 erscheint mit dem neuen Bild (Deutsch und Englisch) und dem Hinweis „Nachgebessert“, Max bestätigt es und gibt die Anlage frei.

**Beobachten:**
- Bemerkt die Testperson den Hinweis auf die abweichenden Sprachen, bevor sie bestätigt?
- Wählt sie den passenden Grund, oder sucht sie einen anderen?
- Versteht sie, warum die Freigabe noch nicht geht, und wie es weitergeht?

## Szenario 3: Lackierung 2

**Aufgabe:** „Prüfen Sie die Labels der Lackierung 2.“

**Was geschehen soll:** 10 Labels, Deutsch und Französisch.
- Bei LAC2-04 ist die Sprache unsicher (unter 90 %). Der Text stimmt aber; die Testperson soll es nach eigenem Blick bestätigen.
- LAC2-07 hat Deutsch und Russisch statt Deutsch und Französisch. Die Testperson meldet es mit „Sprache falsch“.

Danach wie bei Montagelinie 1: Instandhaltung bessert LAC2-07 nach (jetzt Deutsch und Französisch), Max bestätigt es und gibt die Anlage frei.

**Beobachten:**
- Verlässt sich die Testperson bei LAC2-04 auf den Vorschlag, oder schaut sie selbst aufs Bild?
- Fällt Russisch auf? Der Prototyp weist auf die abweichenden Sprachen hin; zweisprachige Labels sind normal, auffällig ist hier nur die zweite Sprache. Achtet die Testperson auf den Hinweis oder auf das Bild?

## Szenario 4: Marie, „Ist alles geprüft?“

**Aufgabe an die Testperson (als Marie):** „Sie wollen wissen, ob alle Labels geprüft sind. Was sagt Ihnen die Übersicht?“

**Was geschehen soll:** Vor der Prüfung zeigt die Übersicht 37 Labels gesamt, 36 offen, 0 erledigt, 1 fehlerhaft, und die Antwort „Nein“. Das eine fehlerhafte Label ist LAC2-04: Maries Zählung rechnet unsichere Labels zu „fehlerhaft“; der Knopf „Warum?“ erklärt das. Während Max prüft, ändern sich die Zahlen ohne Neuladen. Am Ende steht „Ja. Alle 37 Labels sind bestätigt und alle Anlagen freigegeben.“

Marie kann nichts bestätigen oder ändern; ihre einzige Eingabe ist „Rückmeldung geben“.

**Beobachten (H1):**
- Wie wirkt „fehlerhaft“ auf Marie? Klingt die Zahl zu ernst, obwohl das Label nur unsicher ist? Notieren, was sie dazu sagt; geändert wird daran im Prototyp nichts.
- Kann sie ohne Erklärung beantworten, ob alles geprüft ist?
- Klickt sie auf eine Zahl, um zu sehen, welche Labels gemeint sind?

## Rückmeldungen und nächster Durchlauf

- Rückmeldungen sammelt der Prototyp mit Szenario, Zeitpunkt und Kommentar, ohne Namen. Die Testleitung sieht sie auf der Startseite unter „Rückmeldungen ansehen“.
- „Daten zurücksetzen“ stellt alle Anlagen auf den Anfang, die Rückmeldungen bleiben. „Alle Rückmeldungen löschen“ löscht sie endgültig, etwa nach der Auswertung.
