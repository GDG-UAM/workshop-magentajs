// File: Taller/lib/models/coconet.js
// ----------------------------------------------------------------------------
// Coconet wrapper para Magenta.js (orientado a taller/competición)
// 
// Objetivo:
//   - Facilitar el uso de Coconet (armonización a 4 voces estilo coral
//     y "infill" de huecos) con una API simple y bien comentada.
//   - Ser usable tanto si cargas @magenta/music por CDN (window.mm) como
//     si usas import ESM/bundler.
//   - Proveer utilidades para: cuantización, plantillas a 4 voces,
//     asignación de voz (S/A/T/B), y llamadas a inferencia con opciones.
// 
// Uso mínimo (en una demo del taller):
//   import { CoconetService } from '../lib/models/coconet.js';
//   const coco = new CoconetService({ checkpointURL: 'URL_DEL_CHECKPOINT_COCONET' });
//   await coco.initialize();
//   const harmonized = await coco.harmonize(melodyNs, { temperature: 0.99 });
//   App.loadTrack(harmonized, { name: 'Coconet Harmonized', program: 0 });
// 
// Notas:
//   - Coconet trabaja mejor con secuencias cuantizadas (grid uniforme).
//   - Este wrapper no fuerza una "métrica" concreta; sí homogeneiza
//     stepsPerQuarter (SPQ) y aplica qpm donde sea relevante.
//   - Por simplicidad, mapeamos las 4 voces a los "instrument" 0..3:
//       0 = Soprano, 1 = Alto, 2 = Tenor, 3 = Bajo.
//     Esto ayuda a separar/visualizar y a construir máscaras si se usan.
// ----------------------------------------------------------------------------

/** Obtiene el namespace de Magenta (@magenta/music) de forma robusta.
 *  - CDN: window.mm
 *  - ESM/Bundler: import('@magenta/music')
 */
async function getMagenta() {
  if (typeof window !== 'undefined' && window.mm) return window.mm;
  try {
    const mod = await import('@magenta/music');
    return mod;
  } catch (err) {
    const msg = [
      '[CoconetService] No encuentro @magenta/music.',
      'Soluciones: ',
      '  (A) CDN: <script src="https://unpkg.com/@magenta/music@1.23.1"></script>',
      '  (B) npm i @magenta/music  y usar bundler (Vite/Webpack)'
    ].join('\n');
    console.error(msg);
    throw err;
  }
}

/** @typedef {Object} CoconetOptions
 *  @property {string} checkpointURL            URL/carpeta del checkpoint Coconet
 *  @property {number} [stepsPerQuarter=4]      SPQ (resolución de cuadrícula)
 *  @property {number} [qpm=120]                Tempo base (negras por minuto)
 *  @property {number} [numIterations=64]       Iteraciones de Gibbs (más => mejor/mas lento)
 *  @property {number} [temperature=0.99]       Aleatoriedad del muestreo
 *  @property {number} [numSamples=1]           Cuántas muestras generar por inferencia
 *  @property {boolean} [assignSoprano=true]    Si true, asigna la melodía de entrada a voz 0 (S)
 */

export class CoconetService {
  /** @param {CoconetOptions} opts */
  constructor({
    checkpointURL,
    stepsPerQuarter = 4,
    qpm = 120,
    numIterations = 64,
    temperature = 0.99,
    numSamples = 1,
    assignSoprano = true,
  } = {}) {
    if (!checkpointURL) throw new Error('[CoconetService] Falta "checkpointURL".');

    this._checkpointURL = checkpointURL;
    this._spq = stepsPerQuarter;
    this._qpm = qpm;

    this._defaultIter = numIterations;
    this._defaultTemp = temperature;
    this._defaultNSamp = numSamples;

    this._assignSoprano = assignSoprano;

    this._mm = null;     // namespace Magenta
    this._model = null;  // instancia mm.Coconet
    this._init = null;   // promesa initialize()
  }

  // -------------------------------
  // Ciclo de vida
  // -------------------------------

  /** Carga el modelo y deja listo Coconet. Idempotente. */
  async initialize() {
    if (this._init) return this._init;
    this._init = (async () => {
      this._mm = await getMagenta();
      this._model = new this._mm.Coconet(this._checkpointURL);
      await this._model.initialize();
    })();
    return this._init;
  }

  /** Libera memoria (útil si se cambian checkpoints durante el taller). */
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

