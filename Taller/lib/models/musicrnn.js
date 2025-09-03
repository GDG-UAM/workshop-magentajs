// File: Taller/lib/models/musicrnn.js
// ----------------------------------------------------------------------------
// MusicRNN wrapper para Magenta.js orientado a taller/competición.
// - Carga perezosa del modelo (initialize())
// - Método principal: continue() para prolongar una melodía semilla
// - Helpers: cuantizar a SPQ, monofonizar el seed, aplicar tempo/QPM,
//            y (opcional) unir seed + continuación en una sola NoteSequence.
// - Soporta tanto "mm" global (CDN) como import dinámico ESM.
//
// Uso mínimo (en una demo o ejercicio):
//   import { MusicRnnService } from '../lib/models/musicrnn.js';
//
//   const rnn = new MusicRnnService({
//     checkpointURL: 'URL_DEL_CHECKPOINT_MELODY_RNN', // p.ej. "melody_rnn"
//     stepsPerQuarter: 4,
//     qpm: 120
//   });
//   await rnn.initialize();
//   const cont = await rnn.continue(seedNs, { steps: 64, temperature: 1.1 });
//   App.loadTrack(cont, { name: 'RNN cont.', program: 0 });
//
// ----------------------------------------------------------------------------

/**
 * Obtiene el namespace de Magenta.js.
 * - Si usas CDN: window.mm está definido por <script src="https://unpkg.com/@magenta/music@1.23.1"></script>
 * - Si usas bundler/ESM: intentamos import('@magenta/music')
 */
async function getMagenta() {
  if (typeof window !== 'undefined' && window.mm) return window.mm;

  try {
    const mod = await import('@magenta/music');
    return mod;
  } catch (err) {
    const msg = [
      '[MusicRnnService] No encuentro @magenta/music.',
      'Soluciones posibles:',
      '  (A) Añade en el HTML: <script src="https://unpkg.com/@magenta/music@1.23.1"></script>',
      '  (B) Instala y usa ESM:  npm i @magenta/music  y bundler (Vite/Webpack).',
    ].join('\n');
    console.error(msg);
    throw err;
  }
}

/**
 * Opciones de inicialización.
 * @typedef {Object} MusicRnnOptions
 * @property {string} checkpointURL       URL/carpeta del checkpoint de MusicRNN (melody).
 * @property {number} [stepsPerQuarter=4] Resolución de cuadrícula (SPQ).
 * @property {number} [qpm=120]           Tempo en negras por minuto (QPM/BPM).
 * @property {string[]} [chordProgression] Progresión de acordes opcional (si el checkpoint lo admite).
 * @property {number} [defaultTemperature=1.1] Temperatura por defecto si no se pasa en continue().
 * @property {boolean} [forceMonophonic=true] Forzar monofonía (Un sonido a la vez) en la continuación.
 */

/**
 * Servicio de alto nivel para trabajar con MusicRNN.
 */
export class MusicRnnService {
  /**
   * @param {MusicRnnOptions} opts
   */
  constructor({
    checkpointURL,
    stepsPerQuarter = 4,
    qpm = 120,
    chordProgression = undefined,
    defaultTemperature = 1.1,
    forceMonophonic = true,
  } = {}) {
    if (!checkpointURL) {
      throw new Error('[MusicRnnService] Falta "checkpointURL".');
    }
    this._checkpointURL = checkpointURL;
    this._spq = stepsPerQuarter;
    this._qpm = qpm;
    this._chords = chordProgression;
    this._defaultTemp = defaultTemperature;
    this._forceMonophonic = !!forceMonophonic;

    this._mm = null;      // namespace de Magenta
    this._model = null;   // instancia de mm.MusicRNN
    this._init = null;    // promesa de initialize()
  }

  // -------------------------------
  // Ciclo de vida
  // -------------------------------

  /**
   * Carga Magenta y el checkpoint. Idempotente.
   */
  async initialize() {
    if (this._init) return this._init;

    this._init = (async () => {
      this._mm = await getMagenta();
      this._model = new this._mm.MusicRNN(this._checkpointURL);
      await this._model.initialize();
    })();

    return this._init;
  }

  /**
   * Libera recursos.
   */
  dispose() {
    if (this._model && typeof this._model.dispose === 'function') {
      this._model.dispose();
    }
    this._model = null;
    this._mm = null;
    this._init = null;
  }

  // -------------------------------
  // Helpers internos
  // -------------------------------

  /**
   * Aplica tempo/QPM explícito al NoteSequence (útil para reproducción consistente).
   * @param {Object} ns NoteSequence
   * @param {number} qpm
   * @returns {Object} copia con tempo aplicado
   */
  _withTempo(ns, qpm) {
    const copy = this._mm.sequences.clone(ns);
    copy.tempos = [{ time: 0, qpm }];
    console.log("(musicrnn.js) - Aplicando tempo a MusicRNN");
    return copy;
  }

