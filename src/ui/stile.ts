// Klassen für Knöpfe und Verweise, überall gleich: klare Flächen, mindestens 44 px hoch (AK-21), dezente Ränder.

export const KNOPF_HAUPT =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-blue-700 bg-blue-700 px-4 py-2 text-base font-semibold text-white shadow-sm hover:bg-blue-800 disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-200 disabled:text-slate-700 disabled:shadow-none';
export const KNOPF_NEBEN =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-base font-semibold text-slate-900 shadow-sm hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-600 disabled:shadow-none';
/** Gewählter Schalter: eigene vollständige Klassen, weil Tailwind bei zwei Hintergründen nicht nach der Reihenfolge im Attribut entscheidet. */
export const KNOPF_GEWAEHLT =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-blue-700 bg-blue-50 px-4 py-2 text-base font-semibold text-blue-950 shadow-sm ring-1 ring-blue-700 hover:bg-blue-100';
export const VERWEIS = 'font-semibold text-blue-800 underline decoration-blue-300 underline-offset-4 hover:text-blue-950 hover:decoration-blue-800';
