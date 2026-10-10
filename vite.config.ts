// Vite für die Oberfläche: Wurzel ist src/ui (nicht das Projekt), gebaut wird nach dist/.
// Im Entwicklungsmodus (npm run dev) hängt die Schnittstelle als derselbe Handler im selben Prozess.

import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, type Plugin } from 'vite';

const wurzel = fileURLToPath(new URL('.', import.meta.url));
const ui = fileURLToPath(new URL('./src/ui', import.meta.url));

/** Schnittstelle und Fotos im Entwicklungsserver, mit Host-Prüfung, Rolle und Größenlimit wie im Server. */
function schnittstelle(): Plugin {
  return {
    name: 'pruefsystem-schnittstelle',
    apply: 'serve',
    async configureServer(server) {
      const { bereiteSystemVor, HINWEIS_DATENBANK_ERSETZT } = await import('./src/server/system.ts');
      const { erstelleHandler } = await import('./src/server/app.ts');
      const system = await bereiteSystemVor(wurzel);
      if (system.datenbankErsetzt) server.config.logger.warn(HINWEIS_DATENBANK_ERSETZT);
      const handler = erstelleHandler({ db: system.db, bilderOrdner: system.bilderOrdner, modell: system.modell });
      // Direkt eingehängt, also vor den eigenen Middlewares von Vite und ohne Pfad-Präfix.
      server.middlewares.use((req, res, next) => void handler(req, res, () => next()));
    },
  };
}

export default defineConfig({
  root: ui,
  publicDir: false,
  appType: 'mpa',
  plugins: [tailwindcss(), schnittstelle()],
  oxc: { jsx: { runtime: 'automatic', importSource: 'react' } },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    cors: false,
    // Wie die gebaute Fassung: nicht in fremde Seiten einbetten lassen, denn die Oberfläche schreibt als Max.
    headers: { 'X-Frame-Options': 'DENY', 'Content-Security-Policy': "frame-ancestors 'none'" },
    fs: {
      strict: true,
      allow: [ui, fileURLToPath(new URL('./node_modules', import.meta.url))],
      deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/testdaten/**', '**/daten/**', '**/tests/**'],
    },
  },
  build: {
    outDir: fileURLToPath(new URL('./dist', import.meta.url)),
    emptyOutDir: true,
    assetsInlineLimit: 0,
    sourcemap: false,
  },
});
