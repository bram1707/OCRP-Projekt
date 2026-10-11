// Kleines Wörterbuch typischer Warnbegriffe (Optimierung 2, Punkt 3): Was ein erkanntes fremdes Wort
// auf Deutsch bedeutet. Das ist keine Übersetzung des ganzen Labels, nur eine Hilfe beim Prüfen; eine
// vollständige Übersetzung wäre Aufgabe des echten Sprachmodells. Schlüssel sind Wörter aus den Listen
// in sprachen.ts (klein geschrieben).

import type { Beleg } from './belege.ts';

const GLOSSAR: Readonly<Record<string, string>> = {
  // Englisch
  warning: 'Warnung', caution: 'Vorsicht', hazard: 'Gefahr', high: 'hoch', voltage: 'Spannung',
  keep: 'halten', hands: 'Hände', away: 'fern, weg', wear: 'tragen', safety: 'Sicherheit', glasses: 'Brille',
  hearing: 'Gehör', hot: 'heiß', before: 'vor', maintenance: 'Wartung', switch: 'schalten', off: 'aus', entry: 'Zutritt',
  crushing: 'Quetschen', electric: 'elektrisch', shock: 'Schlag', authorized: 'befugt', only: 'nur', touch: 'berühren',
  injury: 'Verletzung', risk: 'Gefahr, Risiko', must: 'muss', fire: 'Feuer', flammable: 'entzündlich', moving: 'bewegliche',
  parts: 'Teile', smoking: 'Rauchen', protective: 'Schutz-', gloves: 'Handschuhe', emergency: 'Not-', exit: 'Ausgang', no: 'kein, nicht',
  not: 'nicht', area: 'Bereich',
  // Polnisch
  uwaga: 'Achtung', niebezpieczeństwo: 'Gefahr', ostrzeżenie: 'Warnung', dotykać: 'berühren', otwierać: 'öffnen',
  wysokie: 'hohe', napięcie: 'Spannung', nosić: 'tragen', okulary: 'Brille', ochronne: 'Schutz-', wstęp: 'Zutritt',
  wzbroniony: 'verboten', gorąca: 'heiße', powierzchnia: 'Oberfläche', przed: 'vor', konserwacją: 'Wartung',
  wyłączyć: 'abschalten', maszynę: 'Maschine', ręce: 'Hände', trzymać: 'halten', zgniecenia: 'Quetschen', ryzyko: 'Gefahr, Risiko',
  ochronniki: 'Schutz', słuchu: 'Gehör', porażenia: 'Schlag', prądem: 'Strom', zakaz: 'Verbot', niebezpieczne: 'gefährlich',
  palenia: 'Rauchen', ogień: 'Feuer', pożaru: 'Brand', wyjście: 'Ausgang', ewakuacyjne: 'Notausgang', rękawic: 'Handschuhe',
  // Französisch
  attention: 'Achtung', toucher: 'berühren', haute: 'hohe', tension: 'Spannung', porter: 'tragen', lunettes: 'Brille',
  chaude: 'heiß', avant: 'vor', entretien: 'Wartung', couper: 'abschalten', interdit: 'verboten', entrée: 'Zutritt',
  risque: 'Gefahr, Risiko', écrasement: 'Quetschen', électrique: 'elektrisch', mains: 'Hände', éloignées: 'fern',
  autorisé: 'befugt', uniquement: 'nur', protection: 'Schutz', ouvrir: 'öffnen', avertissement: 'Warnung',
  dangereux: 'gefährlich', fumer: 'rauchen', obligatoire: 'Pflicht', gants: 'Handschuhe', incendie: 'Brand', sortie: 'Ausgang',
  secours: 'Not-', blessure: 'Verletzung',
  // Russisch
  внимание: 'Achtung', опасно: 'gefährlich', осторожно: 'Vorsicht', высокое: 'hohe', напряжение: 'Spannung',
  прикасаться: 'berühren', открывать: 'öffnen', носить: 'tragen', защитные: 'Schutz-', очки: 'Brille', горячая: 'heiße',
  поверхность: 'Oberfläche', перед: 'vor', обслуживанием: 'Wartung', отключить: 'abschalten', вход: 'Zutritt',
  запрещён: 'verboten', запрещен: 'verboten', опасность: 'Gefahr', руки: 'Hände', только: 'nur', персонала: 'Personal',
  курить: 'rauchen', запрещается: 'verboten', пожар: 'Brand', огонь: 'Feuer', выход: 'Ausgang', перчатки: 'Handschuhe',
  током: 'Strom', опасная: 'gefährliche', зона: 'Bereich',
  // Türkisch (Schlüssel wie in belege.ts verglichen: „ı“ als „i“)
  dikkat: 'Achtung', tehlike: 'Gefahr', tehlikesi: 'Gefahr', uyari: 'Warnung', yüksek: 'hohe', gerilim: 'Spannung',
  hayati: 'lebens-', dokunmayin: 'nicht berühren', dokunmayiniz: 'nicht berühren', sicak: 'heiß', yüzey: 'Oberfläche',
  koruyucu: 'Schutz-', gözlük: 'Brille', gözlüğü: 'Brille', takin: 'tragen', kullanin: 'benutzen', giriş: 'Zutritt',
  girilmez: 'kein Zutritt', yasaktir: 'verboten', yasak: 'verboten', ellerinizi: 'Ihre Hände', uzak: 'fern', tutun: 'halten',
  ezilme: 'Quetschen', çarpma: 'Schlag', bakimdan: 'vor der Wartung', bakim: 'Wartung', önce: 'vor', kapatin: 'abschalten',
  yetkisiz: 'unbefugte', kişilerin: 'Personen', sigara: 'Zigarette', içilmez: 'nicht rauchen', kulaklik: 'Gehörschutz',
  eldiven: 'Handschuhe', elektrik: 'Strom',
  // Bulgarisch
  опасност: 'Gefahr', внимавайте: 'Vorsicht', предупреждение: 'Warnung', високо: 'hohe', напрежение: 'Spannung',
  докосвайте: 'berühren', отваряйте: 'öffnen', гореща: 'heiße', повърхност: 'Oberfläche', смачкване: 'Quetschen',
  дръжте: 'halten', ръцете: 'die Hände', далеч: 'fern', носете: 'tragen', предпазни: 'Schutz-', очила: 'Brille',
  антифони: 'Gehörschutz', забранено: 'verboten', влизането: 'Zutritt', само: 'nur', упълномощен: 'befugt',
  персонал: 'Personal', преди: 'vor', поддръжка: 'Wartung', изключете: 'abschalten', машината: 'Maschine', ток: 'Strom',
  удар: 'Schlag', живота: 'Leben', ръкавици: 'Handschuhe', пушенето: 'Rauchen', изход: 'Ausgang',
  // Chinesisch
  注意: 'Achtung', 警告: 'Warnung', 危险: 'Gefahr', 小心: 'Vorsicht', 当心: 'Vorsicht', 禁止: 'verboten', 必须: 'muss',
  佩戴: 'tragen', 护目镜: 'Schutzbrille', 高压: 'Hochspannung', 高温: 'hohe Temperatur', 表面: 'Oberfläche', 触摸: 'berühren',
  请勿: 'bitte nicht', 触电: 'Stromschlag', 夹手: 'Quetschgefahr für Hände', 打开: 'öffnen', 维修: 'Wartung', 检修: 'Wartung',
  关闭: 'abschalten', 电源: 'Stromversorgung', 进入: 'betreten', 非工作人员: 'Unbefugte', 入内: 'eintreten', 耳罩: 'Gehörschutz',
  手套: 'Handschuhe', 吸烟: 'Rauchen', 烟火: 'Feuer', 安全: 'Sicherheit', 出口: 'Ausgang', 机器: 'Maschine', 运行: 'Betrieb', 远离: 'fernhalten',
  // Italienisch
  attenzione: 'Achtung', pericolo: 'Gefahr', avvertenza: 'Warnung', tensione: 'Spannung', non: 'nicht', toccare: 'berühren',
  calda: 'heiß', indossare: 'tragen', occhiali: 'Brille', protettivi: 'Schutz-', vietato: 'verboten', ingresso: 'Zutritt',
  mani: 'Hände', lontano: 'fern', lontane: 'fern', rischio: 'Gefahr, Risiko', schiacciamento: 'Quetschen', manutenzione: 'Wartung',
  spegnere: 'abschalten', personale: 'Personal', autorizzato: 'befugt', aprire: 'öffnen', guanti: 'Handschuhe',
  fumare: 'rauchen', uscita: 'Ausgang', emergenza: 'Notfall',
  // Spanisch
  peligro: 'Gefahr', atención: 'Achtung', advertencia: 'Warnung', precaución: 'Vorsicht', tensión: 'Spannung', tocar: 'berühren',
  caliente: 'heiß', usar: 'benutzen', gafas: 'Brille', protección: 'Schutz', prohibido: 'verboten', prohibida: 'verboten',
  manos: 'Hände', alejadas: 'fern', riesgo: 'Gefahr, Risiko', aplastamiento: 'Quetschen', mantenimiento: 'Wartung',
  desconectar: 'abschalten', personal: 'Personal', autorizado: 'befugt', abrir: 'öffnen', guantes: 'Handschuhe',
  fumar: 'rauchen', salida: 'Ausgang', emergencia: 'Notfall',
};

export interface Bedeutung {
  /** das Wort, wie es im Text steht */
  wort: string;
  sprache: string;
  deutsch: string;
}

const schluessel = (wort: string) => wort.toLowerCase().replace(/̇/g, '').replace(/ı/g, 'i');

/** Deutsche Bedeutung der erkannten fremden Warnbegriffe, jedes Wort einmal, in der Reihenfolge des Textes. */
export function bedeutungen(belege: readonly Beleg[]): Bedeutung[] {
  const gesehen = new Set<string>();
  const ergebnis: Bedeutung[] = [];
  for (const b of belege) {
    if (b.art !== 'wort' || b.sprache === 'de') continue;
    const k = schluessel(b.text);
    const deutsch = GLOSSAR[k];
    if (!deutsch || gesehen.has(k)) continue;
    gesehen.add(k);
    ergebnis.push({ wort: b.text, sprache: b.sprache, deutsch });
  }
  return ergebnis;
}

/** Nur für Tests: alle Schlüssel des Wörterbuchs. */
export const GLOSSAR_WOERTER: readonly string[] = Object.keys(GLOSSAR);
