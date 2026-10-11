// Liest den Modus der Spracherkennung. Der API-Schlüssel kommt nur aus der
// Umgebung bzw. .env (LLM_API_KEY), nie aus Code oder Datenbank (AK-34).

import { mockModell, type SprachModell } from './mock.ts';

export type KiModus = 'mock' | 'echt';

export interface KiKonfiguration {
  modus: KiModus;
  schluesselVorhanden: boolean;
}

export function leseKonfiguration(env: NodeJS.ProcessEnv = process.env): KiKonfiguration {
  const modus: KiModus = env.LLM_MODUS === 'echt' ? 'echt' : 'mock';
  return { modus, schluesselVorhanden: Boolean(env.LLM_API_KEY) };
}

/** Wählt das Sprachmodell. Im MVP ist nur der Mock angebunden. */
export function waehleModell(konfiguration: KiKonfiguration): SprachModell {
  if (konfiguration.modus === 'mock') return mockModell;
  if (!konfiguration.schluesselVorhanden) {
    throw new Error('LLM_MODUS=echt braucht LLM_API_KEY in .env.');
  }
  throw new Error('Der echte KI-Modus ist im MVP nicht angebunden. Bitte LLM_MODUS=mock verwenden.');
}
