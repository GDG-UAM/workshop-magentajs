// Generadores “sin modelo”: escalas, arpegios, patrones fijos (para baseline)

export function makeScale({
  tonic = 60,          // C4
  length = 16,         // nº de notas
  step = 2,            // distancia entre notas (2 = modo mayor)
  dur = 0.5,           // segundos por nota
  velocity = 96,
  program = 0
} = {}) {
  let t = 0;
  const notes = [];
  for (let i = 0; i < length; i++) {
    notes.push({ pitch: tonic + i * step, startTime: t, endTime: t + dur, velocity, program });
    t += dur;
  }
  return { notes, totalTime: t, tempos: [{ time: 0, qpm: 120 }] };
}

export function makeArpeggio({
  chord = [60, 64, 67, 72],
  cycles = 4,
  dur = 0.4,
  velocity = 96,
  program = 0
} = {}) {
  let t = 0;
  const notes = [];
  for (let c = 0; c < cycles; c++) {
    for (const p of chord) {
      notes.push({ pitch: p, startTime: t, endTime: t + dur, velocity, program });
      t += dur;
    }
  }
  return { notes, totalTime: t, tempos: [{ time: 0, qpm: 120 }] };
}