  /** Cuantiza la NoteSequence a SPQ uniforme (robustece el flujo). */
  _quantize(ns) {
    const mm = this._mm;
    try {
      return mm.sequences.quantizeNoteSequence(ns, this._spq);
    } catch (e) {
      console.warn('[CoconetService] No se pudo cuantizar con SPQ=', this._spq, e);
      return ns; // no bloqueamos; seguimos con el original
    }
  }

  /**
   * Devuelve una COPIA de la NoteSequence con todos sus notes asignados al
   * índice de voz indicado (0..3). Usamos el campo `instrument` como etiqueta
   * de voz para mantener separado S/A/T/B a nivel de datos.
   */
  _asVoice(ns, voiceIndex) {
    const mm = this._mm;
    const out = mm.sequences.clone(ns);
    out.notes.forEach(n => { n.instrument = voiceIndex; });
    return out;
  }

  /** Crea una plantilla de 4 voces a partir de una melodía (voz soprano). */
  _fourVoiceTemplateFromMelody(melodyNs) {
    const mm = this._mm;
    const q = this._quantize(melodyNs);
    const totalTime = q.totalTime || (q.notes.length ? Math.max(...q.notes.map(n => n.endTime)) : 0);

    const soprano = this._assignSoprano ? this._asVoice(q, 0) : q;
    // Voces vacías (alto/tenor/bajo) se representarán como secuencias sin notas,
    // pero con mismo totalTime para que el motor conozca el horizonte temporal.
    const emptyVoice = (idx) => ({ notes: [], totalTime, quantizationInfo: q.quantizationInfo, sourceInfo: q.sourceInfo, tempos: q.tempos, timeSignatures: q.timeSignatures, keySignatures: q.keySignatures, instruments: [], id: undefined, controlChanges: [], pitchBends: [] , /* añadimos etiqueta de voz con un note ficticio si fuera necesario*/ });

    const alto  = emptyVoice(1);
    const tenor = emptyVoice(2);
    const bass  = emptyVoice(3);

    // Fusionamos a una sola NoteSequence multivoz.
    const merged = mm.sequences.clone(soprano);
    // Limpiamos instrument de soprano por si acaso (ya está en 0).
    merged.notes.forEach(n => { n.instrument = 0; });

    const appendAll = (src, vidx) => {
      if (!src || !src.notes) return;
      src.notes.forEach(n => {
        merged.notes.push({ ...n, instrument: vidx });
      });
    };

    appendAll(alto, 1);
    appendAll(tenor, 2);
    appendAll(bass, 3);

    merged.totalTime = totalTime;
    return merged;
  }

  /** Mezcla múltiples secuencias (ya etiquetadas por voz) en una sola. */
  _merge(seqs) {
    const mm = this._mm;
    if (!seqs || !seqs.length) return { notes: [], totalTime: 0 };
    const out = mm.sequences.clone(seqs[0]);
    for (let i = 1; i < seqs.length; i++) {
      mm.sequences.merge(out, seqs[i]);
    }
    out.totalTime = Math.max(...seqs.map(s => s.totalTime || 0));
    return out;
  }

  /**
   * (Opcional) Crea una máscara de tiempo para infill por rango:
   * Estructura de ejemplo: { startSec, endSec, voices: [0,1,2,3] }
   * Nota: La API exacta de máscaras puede variar por versión. Este wrapper
   * pasa la máscara a `infer` tal cual; úsala si tu checkpoint la soporta.
   */
  _buildMask({ startSec = 0, endSec = null, voices = [0,1,2,3] } = {}, totalTime=0) {
    const end = endSec == null ? totalTime : endSec;
    return { startSec, endSec: end, voices };
  }

  // -------------------------------
  // API pública de generación
  // -------------------------------

  /**
   * Armoniza una melodía monofónica en 4 voces (estilo coral).
   * - Toma tu melodía como soprano (voz 0) y deja al modelo completar
   *   el resto (alto/tenor/bajo) según el checkpoint.
   * - Si tu checkpoint requiere máscaras explícitas, puedes pasarlas en `opts`.
   *
   * @param {Object} melodyNs        NoteSequence monofónica (melodía)
   * @param {Object} [opts]
   * @param {number} [opts.numIterations]
   * @param {number} [opts.temperature]
   * @param {number} [opts.numSamples]
   * @param {Object|Object[]} [opts.masks]  (Opcional) Definición de máscaras
   * @returns {Promise<Object>} NoteSequence armonizada (4 voces)
   */
  async harmonize(melodyNs, opts = {}) {
    await this.initialize();

    const numIterations = opts.numIterations ?? this._defaultIter;
    const temperature   = opts.temperature   ?? this._defaultTemp;
    const numSamples    = opts.numSamples    ?? this._defaultNSamp;

    // 1) Creamos plantilla a 4 voces con la melodía en soprano
    const template = this._fourVoiceTemplateFromMelody(melodyNs);

    // 2) Llamamos a infer con opciones por defecto (y máscaras si las dan)
    //    Nota: algunas versiones aceptan opciones extra como `partialSpec`.
    const inferOpts = { numIterations, temperature, numSamples };
    if (opts.masks) inferOpts.masks = opts.masks; // passthrough si se usan

    const out = await this._model.infer(template, inferOpts);

    // 3) Ajuste de tempo (si aplica) y salida final
    out.tempos = out.tempos && out.tempos.length
      ? out.tempos
      : [{ time: 0, qpm: this._qpm }];

    return out;
  }

