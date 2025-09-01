// Utilidades de edición liviana de NoteSequence (trim/merge/instrument/quantize)

function getMM() {
  if (typeof window !== 'undefined' && window.mm) return window.mm;
  throw new Error('[sequences] Magenta no está disponible.');
}

// Recorta por segundos [startSec, endSec)
export function trim(ns, startSec, endSec) {
  const mm = getMM();
  return mm.sequences.trim(ns, startSec, endSec);
}

// Asigna instrumento/program y modo drum a todas las notas
export function setInstrument(ns, program = 0, isDrum = false) {
  const mm = getMM();
  const out = mm.sequences.clone(ns);
  out.notes.forEach(n => { n.program = program; n.isDrum = isDrum; });
  return out;
}

// Une varias NoteSequence “en paralelo” (multitrack)
// (realmente concatena listas de notas en un solo NS)
export function merge(seqs) {
  const mm = getMM();
  if (!seqs.length) return { notes: [], totalTime: 0 };
  const base = mm.sequences.clone(seqs[0]);
  for (let i = 1; i < seqs.length; i++) {
    mm.sequences.merge(base, seqs[i]);
  }
  // recomputa duración total
  base.totalTime = base.notes.reduce((mx, n) => Math.max(mx, n.endTime), 0);
  return base;
}

// Concatenar secuencias en el tiempo (una detrás de otra)
export function concatenate(seqs) {
  const mm = getMM();
  return mm.sequences.concatenate(seqs);
}

// Cuantiza una secuencia a stepsPerQuarter
export function quantize(ns, stepsPerQuarter = 4) {
  const mm = getMM();
  return mm.sequences.quantizeNoteSequence(ns, stepsPerQuarter);
}

/* ---------- Helper para la UI genérica ----------
   Recoge state.tracks (cada uno con ns, program, isDrum) y devuelve un merged.
*/
export function mergeFromState(state) {
  const arranged = state.tracks.map(t => setInstrument(t.ns, t.program ?? 0, t.isDrum ?? false));
  return merge(arranged);
}
