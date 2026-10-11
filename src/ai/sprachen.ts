// Merkmale, an denen die simulierte Spracherkennung eine Sprache festmacht.
// Dieselben Merkmale sind die Belege, die Max über den „Warum?“-Knopf sieht.
// Die Wortlisten sind absichtlich überschneidungsfrei (siehe Test), damit ein
// Wort nie für zwei Sprachen zählt.

export type Sprachcode = 'de' | 'en' | 'pl' | 'fr' | 'ru';

export interface SprachMerkmale {
  code: Sprachcode;
  name: string;
  /** typische Wörter, klein geschrieben */
  woerter: readonly string[];
  /** typische Zeichen, als Ausdruck für ein einzelnes Zeichen */
  zeichen: RegExp | null;
  /** Beschreibung der Zeichen für die Begründung */
  zeichenName: string;
}

export const SPRACHEN: readonly SprachMerkmale[] = [
  {
    code: 'de',
    name: 'Deutsch',
    woerter: [
      'achtung', 'gefahr', 'vorsicht', 'warnung', 'nicht', 'hochspannung', 'berühren',
      'öffnen', 'schutzbrille', 'tragen', 'gehörschutz', 'betreten', 'verboten',
      'quetschgefahr', 'heiße', 'oberfläche', 'maschine', 'und', 'nur', 'für',
      'abschalten', 'stromschlag', 'elektrische', 'spannung', 'wartung', 'vor',
      'hände', 'fernhalten', 'unbefugte', 'personen', 'zutritt', 'benutzen',
    ],
    zeichen: /[äöüßÄÖÜ]/u,
    zeichenName: 'Umlaute und ß',
  },
  {
    code: 'en',
    name: 'Englisch',
    woerter: [
      'warning', 'caution', 'not', 'high', 'voltage', 'keep', 'hands', 'away',
      'wear', 'safety', 'glasses', 'hearing', 'hot', 'before', 'maintenance',
      'switch', 'off', 'entry', 'crushing', 'electric', 'shock', 'authorized',
      'only', 'the', 'do', 'touch', 'hazard',
    ],
    zeichen: null,
    zeichenName: '',
  },
  {
    code: 'pl',
    name: 'Polnisch',
    woerter: [
      'uwaga', 'niebezpieczeństwo', 'ostrzeżenie', 'dotykać', 'otwierać', 'wysokie',
      'napięcie', 'nosić', 'okulary', 'ochronne', 'wstęp', 'wzbroniony', 'gorąca',
      'powierzchnia', 'przed', 'konserwacją', 'wyłączyć', 'maszynę', 'ręce', 'trzymać',
      'zgniecenia', 'ryzyko', 'ochronniki', 'słuchu', 'porażenia', 'prądem',
      'osobom', 'nieupoważnionym', 'zakaz', 'dala',
    ],
    zeichen: /[ąęłżźśćńóĄĘŁŻŹŚĆŃÓ]/u,
    zeichenName: 'polnische Sonderzeichen',
  },
  {
    code: 'fr',
    name: 'Französisch',
    woerter: [
      'attention', 'ne', 'pas', 'toucher', 'haute', 'tension', 'porter', 'lunettes',
      'chaude', 'avant', 'entretien', 'couper', 'interdit', 'entrée', 'risque',
      'écrasement', 'électrique', 'mains', 'éloignées', 'autorisé', 'uniquement',
      'protection', 'ouvrir', 'tenir', 'les',
    ],
    zeichen: /[éèêàâçîôûùëïÉÈÊÀÂÇÎÔÛÙËÏ]/u,
    zeichenName: 'französische Akzente',
  },
  {
    code: 'ru',
    name: 'Russisch',
    woerter: [
      'внимание', 'опасно', 'осторожно', 'высокое', 'напряжение', 'не', 'прикасаться',
      'открывать', 'носить', 'защитные', 'очки', 'горячая', 'поверхность', 'перед',
      'обслуживанием', 'отключить', 'вход', 'запрещён', 'запрещен', 'опасность',
      'руки', 'держать', 'только', 'для', 'персонала',
    ],
    zeichen: /[Ѐ-ӿ]/u,
    zeichenName: 'kyrillische Buchstaben',
  },
];

const NAMEN: Record<string, string> = Object.fromEntries(SPRACHEN.map((s) => [s.code, s.name]));

/** Deutscher Name einer Sprache, z. B. „pl“ → „Polnisch“. */
export function sprachName(code: string): string {
  if (code === 'unbekannt') return 'Unbekannt';
  return NAMEN[code] ?? code;
}
