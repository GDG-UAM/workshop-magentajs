// Herramientas para normalizar y concatenar NoteSequence en una cuadrícula común.

function requireMM(mm) {
  const m = mm || (typeof window !== 'undefined' ? window.mm : null);
  if (!m) throw new Error('[concat] Magenta (mm) no está disponible.');
  return m;
}

/**
 * Asegura que la secuencia:
 * - tenga tempo fijo (qpm) en t=0
 * - esté cuantizada con stepsPerQuarter = spq
 * Si ya está cuantizada con otro spq, la “descuantiza” y vuelve a cuantizar.
 */
export function normalizeToGrid(ns, { qpm, spq, mm } = {}) {
  const m = requireMM(mm); // import
  const copy = m.sequences.clone(ns);

  // Fijar tempo único
  copy.tempos = [{ time: 0, qpm }];

  const currentSpq = copy.quantizationInfo?.stepsPerQuarter;

  // Caso 1: ya está cuantizada con el spq correcto
  if (currentSpq === spq) return copy;

  // Caso 2: re-cuantizar a la cuadrícula del taller
  if (currentSpq && currentSpq !== spq) {
    // Descuantizar usando el qpm conocido y volver a cuantizar
    const unq = m.sequences.unquantizeSequence(copy, qpm);
    return m.sequences.quantizeNoteSequence(unq, spq);
  }

  // Caso 3: no estaba cuantizada → cuantizar ahora
  return m.sequences.quantizeNoteSequence(copy, spq);
}

/**
 * Concatena varias NoteSequence garantizando que todas compartan el mismo QPM/SPQ.
 * Devuelve una única NoteSequence cuantizada a {spq} con tempo {qpm}.
 */
export function concatOnGrid(sequences, { qpm, spq, mm } = {}) {
  const m = requireMM(mm);
  // Check de tipo y longitud
  if (!Array.isArray(sequences) || sequences.length === 0) {
    throw new Error('[concat] Debes pasar un array con al menos una NoteSequence.');
  }
  const norm = sequences.map(ns => normalizeToGrid(ns, { qpm, spq, mm: m }));
  const out = m.sequences.concatenate(norm); // Requiere mismo stepsPerQuarter
  out.tempos = [{ time: 0, qpm }];           // Asegurar tempo único
  return out;
}