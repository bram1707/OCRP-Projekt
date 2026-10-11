// Merkmale, an denen die simulierte Spracherkennung eine Sprache festmacht.
// Dieselben Merkmale sind die Belege, die Max über den „Warum?“-Knopf sieht.
// Die Wortlisten sind absichtlich überschneidungsfrei (siehe Test), damit ein
// Wort nie für zwei Sprachen zählt.

export type Sprachcode = 'de' | 'en' | 'pl' | 'fr' | 'ru' | 'tr' | 'bg' | 'zh' | 'it' | 'es';

export interface SprachMerkmale {
  code: Sprachcode;
  name: string;
  /** typische Wörter, klein geschrieben */
  woerter: readonly string[];
  /** typische Zeichen, als Ausdruck für ein einzelnes Zeichen */
  zeichen: RegExp | null;
  /** Beschreibung der Zeichen für die Begründung */
  zeichenName: string;
  /** Schrift ohne Leerzeichen zwischen Wörtern (Chinesisch): Wörter werden als Teilstück gesucht. */
  ohneLeerzeichen?: boolean;
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
      // echte Warnschilder (Erweiterung eigenes Foto, U5)
      'lebensgefahr', 'verletzungsgefahr', 'brandgefahr', 'warnhinweis', 'beachten', 'schutzhandschuhe', 'sicherheitsschuhe',
      'rauchen', 'feuer', 'bereich', 'gefährliche', 'schutzausrüstung', 'notausgang', 'kein',
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
      // echte Warnschilder (Erweiterung eigenes Foto, U5)
      'injury', 'risk', 'must', 'be', 'worn', 'fire', 'flammable', 'moving', 'parts', 'smoking', 'protective', 'gloves',
      'emergency', 'exit', 'this', 'area', 'no',
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
      // echte Warnschilder (Erweiterung eigenes Foto, U5)
      'niebezpieczne', 'palenia', 'obowiązek', 'stosowania', 'rękawic', 'ochronnych', 'ogień', 'pożaru', 'wyjście',
      'ewakuacyjne', 'urządzenia', 'obsługi',
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
      // echte Warnschilder (Erweiterung eigenes Foto, U5)
      'avertissement', 'dangereux', 'défense', 'fumer', 'obligatoire', 'gants', 'incendie', 'sortie', 'secours', 'blessure',
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
      // echte Warnschilder (Erweiterung eigenes Foto, U5)
      'курить', 'запрещается', 'пожар', 'огонь', 'выход', 'перчатки', 'током', 'электрическим', 'опасная', 'зона',
    ],
    zeichen: /[Ѐ-ӿ]/u,
    zeichenName: 'kyrillische Buchstaben',
  },
  // Weitere Sprachen (Optimierung 2, Punkte 7 und 8). Türkisch, Bulgarisch und Chinesisch liest auch die
  // Texterkennung; Italienisch und Spanisch liest sie mit den lateinischen Sprachdaten mit.
  {
    code: 'tr',
    name: 'Türkisch',
    woerter: [
      'dikkat', 'tehlike', 'tehlikesi', 'uyarı', 'yüksek', 'gerilim', 'hayati', 'dokunmayın', 'dokunmayınız', 'sıcak',
      'yüzey', 'koruyucu', 'gözlük', 'gözlüğü', 'takın', 'kullanın', 'giriş', 'girilmez', 'yasaktır', 'yasak',
      'ellerinizi', 'uzak', 'tutun', 'ezilme', 'çarpma', 'bakımdan', 'bakım', 'önce', 'kapatın', 'yetkisiz', 'kişilerin',
      'sigara', 'içilmez', 'kulaklık', 'eldiven', 'elektrik', 've', 'ile', 'için', 'bu', 'alan', 'makineyi', 'açmayın',
    ],
    zeichen: /[ğışĞŞ]/u,
    zeichenName: 'türkische Sonderzeichen',
  },
  {
    code: 'bg',
    name: 'Bulgarisch',
    woerter: [
      'опасност', 'внимавайте', 'предупреждение', 'високо', 'напрежение', 'докосвайте', 'отваряйте', 'гореща',
      'повърхност', 'смачкване', 'дръжте', 'ръцете', 'далеч', 'носете', 'предпазни', 'очила', 'антифони', 'забранено',
      'влизането', 'само', 'упълномощен', 'персонал', 'преди', 'поддръжка', 'изключете', 'машината', 'ток', 'токов',
      'удар', 'живота', 'ръкавици', 'пушенето', 'изход', 'от', 'на', 'за', 'се', 'и',
    ],
    zeichen: /[ъщЪЩ]/u,
    zeichenName: 'bulgarische Buchstaben ъ und щ',
  },
  {
    code: 'zh',
    name: 'Chinesisch',
    woerter: [
      '注意', '警告', '危险', '小心', '当心', '禁止', '必须', '佩戴', '护目镜', '高压', '高温', '表面', '触摸', '请勿',
      '触电', '夹手', '打开', '维修', '检修', '前', '关闭', '电源', '进入', '非工作人员', '入内', '耳罩', '手套', '吸烟',
      '烟火', '安全', '出口', '机器', '运行', '时', '远离',
    ],
    zeichen: /\p{Script=Han}/u,
    zeichenName: 'chinesische Schriftzeichen',
    ohneLeerzeichen: true,
  },
  {
    code: 'it',
    name: 'Italienisch',
    woerter: [
      'attenzione', 'pericolo', 'avvertenza', 'tensione', 'non', 'toccare', 'calda', 'indossare', 'occhiali',
      'protettivi', 'vietato', 'ingresso', 'mani', 'lontano', 'lontane', 'rischio', 'schiacciamento', 'prima', 'della',
      'manutenzione', 'spegnere', 'personale', 'autorizzato', 'aprire', 'parti', 'movimento', 'guanti', 'fumare',
      'uscita', 'emergenza', 'il', 'di', 'con',
    ],
    zeichen: /[ìòÌÒ]/u,
    zeichenName: 'italienische Akzente',
  },
  {
    code: 'es',
    name: 'Spanisch',
    woerter: [
      'peligro', 'atención', 'advertencia', 'precaución', 'tensión', 'tocar', 'caliente', 'usar', 'gafas', 'protección',
      'prohibido', 'prohibida', 'manos', 'alejadas', 'riesgo', 'aplastamiento', 'antes', 'mantenimiento', 'desconectar',
      'personal', 'autorizado', 'abrir', 'piezas', 'guantes', 'fumar', 'salida', 'emergencia', 'el', 'y', 'del', 'las',
    ],
    zeichen: /[ñÑ¿¡áíúÁÍÚ]/u,
    zeichenName: 'spanische Sonderzeichen',
  },
];

const NAMEN: Record<string, string> = Object.fromEntries(SPRACHEN.map((s) => [s.code, s.name]));

/** Deutscher Name einer Sprache, z. B. „pl“ → „Polnisch“. */
export function sprachName(code: string): string {
  if (code === 'unbekannt') return 'Unbekannt';
  return NAMEN[code] ?? code;
}
