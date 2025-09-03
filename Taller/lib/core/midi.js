// Helpers de carga/descarga .mid ⇄ NoteSequence usando Magenta.js
// Requiere que @magenta/music esté cargado (CDN o bundler)

function getMM() {
  if (typeof window !== 'undefined' && window.mm) return window.mm;
  throw new Error('[midi] Magenta no está disponible. Incluye @magenta/music.');
}

// Normaliza una NoteSequence para exportar a MIDI (tempo, velocity, program, totalTime)
function prepareForExport(ns, { qpm } = {}) {
  const mm = getMM();
  let copy = mm.sequences.clone(ns);
  const fallbackQpm = qpm ?? (copy.tempos?.[0]?.qpm ?? 120);

  // Si la secuencia está cuantizada, la convertimos a tiempos reales usando el QPM final
  const spq = copy.quantizationInfo?.stepsPerQuarter;
  if (Number.isInteger(spq) && spq > 0) {
    copy = mm.sequences.unquantizeSequence(copy, fallbackQpm);
    // Eliminamos quantizationInfo para exportar un MIDI de tiempos reales
    if (copy.quantizationInfo) delete copy.quantizationInfo;
  }

  // Asegurar tempo explícito al inicio
  if (!copy.tempos || copy.tempos.length === 0) {
    copy.tempos = [{ time: 0, qpm: fallbackQpm }];
  } else {
    copy.tempos[0] = { time: 0, qpm: fallbackQpm };
  }

  // Asegurar notas con velocity/program y endTime válidos
  copy.notes = (copy.notes || []).map(n => {
    let vel = (typeof n.velocity === 'number' ? n.velocity : 96);
    // Si la velocidad parece estar en 0..1, escalar a 1..127
    if (vel > 0 && vel <= 1) vel = Math.round(vel * 127);
    vel = Math.min(127, Math.max(1, Math.round(vel)));

    const start = Number.isFinite(n.startTime) ? n.startTime : 0;
    const end = Number.isFinite(n.endTime) ? n.endTime : (start + 0.25);
    let pitch = Number.isFinite(n.pitch) ? Math.round(n.pitch) : 60;
    if (pitch < 0) pitch = 0; if (pitch > 127) pitch = 127;

    return {
      ...n,
      pitch,
      velocity: vel,
      program: (typeof n.program === 'number' ? n.program : 0),
      instrument: (typeof n.instrument === 'number' ? n.instrument : 0),
      startTime: start,
      endTime: end,
    };
  });
  // Eliminar notas de duración nula/negativa
  copy.notes = copy.notes.filter(n => (n.endTime - n.startTime) > 1e-6);
  // Ordenar por tiempo
  copy.notes.sort((a, b) => a.startTime - b.startTime || a.pitch - b.pitch);
  copy.totalTime = copy.notes.reduce((mx, n) => Math.max(mx, n.endTime || 0), copy.totalTime || 0);
  // ticksPerQuarter estándar (compatibilidad amplia)
  if (typeof copy.ticksPerQuarter !== 'number') copy.ticksPerQuarter = 480;
  if (!copy.notes.length) {
    console.warn('[midi] Exportando MIDI sin notas. El archivo no sonará.');
  }
  // Debug mínimo
  try {
    const n0 = copy.notes[0];
    console.info('[midi] Export:', {
      qpm: copy.tempos?.[0]?.qpm,
      ticksPerQuarter: copy.ticksPerQuarter,
      notes: copy.notes.length,
      firstNote: n0 ? { pitch: n0.pitch, start: n0.startTime, end: n0.endTime, vel: n0.velocity, prog: n0.program, drum: !!n0.isDrum } : null,
    });
  } catch {}
  return copy;
}

// Convierte NoteSequence → Blob MIDI (para descargar)
export function sequenceToMidiBlob(ns, { qpm } = {}) {
  const mm = getMM();
  const prepared = prepareForExport(ns, { qpm });
  const bytes = mm.sequenceProtoToMidi(prepared);
  return new Blob([bytes], { type: 'audio/midi' });
}

export function downloadMidi(ns, filename = 'track.mid', qpm) {
  const blob = sequenceToMidiBlob(ns, { qpm });
  const a = document.createElement('a');
  const url = URL.createObjectURL(blob);
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  // Limpieza tras dar tiempo al navegador a iniciar la descarga
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 2000);
}

// Convierte File/ArrayBuffer → NoteSequence
export async function fileToSequence(file) {
  const mm = getMM();
  const buf = await file.arrayBuffer();
  return mm.midiToSequenceProto(new Uint8Array(buf));
}