  /**
   * Infill (relleno) sobre una secuencia de 4 voces con huecos: útil si
   * ya traes algunas voces y quieres que Coconet complete otras.
   * - `templateNs` debe ser multivoz (instrument 0..3) y puede contener
   *   silencios/huecos (simplemente no pongas notas en esas zonas).
   * - (Opcional) `mask` define el rango temporal y qué voces rellenar.
   *
   * @param {Object} templateNs  NoteSequence multivoz (S/A/T/B vía instrument)
   * @param {Object} [mask]      { startSec, endSec, voices: [0..3] }
   * @param {Object} [opts]
   * @returns {Promise<Object>}  NoteSequence completada
   */
  async infill(templateNs, mask = null, opts = {}) {
    await this.initialize();

    const numIterations = opts.numIterations ?? this._defaultIter;
    const temperature   = opts.temperature   ?? this._defaultTemp;
    const numSamples    = opts.numSamples    ?? this._defaultNSamp;

    // Normalizamos tiempos/tempo
    const q = this._quantize(templateNs);

    const inferOpts = { numIterations, temperature, numSamples };
    if (mask) inferOpts.masks = [mask];

    const out = await this._model.infer(q, inferOpts);
    out.tempos = out.tempos && out.tempos.length
      ? out.tempos
      : [{ time: 0, qpm: this._qpm }];
    return out;
  }

  // -------------------------------
  // QoL (Quality of Life)
  // -------------------------------

  /** Cambia SPQ (granularidad de cuantización). */
  setStepsPerQuarter(spq) { this._spq = spq; }
  /** Cambia QPM/BPM (asignamos si falta en la salida). */
  setQpm(qpm) { this._qpm = qpm; }
  /** Devuelve configuración actual. */
  getConfig() { return { stepsPerQuarter: this._spq, qpm: this._qpm, numIterations: this._defaultIter, temperature: this._defaultTemp, numSamples: this._defaultNSamp }; }

  /** Utilidad para crear máscaras de rango temporal y voces. */
  buildMaskFor(templateNs, { startSec = 0, endSec = null, voices = [0,1,2,3] } = {}) {
    const total = templateNs.totalTime || 0;
    return this._buildMask({ startSec, endSec, voices }, total);
  }
}

// ----------------------------------------------------------------------------
// Ejemplos de integración (comentados):
//
// 1) Armonizar melodía como soprano:
//    const coco = new CoconetService({ checkpointURL: COCONET_URL, stepsPerQuarter: 4, qpm: 120 });
//    await coco.initialize();
//    const nsOut = await coco.harmonize(melodyNs, { temperature: 0.98, numIterations: 64 });
//    App.loadTrack(nsOut, { name: 'Coconet – Harmonized', program: 0 });
//
// 2) Infill de un tramo (solo compases 4–8) en voces A/T/B, dejando Soprano intacta:
//    // Suponiendo que ya tienes una secuencia a 4 voces en `fourVoicesNs`…
//    const mask = coco.buildMaskFor(fourVoicesNs, { startSec: 8.0, endSec: 16.0, voices: [1,2,3] });
//    const completed = await coco.infill(fourVoicesNs, mask, { temperature: 0.99 });
//    App.replaceMain(completed);
//
// 3) Usar con la UI genérica del taller (generic.html):
//    // a) Genera/haz load de una melodía (assets/midi/melody.mid)
//    // b) Llama a harmonize() y luego App.loadTrack() o App.replaceMain()
//    const [melody] = await loadMyMelody();
//    const out = await coco.harmonize(melody);
//    App.loadTrack(out, { name: 'My Harmonization', program: 0 });
//
// 4) Ajustar SPQ/QPM sobre la marcha:
//    coco.setStepsPerQuarter(4);
//    coco.setQpm(96);
// ----------------------------------------------------------------------------
