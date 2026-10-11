// Startet den Server mit den Demo-Daten für Nutzertests: npm run demo (AK-50).
// Eine eigene Datei statt „DATENSATZ=demo“ im Skript, damit der Befehl auch unter Windows läuft.

process.env.DATENSATZ = 'demo';
await import('./start.ts');