  // Obtiene el rango de pitch del modelo (fallback razonable si no disponible)
  _getModelPitchRange() {
    const dc = this._model && (this._model.dataConverter || this._model.checkpointURL?.dataConverter);
    const min = (dc && (dc.minPitch ?? dc.args?.minPitch)) ?? 36;
    const max = (dc && (dc.maxPitch ?? dc.args?.maxPitch)) ?? 96;
    console.log("(musicrnn.js) - Rango de pitch del modelo:", min, max);
    return { min, max };
  }

  // Ajustar cada pitch al rango permitido moviendolo por octavas
  _ensurePitchRange(ns) {
    const { min, max } = this._getModelPitchRange();
    const copy = this._mm.sequences.clone(ns);

    copy.notes = copy.notes.map(n => {
      let p = n.pitch;
      while (p < min) p+= 12; // Subir octava
      while (p > max) p-=12; // Bajar octava
      return {...n, pitch: p};
    });
    return copy;
  }

  /**
   * Cuantiza la secuencia a la cuadrícula SPQ.
   * @param {Object} ns INoteSequence
   * @returns {Object} NoteSequence cuantizada
   */
  _quantize(ns) {
    try {
      return this._mm.sequences.quantizeNoteSequence(ns, this._spq);
    } catch (e) {
      console.warn('[MusicRnnService] No pude cuantizar con SPQ=', this._spq, e);
      return ns; // para no bloquear el taller
    }
  }

  /**
   * Convierte la secuencia en monofónica (descarta notas solapadas).
   * MusicRNN (melody) espera monofonía; aquí nos aseguramos de ello.
   * Estrategia simple: ordenar por startTime y descartar notas que empiecen
   * antes de que termine la nota anterior.
   * @param {Object} ns NoteSequence (se asume cuantizada)
   * @returns {Object} NoteSequence monofónica
   */
  _toMonophonic(ns) {
    const mm = this._mm;
    const copy = mm.sequences.clone(ns);
    const notes = [...copy.notes].sort((a, b) => a.startTime - b.startTime || a.pitch - b.pitch);
    const mono = [];
    let lastEnd = -Infinity;
    for (const n of notes) {
      if (n.startTime >= lastEnd) {
        mono.push({ ...n });
        lastEnd = n.endTime;
      } else {
        // solapa: la descartamos (polifonía) para mantener monofonía
      }
    }
    copy.notes = mono;
    // recomputa totalTime si procede
    copy.totalTime = mono.reduce((mx, n) => Math.max(mx, n.endTime), copy.totalTime || 0);
    return copy;
  }

  /**
   * Prepara el seed: cuantiza → monofoniza → aplica tempo (opcional).
   * @param {Object} ns INoteSequence
   * @param {number} qpm QPM a aplicar en seed
   * @returns {Object} NoteSequence limpio para el modelo
   */
  _prepSeed(ns, qpm) {
    const q = this._quantize(ns);
    const base = this._forceMonophonic ? this._toMonophonic(q) : q;
    const inRange = this._ensurePitchRange(base);
    return this._withTempo(inRange, qpm);
  }

  /**
   * Crea una NOTESEQUENCE semilla a partir de una lista de pitches MIDI.
   * Cada pitch dura "stepDur" segundos (por defecto, 1/2 segundo = negra a 120).
   * Útil para ejercicios rápidos sin cargar MIDI.
   * @param {number[]} pitches  e.g., [60, 62, 64, 65, 67]
   * @param {number} stepDur    segundos por nota (p.ej. 0.5)
   * @param {number} velocity   1..127
   * @returns {Object} NoteSequence
   */
  makeSeedFromPitches(pitches, stepDur = 0.5, velocity = 96) {
    let t = 0;
    const notes = pitches.map(p => {
      const n = { pitch: p, startTime: t, endTime: t + stepDur, program: 0, velocity };
      t += stepDur;
      return n;
    });
    return { notes, totalTime: t, tempos: [{ time: 0, qpm: this._qpm }] };
  }

