// Selbstgeschriebene Schemaprüfung für die Antwort der Spracherkennung (AK-30, AK-31).
// Was nicht exakt dem Schema entspricht, gilt als ungültig. Der Aufrufer macht
// daraus „unbekannt“ mit Priorität „genau_pruefen“, es wird nie geraten.

export type Prioritaet = 'genau_pruefen' | 'normal';

export interface SprachAntwort {
  /** ISO-639-1-Codes wie „de“, „pl“ oder genau ["unbekannt"] */
  sprachen: string[];
  /** Gesamtsicherheit 0..1, immer der niedrigste Wert aller Sprachen */
  konfidenz: number;
  /** Sicherheit je Sprache 0..1, Schlüssel = Einträge aus `sprachen` (bei „unbekannt“ leer) */
  konfidenzJeSprache: Record<string, number>;
  prioritaet: Prioritaet;
  /** ein Satz */
  begruendung: string;
}

export type PruefErgebnis =
  | { gueltig: true; antwort: SprachAntwort }
  | { gueltig: false; fehler: string };

const ISO_CODE = /^[a-z]{2}$/;
const MAX_SPRACHEN = 5;
const MAX_BEGRUENDUNG = 400;

export function unbekannteAntwort(begruendung: string): SprachAntwort {
  return {
    sprachen: ['unbekannt'],
    konfidenz: 0,
    konfidenzJeSprache: {},
    prioritaet: 'genau_pruefen',
    begruendung,
  };
}

function istZahl01(wert: unknown): wert is number {
  return typeof wert === 'number' && Number.isFinite(wert) && wert >= 0 && wert <= 1;
}

function istObjekt(wert: unknown): wert is Record<string, unknown> {
  return typeof wert === 'object' && wert !== null && !Array.isArray(wert);
}

/** Prüft eine Rohantwort (JSON-Text oder bereits geparstes Objekt) gegen das Schema. */
export function pruefeAntwort(roh: unknown): PruefErgebnis {
  let daten: unknown = roh;
  if (typeof roh === 'string') {
    try {
      daten = JSON.parse(roh);
    } catch {
      return { gueltig: false, fehler: 'Antwort ist kein gültiges JSON.' };
    }
  }
  if (!istObjekt(daten)) return { gueltig: false, fehler: 'Antwort ist kein JSON-Objekt.' };

  const { sprachen, konfidenz, konfidenzJeSprache, prioritaet, begruendung } = daten;

  if (!Array.isArray(sprachen) || sprachen.length === 0 || sprachen.length > MAX_SPRACHEN) {
    return { gueltig: false, fehler: '„sprachen“ muss eine Liste mit 1 bis 5 Einträgen sein.' };
  }
  if (!sprachen.every((s): s is string => typeof s === 'string')) {
    return { gueltig: false, fehler: '„sprachen“ darf nur Texte enthalten.' };
  }
  const unbekannt = sprachen.includes('unbekannt');
  if (unbekannt && sprachen.length !== 1) {
    return { gueltig: false, fehler: '„unbekannt“ darf nur allein stehen.' };
  }
  if (!unbekannt && !sprachen.every((s) => ISO_CODE.test(s))) {
    return { gueltig: false, fehler: '„sprachen“ enthält einen ungültigen Sprachcode.' };
  }
  if (new Set(sprachen).size !== sprachen.length) {
    return { gueltig: false, fehler: '„sprachen“ enthält doppelte Einträge.' };
  }

  if (!istZahl01(konfidenz)) return { gueltig: false, fehler: '„konfidenz“ muss zwischen 0 und 1 liegen.' };

  if (!istObjekt(konfidenzJeSprache)) {
    return { gueltig: false, fehler: '„konfidenzJeSprache“ muss ein Objekt sein.' };
  }
  const schluessel = Object.keys(konfidenzJeSprache);
  const erwartet = unbekannt ? [] : sprachen;
  if (schluessel.length !== erwartet.length || !erwartet.every((s) => schluessel.includes(s))) {
    return { gueltig: false, fehler: '„konfidenzJeSprache“ passt nicht zu „sprachen“.' };
  }
  if (!Object.values(konfidenzJeSprache).every(istZahl01)) {
    return { gueltig: false, fehler: '„konfidenzJeSprache“ muss Werte zwischen 0 und 1 haben.' };
  }

  if (prioritaet !== 'genau_pruefen' && prioritaet !== 'normal') {
    return { gueltig: false, fehler: '„prioritaet“ muss „genau_pruefen“ oder „normal“ sein.' };
  }
  if (typeof begruendung !== 'string' || begruendung.trim() === '' || begruendung.length > MAX_BEGRUENDUNG) {
    return { gueltig: false, fehler: '„begruendung“ muss ein kurzer, nicht leerer Satz sein.' };
  }

  const jeSprache = { ...(konfidenzJeSprache as Record<string, number>) };
  // Vorsichtig bleiben: Die Gesamtsicherheit ist nie höher als die schwächste Sprache.
  const gesamt = Math.min(konfidenz, ...Object.values(jeSprache));

  return {
    gueltig: true,
    antwort: {
      sprachen: [...sprachen],
      konfidenz: gesamt,
      konfidenzJeSprache: jeSprache,
      prioritaet,
      begruendung: begruendung.trim(),
    },
  };
}
