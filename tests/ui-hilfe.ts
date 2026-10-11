// Hilfen für die Tests der Oberfläche. Bausteine werden über Vite geladen und mit react-dom/server
// zu HTML gerendert; die Daten dafür sind echte Antworten eines Testservers mit den Testdaten.
// Vite läuft ohne Konfigurationsdatei, ohne Websocket, ohne Dateiüberwachung und ohne Abhängigkeits-Scan.

import { join } from 'node:path';
import { createElement, type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer, type ViteDevServer } from 'vite';
import { neueDatenbank, starteServer, WURZEL, type TestServer } from './hilfen.ts';

export const UI = join(WURZEL, 'src', 'ui');

export async function starteVite(): Promise<ViteDevServer> {
  return createServer({
    configFile: false,
    root: UI,
    appType: 'custom',
    logLevel: 'error',
    server: { middlewareMode: true, ws: false, watch: null },
    optimizeDeps: { noDiscovery: true, include: [] },
    oxc: { jsx: { runtime: 'automatic', importSource: 'react' } },
  });
}

/** Lädt ein Modul der Oberfläche, z. B. „/pruefung/Kachel.tsx“. */
export async function lade(vite: ViteDevServer, pfad: string): Promise<Record<string, any>> {
  return vite.ssrLoadModule(pfad);
}

export function rendere(komponente: ComponentType<any>, eigenschaften: Record<string, unknown>): string {
  return renderToStaticMarkup(createElement(komponente, eigenschaften));
}

/** Sichtbarer Text ohne Tags, Entitäten aufgelöst, Leerraum zusammengefasst. */
export function text(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Das HTML des ersten Elements mit diesem Attributwert, z. B. data-kachel="STA4-03" (ohne gleichnamige Kinder). */
export function element(html: string, tag: string, attribut: string, wert: string): string | null {
  const muster = new RegExp(`<${tag}\\b[^>]*\\b${attribut}="${wert.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*>[\\s\\S]*?</${tag}>`);
  return muster.exec(html)?.[0] ?? null;
}

export function zaehle(html: string, teil: string | RegExp): number {
  return typeof teil === 'string' ? html.split(teil).length - 1 : (html.match(new RegExp(teil.source, teil.flags.includes('g') ? teil.flags : teil.flags + 'g')) ?? []).length;
}

/** Ruft die Schnittstelle eines Testservers wie die Oberfläche auf. */
export async function json(server: TestServer, pfad: string, methode: 'GET' | 'POST' = 'GET', koerper?: unknown): Promise<any> {
  const kopf: Record<string, string> = methode === 'POST' ? { 'X-Rolle': 'max' } : {};
  if (koerper !== undefined) kopf['Content-Type'] = 'application/json';
  const res = await fetch(server.url + pfad, { method: methode, headers: kopf, body: koerper === undefined ? undefined : JSON.stringify(koerper) });
  const daten = await res.json();
  if (!res.ok) throw new Error(`${methode} ${pfad}: ${res.status} ${JSON.stringify(daten)}`);
  return daten;
}

/** Ein Testserver mit frischen Testdaten, der nach `arbeit` wieder schließt. */
export async function mitServer<T>(arbeit: (s: TestServer) => Promise<T>): Promise<T> {
  const s = await starteServer(await neueDatenbank());
  try {
    return await arbeit(s);
  } finally {
    await s.schliessen();
  }
}
