// Generadores “sin modelo”: escalas, arpegios y escalas musicales reales

import { WORKSHOP } from '../config/constants.js'; // ← QPM del taller

const DEFAULT_QPM = WORKSHOP?.QPM ?? 120;

// Helpers
const beatsToSeconds = (beats, qpm) => (60 / qpm) * beats;

/**
 * Normaliza la duración de cada nota a segundos.
 * - Si pasas durBeats (en negras): usa QPM para convertir a segundos.
 * - Si pasas dur (segundos): se usa tal cual.
 * - Si no pasas nada: 0.5 s por nota (compatibilidad con el código antiguo).
 */
function normalizeDurSeconds({ dur, durBeats, qpm }) {
  if (typeof durBeats === 'number') return beatsToSeconds(durBeats, qpm);
  if (typeof dur === 'number') return dur;
  return 0.5;
}

/**
 * Escala aritmética simple (no “mayor real”):
 * Sube 'length' notas con saltos fijos 'step' (en semitonos).
 * Útil como baseline muy controlable.
 */
export function makeScale({
  tonic = 60,        // C4
  length = 16,       // nº de notas
  step = 2,          // semitonos por paso (2 = tono)
  dur,               // segundos (opcional)
  durBeats,          // beats (opcional) — p.ej. 0.25 = semicorchea
  velocity = 96,
  program = 0,
  qpm = DEFAULT_QPM
} = {}) {
  const noteDur = normalizeDurSeconds({ dur, durBeats, qpm });
  let t = 0;
  const notes = [];
  for (let i = 0; i < length; i++) {
    notes.push({
      pitch: tonic + i * step,
      startTime: t,
      endTime: t + noteDur,
      velocity,
      program
    });
    t += noteDur;
  }
  return { notes, totalTime: t, tempos: [{ time: 0, qpm }] };
}

/**
 * Arpegio: recorre el acorde en orden y repítelo 'cycles' veces.
 */
export function makeArpeggio({
  chord = [60, 64, 67, 72], // C-E-G-C
  cycles = 4,
  dur,                      // segundos (opcional)
  durBeats,                 // beats (opcional)
  velocity = 96,
  program = 0,
  qpm = DEFAULT_QPM
} = {}) {
  const noteDur = normalizeDurSeconds({ dur, durBeats, qpm });
  let t = 0;
  const notes = [];
  for (let c = 0; c < cycles; c++) {
    for (const p of chord) {
      notes.push({
        pitch: p,
        startTime: t,
        endTime: t + noteDur,
        velocity,
        program
      });
      t += noteDur;
    }
  }
  return { notes, totalTime: t, tempos: [{ time: 0, qpm }] };
}

/**
 * Escala mayor REAL (patrón: 2-2-1-2-2-2-1), por 'octaves' octavas.
 * - Empieza en 'tonic' e incluye el último grado (tónica superior).
 * - Por defecto durBeats=0.25 → semicorchea, ligada a QPM.
 */
export function makeMajorScale({
  tonic = 60,        // C4
  octaves = 1,       // nº de octavas a cubrir
  dur,               // segundos (opcional)
  durBeats = 0.25,   // beats (opcional); por defecto semicorchea
  velocity = 96,
  program = 0,
  qpm = DEFAULT_QPM
} = {}) {
  const MAJOR_PATTERN = [2, 2, 1, 2, 2, 2, 1]; // T T S T T T S
  const noteDur = normalizeDurSeconds({ dur, durBeats, qpm });

  let t = 0;
  let pitch = tonic;
  const notes = [];

  // Primera nota (tónica)
  notes.push({ pitch, startTime: t, endTime: t + noteDur, velocity, program });
  t += noteDur;

  // Recorre el patrón 'octaves' veces (incluye la tónica superior al final)
  for (let o = 0; o < octaves; o++) {
    for (const inc of MAJOR_PATTERN) {
      pitch += inc;
      notes.push({ pitch, startTime: t, endTime: t + noteDur, velocity, program });
      t += noteDur;
    }
  }

  return { notes, totalTime: t, tempos: [{ time: 0, qpm }] };
}
