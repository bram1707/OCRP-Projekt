// Tabellen des Prüfsystems. Erwartungswerte der Testdaten stehen bewusst nicht
// in der Datenbank (AK-61), ebenso wenig ein API-Schlüssel (AK-34) oder eine Soll-Sprache (AK-33).

/**
 * Stand des Schemas (PRAGMA user_version). Stufe 1 hatte keinen Stand (0).
 * Stufe 2: Foto bei der Nachbesserung, nachgereichtes Foto, Zurücknehmen.
 * Stufe 4: Rückmeldungen zum Prototyp (AK-51).
 */
export const SCHEMA_STAND = 3;

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS anlagen (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  soll_anzahl     INTEGER NOT NULL CHECK (soll_anzahl > 0),
  freigegeben_am  TEXT,
  freigegeben_von TEXT
);

CREATE TABLE IF NOT EXISTS labels (
  id                      TEXT PRIMARY KEY,
  anlage_id               TEXT NOT NULL REFERENCES anlagen(id),
  bild_pfad               TEXT,
  ocr_text                TEXT NOT NULL DEFAULT '',
  ocr_konfidenz           REAL NOT NULL CHECK (ocr_konfidenz BETWEEN 0 AND 1),
  sprachen                TEXT NOT NULL,
  konfidenz_je_sprache    TEXT NOT NULL,
  sprach_konfidenz        REAL NOT NULL CHECK (sprach_konfidenz BETWEEN 0 AND 1),
  prioritaet              TEXT NOT NULL CHECK (prioritaet IN ('genau_pruefen', 'normal')),
  begruendung             TEXT NOT NULL,
  status                  TEXT NOT NULL
    CHECK (status IN ('offen', 'unsicher', 'nachgebessert', 'fehlerhaft', 'bestaetigt', 'fehlt')),
  letzter_fehlergrund     TEXT CHECK (letzter_fehlergrund IN ('unleserlich', 'sprache_falsch', 'beschaedigt')),
  -- was die simulierte Nachbesserung liefert (Foto ist optional)
  korrektur_bild_pfad     TEXT,
  korrektur_ocr_text      TEXT,
  korrektur_ocr_konfidenz REAL,
  -- was die Simulation „Foto nachreichen“ liefert, nur bei Labels ohne Foto
  nacherfassung_bild_pfad     TEXT,
  nacherfassung_ocr_text      TEXT,
  nacherfassung_ocr_konfidenz REAL
);
CREATE INDEX IF NOT EXISTS labels_anlage ON labels(anlage_id);

CREATE TABLE IF NOT EXISTS entscheidungen (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  anlage_id TEXT NOT NULL REFERENCES anlagen(id),
  label_id  TEXT REFERENCES labels(id),
  wer       TEXT NOT NULL,
  wann      TEXT NOT NULL,
  ergebnis  TEXT NOT NULL
    CHECK (ergebnis IN ('bestaetigt', 'fehler', 'nachgebessert', 'nacherfasst', 'zurueckgenommen', 'freigegeben')),
  grund     TEXT
);
CREATE INDEX IF NOT EXISTS entscheidungen_label ON entscheidungen(label_id);

-- Rückmeldungen aus Nutzertests (AK-51): bewusst ohne Name, Rolle, Adresse oder Browser.
CREATE TABLE IF NOT EXISTS feedback (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  szenario  TEXT NOT NULL CHECK (szenario IN ('presse3', 'montagelinie1', 'lackierung2', 'marie', 'allgemein')),
  zeitpunkt TEXT NOT NULL,
  kommentar TEXT NOT NULL CHECK (length(kommentar) BETWEEN 1 AND 1000)
);
`;
