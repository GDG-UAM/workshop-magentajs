// Helpers de carga/descarga .mid ⇄ NoteSequence usando Magenta.js
// Requiere que @magenta/music esté cargado (CDN o bundler)

function getMM() {
  if (typeof window !== 'undefined' && window.mm) return window.mm;
  throw new Error('[midi] Magenta no está disponible. Incluye @magenta/music.');
}

// Convierte NoteSequence → Blob MIDI (para descargar)
export function sequenceToMidiBlob(ns) {
  const mm = getMM();
  // API común en Magenta.js
  const bytes = mm.sequenceProtoToMidi(ns);
  return new Blob([bytes], { type: 'audio/midi' });
}

export function downloadMidi(ns, filename = 'track.mid') {
  const blob = sequenceToMidiBlob(ns);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

// Convierte File/ArrayBuffer → NoteSequence
export async function fileToSequence(file) {
  const mm = getMM();
  const buf = await file.arrayBuffer();
  return mm.midiToSequenceProto(new Uint8Array(buf));
}
