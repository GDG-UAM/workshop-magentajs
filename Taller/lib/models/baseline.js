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


/* -------------------------------------------------------------------------- */
/*                  NUEVAS UTILIDADES PARA NOTAS "A MEDIDA"                   */
/* -------------------------------------------------------------------------- */

/**
 * 1) makeMelody — Secuencial
 * Recibe una lista de pitches (números) o de objetos { pitch, durBeats?, dur?, velocity?, program? }
 * y los coloca uno detrás de otro, acumulando el tiempo.
 *
 * Ejemplos:
 *  - makeMelody({ pitches: [60, 62, 64, 65], durBeats: 0.25 })
 *  - makeMelody({
 *      pitches: [
 *        { pitch: 60, durBeats: 0.5 },
 *        { pitch: 62, durBeats: 0.25, velocity: 110 },
 *        { pitch: 64, dur: 0.2 } // en segundos
 *      ]
 *    })
 */
export function makeMelody({
  pitches = [],        // number[] o Array<{pitch, durBeats?, dur?, velocity?, program?}>
  durBeats = 0.25,     // duración por defecto (en beats) si el evento no la especifica
  qpm = DEFAULT_QPM,
  defaultVelocity = 96,
  defaultProgram = 0
} = {}) {
  let t = 0;
  const notes = [];

  for (const ev of pitches) {
    const isNumber = typeof ev === 'number';
    //  Si es número, lo usa directamente; si es objeto, toma la propiedad pitch
    const pitch = isNumber ? ev : ev.pitch;
    // Si no hay pitch válido, salta al siguiente elemento.
    if (typeof pitch !== 'number') continue;

    const velocity = isNumber ? defaultVelocity : (ev.velocity ?? defaultVelocity);
    const program  = isNumber ? defaultProgram  : (ev.program  ?? defaultProgram);
    const durSec   = isNumber
      ? beatsToSeconds(durBeats, qpm)
      : normalizeDurSeconds({ dur: ev.dur, durBeats: ev.durBeats ?? durBeats, qpm });

    notes.push({ pitch, startTime: t, endTime: t + durSec, velocity, program });
    t += durSec;
  }

  return { notes, totalTime: t, tempos: [{ time: 0, qpm }] };
}

/**
 * 2) makeAbsoluteSequence — Cronológico (start/dur o start/end exactos)
 * Recibe eventos con tiempos absolutos en beats o en segundos.
 * Precedencia: si hay tiempos en segundos, se usan; si no, se usan los de beats.
 *
 * Evento mínimo: { pitch, startBeats, durBeats }  (o startSec/dur)
 * Alternativa:   { pitch, startBeats, endBeats }  (o startSec/endSec)
 *
 * Ejemplo:
 *  makeAbsoluteSequence({
 *    events: [
 *      { pitch: 60, startBeats: 0,   durBeats: 1   }, // negra
 *      { pitch: 64, startBeats: 1,   durBeats: 0.5 }, // corchea
 *      { pitch: 67, startBeats: 1.5, durBeats: 0.5 }
 *    ],
 *    qpm: WORKSHOP.QPM
 *  })
 */
export function makeAbsoluteSequence({
  events = [],         // Array<{ pitch, startBeats?, durBeats?, endBeats?, startSec?, dur?, endSec?, velocity?, program? }>
  qpm = DEFAULT_QPM,
  defaultVelocity = 96,
  defaultProgram = 0,
  defaultDurBeats = 0.25
} = {}) {
  const notes = [];

  for (const e of events) {
    const pitch = e.pitch;
    if (typeof pitch !== 'number') continue;

    const velocity = e.velocity ?? defaultVelocity;
    const program  = e.program  ?? defaultProgram;

    // Preferimos valores en segundos si están presentes
    let startTime, endTime;

    if (typeof e.startSec === 'number') {
      startTime = e.startSec;
      if (typeof e.endSec === 'number') {
        endTime = e.endSec;
      } else {
        const durSec = typeof e.dur === 'number'
          ? e.dur
          : beatsToSeconds(e.durBeats ?? defaultDurBeats, qpm);
        endTime = startTime + durSec;
      }
    } else if (typeof e.startBeats === 'number') {
      startTime = beatsToSeconds(e.startBeats, qpm);
      if (typeof e.endBeats === 'number') {
        endTime = beatsToSeconds(e.endBeats, qpm);
      } else {
        const durSec = typeof e.dur === 'number'
          ? e.dur
          : beatsToSeconds(e.durBeats ?? defaultDurBeats, qpm);
        endTime = startTime + durSec;
      }
    } else {
      // Si no hay start, lo ignoramos (no sabemos dónde colocarlo)
      continue;
    }

    // Sanitiza
    if (!(endTime > startTime)) continue;

    notes.push({ pitch, startTime, endTime, velocity, program });
  }

  // totalTime = fin máximo
  const totalTime = notes.reduce((mx, n) => Math.max(mx, n.endTime || 0), 0);

  // Ordena por tiempo de inicio (opcional pero ayuda al visualizador)
  notes.sort((a, b) => a.startTime - b.startTime);

  return { notes, totalTime, tempos: [{ time: 0, qpm }] };
}