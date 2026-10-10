// Start des Servers über npm run server (P2: die Startmeldung nennt die echte Adresse).

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { WURZEL } from './hilfen.ts';

test('P2: mit PORT=0 nennt die Startmeldung den tatsächlich belegten Port', async () => {
  const ordner = mkdtempSync(join(tmpdir(), 'pruefsystem-start-'));
  const kind = spawn(
    process.execPath,
    ['--disable-warning=ExperimentalWarning', join(WURZEL, 'src', 'server', 'start.ts')],
    { env: { ...process.env, PORT: '0', DB_PFAD: join(ordner, 'test.sqlite'), LLM_MODUS: 'mock' }, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  try {
    const zeile = await new Promise<string>((fertig, fehler) => {
      let puffer = '';
      kind.stdout.on('data', (stueck: Buffer) => {
        puffer += stueck.toString('utf8');
        const treffer = /http:\/\/127\.0\.0\.1:\d+/.exec(puffer);
        if (treffer) fertig(treffer[0]);
      });
      kind.on('exit', (code) => fehler(new Error(`Server beendet mit ${code}: ${puffer}`)));
      setTimeout(() => fehler(new Error(`keine Startmeldung: ${puffer}`)), 10_000);
    });
    const port = Number(zeile.split(':').at(-1));
    assert.ok(port > 0, zeile);
    const antwort = await fetch(`${zeile}/api/anlagen`);
    assert.equal(antwort.status, 200);
  } finally {
    kind.kill();
    rmSync(ordner, { recursive: true, force: true });
  }
});
