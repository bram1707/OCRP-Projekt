// Klassen für Knöpfe und Verweise, überall gleich: große Flächen, deutliche Ränder (AK-21).

export const KNOPF_HAUPT =
  'inline-flex min-h-12 items-center justify-center rounded-lg border-2 border-blue-800 bg-blue-800 px-5 py-2 text-lg font-semibold text-white hover:bg-blue-900 disabled:cursor-not-allowed disabled:border-slate-500 disabled:bg-slate-500';
export const KNOPF_NEBEN =
  'inline-flex min-h-12 items-center justify-center rounded-lg border-2 border-slate-700 bg-white px-5 py-2 text-lg font-semibold text-slate-900 hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-600';
/** Gewählter Schalter: eigene vollständige Klassen, weil Tailwind bei zwei Hintergründen nicht nach der Reihenfolge im Attribut entscheidet. */
export const KNOPF_GEWAEHLT =
  'inline-flex min-h-12 items-center justify-center rounded-lg border-2 border-blue-800 bg-blue-50 px-5 py-2 text-lg font-semibold text-blue-950 hover:bg-blue-100';
export const VERWEIS = 'font-semibold text-blue-800 underline underline-offset-4 hover:text-blue-950';
