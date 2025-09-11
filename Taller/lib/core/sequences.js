// Utilidades de edición liviana de NoteSequence (trim/merge/instrument/quantize)

function getMM() {
  if (typeof window !== 'undefined' && window.mm) return window.mm;
  throw new Error('[sequences] Magenta no está disponible.');
}

// --- NUEVO: asegura totalTime y totalQuantizedSteps ---
function ensureMeta(ns) {
  // Clonado ligero para no mutar la entrada
  const out = (window.mm?.sequences?.clone)
    ? window.mm.sequences.clone(ns)
    : JSON.parse(JSON.stringify(ns));

  const notes = out.notes || [];

  // Asegura totalTime en segundos
  if (out.totalTime == null || out.totalTime === 0) {
    const maxEnd = notes.reduce((mx, n) => Math.max(mx, n.endTime || 0), 0);
    out.totalTime = Math.max(out.totalTime || 0, maxEnd);
  }

  // Si está cuantizada, asegura totalQuantizedSteps
  const spq = out.quantizationInfo?.stepsPerQuarter;
  if (spq && (out.totalQuantizedSteps == null || out.totalQuantizedSteps === 0)) {
    const maxQ = notes.reduce((mx, n) => Math.max(mx, n.quantizedEndStep ?? 0), 0);
    if (maxQ > 0) out.totalQuantizedSteps = maxQ;
  }

  return out;
}

// Recorta por segundos [startSec, endSec)
export function trim(ns, startSec, endSec) {
  const mm = getMM();
  return ensureMeta(mm.sequences.trim(ns, startSec, endSec));
}

// Asigna instrumento/program y modo drum a todas las notas
export function setInstrument(ns, program = 0, isDrum = false) {
  const mm = getMM();
  const out = mm.sequences.clone(ns);
  (out.notes || []).forEach(n => { n.program = program; n.isDrum = isDrum; });
  return ensureMeta(out);
}

// Une en paralelo (todas las notas a la vez)
export function merge(seqs) {
  if (!seqs || !seqs.length) return { notes: [], totalTime: 0 };

  // Copiamos notas (sin mutar originales)
  const allNotes = [];
  for (const s of seqs) {
    if (s?.notes) allNotes.push(...s.notes.map(n => ({ ...n })));
  }

  // Reusamos tempo/spq de la primera que lo tenga
  const firstWithTempo = seqs.find(s => s?.tempos?.length);
  const firstWithSpq   = seqs.find(s => s?.quantizationInfo?.stepsPerQuarter);

  const out = {
    notes: allNotes,
    tempos: firstWithTempo?.tempos || [{ time: 0, qpm: 120 }],
    ...(firstWithSpq
      ? { quantizationInfo: { stepsPerQuarter: firstWithSpq.quantizationInfo.stepsPerQuarter } }
      : {})
  };

  return ensureMeta(out);
}

// Concatenar secuencias en el tiempo (una detrás de otra) asegurando misma cuadrícula
export function concatenate(seqs, { qpm, spq } = {}) {
  const mm = getMM();
  if (!Array.isArray(seqs) || seqs.length === 0) return { notes: [], totalTime: 0 };

  // Determinar QPM/SPQ de referencia
  const refQpm = qpm ?? (seqs.find(s => s?.tempos?.length)?.tempos?.[0]?.qpm ?? 120);
  let refSpq = spq ?? null;
  if (refSpq == null) {
    for (const s of seqs) {
      const steps = s?.quantizationInfo?.stepsPerQuarter;
      if (Number.isInteger(steps) && steps > 0) { refSpq = steps; break; }
    }
  }

  // Normalizar a la cuadrícula objetivo
  const normalize = (ns) => {
    const copy = mm.sequences.clone(ns);
    copy.tempos = [{ time: 0, qpm: refQpm }];

    const currentSpq = copy.quantizationInfo?.stepsPerQuarter ?? null;
    if (refSpq) {
      if (currentSpq === refSpq) return copy;
      if (currentSpq && currentSpq !== refSpq) {
        const unq = mm.sequences.unquantizeSequence(copy, refQpm);
        return mm.sequences.quantizeNoteSequence(unq, refSpq);
      }
      return mm.sequences.quantizeNoteSequence(copy, refSpq);
    }
    if (copy.quantizationInfo) delete copy.quantizationInfo;
    return copy;
  };

  const normalized = seqs.map(normalize);
  const out = mm.sequences.concatenate(normalized);
  out.tempos = [{ time: 0, qpm: refQpm }];
  if (refSpq) out.quantizationInfo = { stepsPerQuarter: refSpq };
  else delete out.quantizationInfo;

  return ensureMeta(out);
}

// Cuantiza una secuencia a stepsPerQuarter
export function quantize(ns, stepsPerQuarter = 4) {
  const mm = getMM();
  const q = mm.sequences.quantizeNoteSequence(ns, stepsPerQuarter);
  return ensureMeta(q);
}

/* ---------- Helper para la UI genérica ----------
   Recoge state.tracks (cada uno con ns, program, isDrum) y devuelve un merged.
*/
export function mergeFromState(state) {
  const activeTracks = state.tracks.filter(t => t.isActive);
  const arranged = activeTracks.map(t =>
    t.preserveInstruments
      ? ensureMeta(t.ns)
      : setInstrument(t.ns, t.program ?? 0, t.isDrum ?? false)
  );
  return ensureMeta(merge(arranged));
}
