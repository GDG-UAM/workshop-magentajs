// En: Taller/lib/core/trackio.js

// Pequeño helper para descargar blobs
function downloadBlob(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 0);
}

function sanitizeFileName(s) {
  return String(s || 'track')
    .replace(/[\/\\?%*:|"<>]/g, '-')
    .replace(/\s+/g, '_')
    .toLowerCase();
}

/**
 * Empaqueta una pista del taller en un objeto portable.
 * Espera un objeto estilo state.tracks[i]: { ns, name, program, isDrum, preserveInstruments }
 */
export function serializeTrack(track, { appMeta } = {}) {
  const ns = track?.ns ?? {};
  const qpm = ns?.tempos?.[0]?.qpm ?? 120;
  const spq = ns?.quantizationInfo?.stepsPerQuarter ?? null;

  return {
    type: 'magtrack',
    version: 1,
    app: (appMeta?.name || 'MagentaJS-Workshop'),
    savedAt: new Date().toISOString(),
    meta: {
      name: track?.name ?? 'Track',
      program: track?.program ?? 0,
      isDrum: !!track?.isDrum,
      preserveInstruments: !!track?.preserveInstruments,
      qpm,
      spq
    },
    ns // NoteSequence tal cual (ya normalizado por la app)
  };
}

/** Descarga una pista como .magtrack (JSON) */
export function downloadTrack(track, filename) {
  const payload = serializeTrack(track);
  const file = filename || `${sanitizeFileName(payload.meta.name || 'track')}.magtrack`;
  const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
  downloadBlob(blob, file);
}

/** Lee un archivo .magtrack y devuelve { ns, meta } listo para loadTrack(...) */
export async function fileToTrack(file) {
  const text = await file.text();
  let obj;
  try {
    obj = JSON.parse(text);
  } catch {
    throw new Error('[trackio] El archivo no es JSON válido.');
  }
  if (!obj || obj.type !== 'magtrack' || !obj.ns) {
    throw new Error('[trackio] Formato desconocido o faltan campos (type=magtrack, ns).');
  }
  const meta = obj.meta || {};
  return { ns: obj.ns, meta };
}
