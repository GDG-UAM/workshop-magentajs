// Generadores “sin modelo”: escalas, arpegios y utilidades
import { WORKSHOP } from '../config/constants.js'; // QPM/SPQ del taller

const DEFAULT_QPM = WORKSHOP?.QPM ?? 120;
const DEFAULT_SPQ = WORKSHOP?.SPQ ?? 4;

// ----------------- Helpers de tiempo -----------------
const beatsToSeconds = (beats, qpm) => (60 / qpm) * beats;
const secondsToBeats = (sec, qpm) => (qpm / 60) * sec;
const beatsToSteps  = (beats, spq) => Math.round(beats * spq);

// Normaliza duración de cada nota a SEGUNDOS
function normalizeDurSeconds({ dur, durBeats, qpm }) {
  if (typeof durBeats === 'number') return beatsToSeconds(durBeats, qpm);
  if (typeof dur === 'number')     return dur;
  return 0.5;
}

// Añade cuantización + mínimos de metadatos a una NS que ya está en segundos
function enrichWithQuant(ns, { qpm = DEFAULT_QPM, spq = DEFAULT_SPQ } = {}) {
  const out = JSON.parse(JSON.stringify(ns || { notes: [] }));
  out.notes = Array.isArray(out.notes) ? out.notes : [];
  out.tempos = [{ time: 0, qpm }];
  out.quantizationInfo = { stepsPerQuarter: spq };

  let maxEndTime = 0;
  let maxStep    = 0;

  for (const n of out.notes) {
    const startBeats = secondsToBeats(n.startTime ?? 0, qpm);
    const endBeats   = secondsToBeats(n.endTime   ?? 0, qpm);
    const qs = beatsToSteps(startBeats, spq);
    const qe = beatsToSteps(endBeats,   spq);
    n.quantizedStartStep = qs;
    n.quantizedEndStep   = qe;
    if (n.endTime > maxEndTime) maxEndTime = n.endTime;
    if (qe > maxStep) maxStep = qe;
  }

  // Totales mínimos para el visualizador/reproductor
  if (!(out.totalTime > 0)) out.totalTime = maxEndTime;
  if (!(out.totalQuantizedSteps > 0)) out.totalQuantizedSteps = maxStep || (out.totalTime > 0 ? beatsToSteps(secondsToBeats(out.totalTime, qpm), spq) : 0);

  // Si sigue sin nada (caso extremo), mete un mínimo
  if (!(out.totalTime > 0) && !(out.totalQuantizedSteps > 0)) {
    out.totalTime = 0.001;
    out.totalQuantizedSteps = 1;
  }
  return out;
}

/* ========================================================================== */
/*                                   Makers                                   */
/* ========================================================================== */

// 1) Escala aritmética simple (saltos fijos en semitonos)
export function makeScale({
  tonic = 60,
  length = 16,
  step = 2,
  dur,
  durBeats,
  velocity = 96,
  program = 0,
  qpm = DEFAULT_QPM,
  spq = DEFAULT_SPQ
} = {}) {
  const noteDur = normalizeDurSeconds({ dur, durBeats, qpm });
  let t = 0;
  const notes = [];
  for (let i = 0; i < length; i++) {
    notes.push({ pitch: tonic + i * step, startTime: t, endTime: t + noteDur, velocity, program });
    t += noteDur;
  }
  return enrichWithQuant({ notes, totalTime: t, tempos: [{ time: 0, qpm }] }, { qpm, spq });
}

// 2) Arpegio de un acorde
export function makeArpeggio({
  chord = [60, 64, 67, 72],
  cycles = 4,
  dur,
  durBeats,
  velocity = 96,
  program = 0,
  qpm = DEFAULT_QPM,
  spq = DEFAULT_SPQ
} = {}) {
  const noteDur = normalizeDurSeconds({ dur, durBeats, qpm });
  let t = 0;
  const notes = [];
  for (let c = 0; c < cycles; c++) {
    for (const p of chord) {
      notes.push({ pitch: p, startTime: t, endTime: t + noteDur, velocity, program });
      t += noteDur;
    }
  }
  return enrichWithQuant({ notes, totalTime: t, tempos: [{ time: 0, qpm }] }, { qpm, spq });
}

