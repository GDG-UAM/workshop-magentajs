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

// LÍNEA CORRECTA
export function merge(seqs) {
  if (!seqs || !seqs.length) return { notes: [], totalTime: 0 };

  // Combina todas las notas de todas las secuencias en una sola lista.
  const allNotes = [].concat(...seqs.map(s => s.notes));

  // Calcula el tiempo total como el máximo "endTime" de todas las notas.
  const totalTime = allNotes.reduce((max, note) => Math.max(max, note.endTime), 0);

  // Devuelve una nueva secuencia que contiene todas las notas.
  // Copiamos la información de tempo de la primera secuencia como referencia.
  return {
    notes: allNotes,
    totalTime: totalTime,
    tempos: seqs[0].tempos,
    quantizationInfo: seqs[0].quantizationInfo
  };
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
  // 1. Filtramos para quedarnos solo con las pistas activas
  const activeTracks = state.tracks.filter(t => t.isActive);
  
  // 2. Aplicamos el instrumento y programa a cada pista activa
  const arranged = activeTracks.map(t => setInstrument(t.ns, t.program ?? 0, t.isDrum ?? false));
  
  // 3. Unimos solo las pistas que han sido arregladas
  return merge(arranged);
}