  /**
   * Une "seed + continuación" en una sola NoteSequence (opcional).
   * Asume que la continuación arranca en t=0; la offseteamos al final del seed.
   * @param {Object} seedNs
   * @param {Object} contNs
   * @returns {Object} NoteSequence combinado
   */
  _mergeSeedAndContinuation(seedNs, contNs) {
    const mm = this._mm;
    const seed = mm.sequences.clone(seedNs);
    const cont = mm.sequences.clone(contNs);
    const offset = seed.totalTime || 0;

    cont.notes = cont.notes.map(n => ({
      ...n,
      startTime: n.startTime + offset,
      endTime: n.endTime + offset
    }));

    const out = mm.sequences.clone(seed);
    out.notes = [...seed.notes, ...cont.notes];
    out.totalTime = Math.max(
      seed.totalTime || 0,
      cont.notes.reduce((mx, n) => Math.max(mx, n.endTime), 0)
    );
    // Conservamos el tempo de seed:
    out.tempos = seed.tempos?.length ? seed.tempos : [{ time: 0, qpm: this._qpm }];
    return out;
  }

  // -------------------------------
  // API principal
  // -------------------------------

  /**
   * Continúa una melodía semilla usando MusicRNN (melody).
   * - Prepara el seed (cuantiza + monofoniza + tempo).
   * - Llama a model.continueSequence con steps (quantized steps) y temperatura.
   * - Devuelve por defecto **solo la continuación** (como la entrega el modelo).
   *   Si quieres "seed + cont" en una sola secuencia, usa { appendSeed: true }.
   *
   * @param {Object} seedNs          NoteSequence de entrada (melodía semilla)
   * @param {Object} opts
   * 
   * @param {number} [opts.temperature=this._defau@param {number} [opts.steps=64] Número de pasos cuantizados a generarltTemp] Aleatoriedad (0..2 aprox)
   * @param {string[]} [opts.chordProgression=this._chords] Progresión de acordes opcional
   * @param {number} [opts.qpm=this._qpm] Tempo a aplicar para preparar la semilla
   * @param {boolean} [opts.appendSeed=false] Si true, devuelve seed+continuación
   * @returns {Promise<Object>} NoteSequence (continuación o combinado)
   */
  async continue(seedNs, {
    steps = 64,
    temperature = this._defaultTemp,
    chordProgression = this._chords,
    qpm = this._qpm,
    appendSeed = false
  } = {}) {
    await this.initialize();

    // 1) Preparamos el seed para el modelo
    const seedPrepared = this._prepSeed(seedNs, qpm);

    // 2) Llamamos al modelo
    let cont;
    if (chordProgression && chordProgression.length) {
      cont = await this._model.continueSequence(seedPrepared, steps, temperature, chordProgression);
    } else {
      cont = await this._model.continueSequence(seedPrepared, steps, temperature);
    }

    // 3) Normalizamos tempo de la salida y por seguridad RANGO
    const contWithTempo = this._withTempo(cont, qpm);
    const contInRange = this._ensurePitchRange(contWithTempo);

    // 4) Opcionalmente devolvemos seed + continuación
    if (appendSeed) {
      return this._mergeSeedAndContinuation(seedPrepared, contInRange);
    }
    return contInRange;
  }

  // -------------------------------
  // QoL (Quality of Life)
  // -------------------------------

  /** Cambia SPQ (cuadrícula) */
  setStepsPerQuarter(spq) { this._spq = spq; }

  /** Cambia tempo QPM/BPM por defecto */
  setQpm(qpm) { this._qpm = qpm; }

  /** Cambia progresión de acordes por defecto (si aplica al checkpoint) */
  setChordProgression(chords) { this._chords = chords; }

  /** Devuelve la configuración actual (para paneles de UI) */
  getConfig() {
    return {
      stepsPerQuarter: this._spq,
      qpm: this._qpm,
      chordProgression: this._chords,
      defaultTemperature: this._defaultTemp
    };
  }
}

// ----------------------------------------------------------------------------
// Ejemplos de integración (guía):
//
// 1) Continuación básica y escuchar:
//    const cont = await rnn.continue(seedNs, { steps: 64, temperature: 1.0 });
//    App.loadTrack(cont, { name: 'RNN cont.', program: 0 });
//
// 2) Unir semilla + continuación (para ver la frase completa):
//    const full = await rnn.continue(seedNs, { steps: 64, appendSeed: true });
//    App.replaceMain(full);
//
// 3) Semilla rápida sin MIDI (pitches C mayor):
//    const seed = rnn.makeSeedFromPitches([60,62,64,65,67,69,71,72], 0.5);
//    const cont = await rnn.continue(seed, { steps: 48, temperature: 1.2 });
//    App.loadTrack(cont, { name: 'RNN C-major', program: 0 });
//
// 4) Con progresión de acordes (si el checkpoint lo admite):
//    rnn.setChordProgression(['C', 'G', 'Am', 'F']);
//    const cont = await rnn.continue(seedNs, { steps: 64 });
//    App.loadTrack(cont, { name: 'RNN chords', program: 0 });
//
// ----------------------------------------------------------------------------