// 3) Escala mayor REAL (2-2-1-2-2-2-1) por octavas
export function makeMajorScale({
  tonic = 60,
  octaves = 1,
  dur,
  durBeats = 0.25,
  velocity = 96,
  program = 0,
  qpm = DEFAULT_QPM,
  spq = DEFAULT_SPQ
} = {}) {
  const MAJOR = [2, 2, 1, 2, 2, 2, 1];
  const noteDur = normalizeDurSeconds({ dur, durBeats, qpm });

  let t = 0;
  let pitch = tonic;
  const notes = [];
  notes.push({ pitch, startTime: t, endTime: t + noteDur, velocity, program });
  t += noteDur;

  for (let o = 0; o < octaves; o++) {
    for (const inc of MAJOR) {
      pitch += inc;
      notes.push({ pitch, startTime: t, endTime: t + noteDur, velocity, program });
      t += noteDur;
    }
  }
  return enrichWithQuant({ notes, totalTime: t, tempos: [{ time: 0, qpm }] }, { qpm, spq });
}

// 4) Melodía secuencial (pitches o eventos)
export function makeMelody({
  pitches = [],          // number[] o { pitch, durBeats?, dur?, velocity?, program? }[]
  durBeats = 0.25,
  qpm = DEFAULT_QPM,
  spq = DEFAULT_SPQ,
  defaultVelocity = 96,
  defaultProgram = 0
} = {}) {
  let t = 0;
  const notes = [];

  for (const ev of pitches) {
    const isNumber = typeof ev === 'number';
    const pitch = isNumber ? ev : ev.pitch;
    if (typeof pitch !== 'number') continue;

    const velocity = isNumber ? defaultVelocity : (ev.velocity ?? defaultVelocity);
    const program  = isNumber ? defaultProgram  : (ev.program  ?? defaultProgram);
    const durSec   = isNumber
      ? beatsToSeconds(durBeats, qpm)
      : normalizeDurSeconds({ dur: ev.dur, durBeats: ev.durBeats ?? durBeats, qpm });

    notes.push({ pitch, startTime: t, endTime: t + durSec, velocity, program });
    t += durSec;
  }

  return enrichWithQuant({ notes, totalTime: t, tempos: [{ time: 0, qpm }] }, { qpm, spq });
}

// 5) Secuencia absoluta (eventos con start/dur o start/end en beats/segundos)
export function makeAbsoluteSequence({
  events = [],           // { pitch, startBeats?, durBeats?, endBeats?, startSec?, dur?, endSec?, velocity?, program? }[]
  qpm = DEFAULT_QPM,
  spq = DEFAULT_SPQ,
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

    let startTime, endTime;
    if (typeof e.startSec === 'number') {
      startTime = e.startSec;
      endTime = (typeof e.endSec === 'number')
        ? e.endSec
        : startTime + (typeof e.dur === 'number' ? e.dur : beatsToSeconds(e.durBeats ?? defaultDurBeats, qpm));
    } else if (typeof e.startBeats === 'number') {
      startTime = beatsToSeconds(e.startBeats, qpm);
      endTime = (typeof e.endBeats === 'number')
        ? beatsToSeconds(e.endBeats, qpm)
        : startTime + (typeof e.dur === 'number' ? e.dur : beatsToSeconds(e.durBeats ?? defaultDurBeats, qpm));
    } else {
      continue; // evento inválido
    }
    if (!(endTime > startTime)) continue;

    notes.push({ pitch, startTime, endTime, velocity, program });
  }

  const totalTime = notes.reduce((mx, n) => Math.max(mx, n.endTime || 0), 0);
  notes.sort((a, b) => a.startTime - b.startTime);

  return enrichWithQuant({ notes, totalTime, tempos: [{ time: 0, qpm }] }, { qpm, spq });
}
