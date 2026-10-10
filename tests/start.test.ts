// Start des Servers über npm run server (P2: die Startmeldung nennt die echte Adresse).

import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { WURZEL } from './hilfen.ts';

/** Startet start.ts mit eigener Datenbank und wartet auf die Startmeldung. */
async function starte(dbPfad: string): Promise<{ kind: ChildProcess; url: string; ausgabe: string }> {
  const kind = spawn(
    process.execPath,
    ['--disable-warning=ExperimentalWarning', join(WURZEL, 'src', 'server', 'start.ts')],
    { env: { ...process.env, PORT: '0', DB_PFAD: dbPfad, LLM_MODUS: 'mock' }, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  try {
    return await new Promise((fertig, fehler) => {
      let puffer = '';
      kind.stdout.on('data', (stueck: Buffer) => {
        puffer += stueck.toString('utf8');
        const treffer = /http:\/\/127\.0\.0\.1:\d+/.exec(puffer);
        if (treffer) fertig({ kind, url: treffer[0], ausgabe: puffer });
      });
      kind.on('exit', (code) => fehler(new Error(`Server beendet mit ${code}: ${puffer}`)));
      setTimeout(() => fehler(new Error(`keine Startmeldung: ${puffer}`)), 10_000);
    });
  } catch (fehler) {
    kind.kill();
    throw fehler;
  }
}

test('P2: mit PORT=0 nennt die Startmeldung den tatsächlich belegten Port', async () => {
  const ordner = mkdtempSync(join(tmpdir(), 'pruefsystem-start-'));
  const { kind, url, ausgabe } = await starte(join(ordner, 'test.sqlite'));
  try {
    const port = Number(url.split(':').at(-1));
    assert.ok(port > 0, url);
    assert.doesNotMatch(ausgabe, /älteren Version/);
    const antwort = await fetch(`${url}/api/anlagen`);
    assert.equal(antwort.status, 200);
  } finally {
    kind.kill();
    rmSync(ordner, { recursive: true, force: true });
  }
});

test('eine Datenbank aus Stufe 1 wird beim Start neu angelegt, die Startmeldung sagt es', async () => {
  const ordner = mkdtempSync(join(tmpdir(), 'pruefsystem-start-'));
  const pfad = join(ordner, 'alt.sqlite');
  const alt = new DatabaseSync(pfad);
  alt.exec("CREATE TABLE anlagen (id TEXT PRIMARY KEY, name TEXT NOT NULL); INSERT INTO anlagen VALUES ('ALT1', 'Alte Anlage');");
  alt.close();
  const { kind, url, ausgabe } = await starte(pfad);
  try {
    assert.match(ausgabe, /älteren Version.*neu angelegt/);
    const anlagen = (await (await fetch(`${url}/api/anlagen`)).json()) as { id: string }[];
    assert.deepEqual(anlagen.map((a) => a.id).sort(), ['FOE2', 'STA4', 'SWR5']);
  } finally {
    kind.kill();
    rmSync(ordner, { recursive: true, force: true });
  }
});
