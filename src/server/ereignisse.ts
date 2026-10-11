// Signal „es hat sich etwas geändert“ an offene Seiten, über Server-Sent Events (in node:http und im
// Browser eingebaut, kein Paket). Maries Übersicht lädt daraufhin neu (AK-44). Das Signal enthält keine
// Daten, nur eine laufende Nummer; gelesen wird danach wie immer über die Schnittstelle.

import type { ServerResponse } from 'node:http';

/** Mehr gleichzeitige Verbindungen braucht ein lokaler Prototyp nicht; jede weitere bekommt 503. */
export const MAX_VERBINDUNGEN = 50;
/** Kommentarzeile in diesem Abstand, damit keine Zwischenstelle die ruhende Verbindung schließt. */
const LEBENSZEICHEN_MS = 25_000;

export class Ereignisse {
  private readonly offen = new Set<ServerResponse>();
  private readonly grenze: number;
  private stand = 0;
  private takt: ReturnType<typeof setInterval> | null = null;

  constructor(grenze = MAX_VERBINDUNGEN) {
    this.grenze = grenze;
  }

  get anzahl(): number {
    return this.offen.size;
  }

  /** Nimmt eine Verbindung auf. Gibt false zurück, wenn schon zu viele offen sind. */
  verbinde(res: ServerResponse): boolean {
    if (this.offen.size >= this.grenze) return false;
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      Connection: 'keep-alive',
    });
    // Wiederverbinden nach drei Sekunden; die erste Nachricht nennt den aktuellen Stand.
    res.write(`retry: 3000\ndata: ${JSON.stringify({ stand: this.stand })}\n\n`);
    this.offen.add(res);
    res.on('close', () => this.trenne(res));
    if (!this.takt) {
      this.takt = setInterval(() => this.schreibeAlle(': lebt\n\n'), LEBENSZEICHEN_MS);
      this.takt.unref();
    }
    return true;
  }

  /** Nach jeder erfolgreichen Änderung. */
  melde(): void {
    this.stand += 1;
    this.schreibeAlle(`data: ${JSON.stringify({ stand: this.stand })}\n\n`);
  }

  /** Beendet alle Verbindungen, etwa beim Schließen des Servers. */
  schliesseAlle(): void {
    for (const res of [...this.offen]) res.end();
    this.offen.clear();
    this.stoppeTakt();
  }

  private trenne(res: ServerResponse): void {
    this.offen.delete(res);
    if (this.offen.size === 0) this.stoppeTakt();
  }

  private stoppeTakt(): void {
    if (this.takt) clearInterval(this.takt);
    this.takt = null;
  }

  private schreibeAlle(text: string): void {
    for (const res of this.offen) {
      if (!res.writableEnded && !res.destroyed) res.write(text);
    }
  }
}
