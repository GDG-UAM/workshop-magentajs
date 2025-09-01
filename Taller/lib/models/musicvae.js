// File: Taller/lib/models/musicvae.js
// ----------------------------------------------------------------------------
// MusicVAE wrapper para Magenta.js orientado a taller/competición.
// - Carga perezosa del modelo (initialize())
// - Métodos de alto nivel: sample(), interpolate(), encode(), decode(), similar()
// - Cuida la cuantización (stepsPerQuarter) y tempo (qpm)
// - Soporta tanto "mm" global (CDN) como import dinámico ESM
//
// Uso mínimo (en una demo o ejercicio):
//   import { MusicVaeService } from '../lib/models/musicvae.js';
//
//   const vae = new MusicVaeService({
//     checkpointURL: 'URL_DEL_CHECKPOINT_MELODY', // p.ej. melody_2bar o trio_16bar
//     stepsPerQuarter: 4,
//     qpm: 120
//   });
//   await vae.initialize();
//   const [ns] = await vae.sample(1, 0.8);
//   App.loadTrack(ns, { name: 'VAE sample', program: 0 });
//
// ----------------------------------------------------------------------------

/**
 * Intenta obtener el namespace de Magenta.js:
 * - Si usamos CDN: window.mm existe.
 * - Si usamos bundler/ESM: intentamos import('@magenta/music').
 */
async function getMagenta() {
  if (typeof window !== 'undefined' && window.mm) return window.mm;

  // Entorno ESM/bundler. Si falla, explicamos cómo solucionarlo.
  try {
    // Nota: este import requiere que @magenta/music esté en node_modules.
    const mod = await import('@magenta/music');
    return mod;
  } catch (err) {
    const msg = [
      '[MusicVaeService] No encuentro @magenta/music.',
      'Soluciones posibles:',
      '  (A) Añade en el HTML: <script src="https://unpkg.com/@magenta/music@1.23.1"></script>',
      '  (B) Instala y usa ESM:  npm i @magenta/music  y bundler (Vite/Webpack).',
    ].join('\n');
    console.error(msg);
    throw err;
  }
}

/**
 * Opciones de inicialización del servicio.
 * @typedef {Object} MusicVaeOptions
 * @property {string} checkpointURL   URL/carpeta del checkpoint de MusicVAE.
 * @property {number} [stepsPerQuarter=4]  Resolución de cuadrícula (SPQ).
 * @property {number} [qpm=120]            Tempo en negras por minuto (QPM/BPM).
 * @property {Object} [controlArgs]        Args opcionales para modelos condicionados (acordes, etc.).
 */

/**
 * Servicio de alto nivel para trabajar con MusicVAE en el taller.
 * Encapsula el ciclo de vida del modelo y ofrece helpers amigables.
 */
export class MusicVaeService {
  /**
   * @param {MusicVaeOptions} opts
   */
  constructor({
    checkpointURL,
    stepsPerQuarter = 4,
    qpm = 120,
    controlArgs = undefined,
  } = {}) {
    if (!checkpointURL) {
      throw new Error('[MusicVaeService] Falta "checkpointURL".');
    }
    this._checkpointURL = checkpointURL;
    this._spq = stepsPerQuarter;
    this._qpm = qpm;
    this._controlArgs = controlArgs;

    this._mm = null;        // namespace de Magenta
    this._model = null;     // instancia de mm.MusicVAE
    this._init = null;      // promesa de initialize()
  }

  // -------------------------------
  // Ciclo de vida
  // -------------------------------

  /**
   * Carga el namespace de Magenta y el checkpoint del modelo.
   * Idempotente: puedes llamarlo varias veces sin coste extra.
   */
  async initialize() {
    if (this._init) return this._init;

    this._init = (async () => {
      this._mm = await getMagenta();
      this._model = new this._mm.MusicVAE(this._checkpointURL);
      await this._model.initialize();
    })();

    return this._init;
  }

  /**
   * Libera tensores y memoria del modelo (útil si el taller re-carga muchos modelos).
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
   * Asegura que una NoteSequence esté cuantizada a "stepsPerQuarter" (SPQ) uniforme.
   * - Muchos flujos de VAE esperan cuantización coherente.
   * - Si ya está cuantizada, devuelve una copia coherente; si no, cuantiza.
   * @param {Object} ns  INoteSequence
   * @returns {Object}   NoteSequence cuantizada
   */
  _quantize(ns) {
    const mm = this._mm;
    // Si ya está cuantizada, podríamos aceptar tal cual, pero
    // en taller preferimos homogeneizar a this._spq:
    try {
      return mm.sequences.quantizeNoteSequence(ns, this._spq);
    } catch (e) {
      // Errores típicos: múltiples tempos o compases; para taller, simplificamos.
      console.warn('[MusicVaeService] No he podido cuantizar con SPQ=', this._spq, e);
      // Devolvemos el original para no bloquear el ejercicio.
      return ns;
    }
  }

  /**
   * Normaliza lista de NoteSequences, cuantizando cada una.
   * @param {Object[]|Object} input  Uno o varios INoteSequence
   * @returns {Object[]}             Array de NoteSequence cuantizadas
   */
  _prepInputList(input) {
    const list = Array.isArray(input) ? input : [input];
    return list.map(ns => this._quantize(ns));
  }

  // -------------------------------
  // API de generación / latente
  // -------------------------------

  /**
   * Genera muestras desde el prior del VAE.
   * @param {number} numSamples  número de secuencias a generar
   * @param {number} [temperature=0.5] suavizado (más alto => más aleatorio)
   * @returns {Promise<Object[]>} Array de NoteSequence
   */
  async sample(numSamples = 1, temperature = 0.5) {
    await this.initialize();
    return this._model.sample(
      numSamples,
      temperature,
      this._controlArgs,      // p.ej. acordes si usas un VAE condicionado
      this._spq,
      this._qpm
    );
  }

  /**
   * Interpola entre 2 (o 4) secuencias en el espacio latente.
   * @param {Object[]|Object} inputSequences  2 ó 4 NoteSequence(s)
   * @param {number|number[]} numInterps      total de salidas (incluye reconstr. de extremos)
   * @param {number} [temperature=0.5]
   * @returns {Promise<Object[]>}             Array de NoteSequence interpoladas
   */
  async interpolate(inputSequences, numInterps = 5, temperature = 0.5) {
    await this.initialize();
    const qList = this._prepInputList(inputSequences);
    return this._model.interpolate(qList, numInterps, temperature, this._controlArgs);
  }

  /**
   * Codifica una o varias NoteSequence al espacio latente Z (Tensor2D).
   * Nota: devuelve un Tensor; recuerda .dispose() si haces muchas operaciones.
   * @param {Object[]|Object} inputSequences
   * @returns {Promise<import('@tensorflow/tfjs').Tensor2D>}
   */
  async encode(inputSequences) {
    await this.initialize();
    const qList = this._prepInputList(inputSequences);
    return this._model.encode(qList, this._controlArgs);
  }

  /**
   * Decodifica vectores latentes Z a NoteSequence.
   * @param {import('@tensorflow/tfjs').Tensor2D} z  forma [batch, zDim]
   * @param {number} [temperature]                   si no se da, usa argmax
   * @returns {Promise<Object[]>}                    Array de NoteSequence
   */
  async decode(z, temperature) {
    await this.initialize();
    return this._model.decode(z, temperature, this._controlArgs, this._spq, this._qpm);
  }

  /**
   * Genera variaciones "similares" a una entrada (interpola en latente con ruido).
   * @param {Object} inputSequence  NoteSequence base
   * @param {number} numSamples     cuántas variaciones
   * @param {number} similarity     0..1 (1 = muy similar, 0 = más diferente)
   * @param {number} [temperature=0.5]
   * @returns {Promise<Object[]>}
   */
  async similar(inputSequence, numSamples = 4, similarity = 0.7, temperature = 0.5) {
    await this.initialize();
    const q = this._quantize(inputSequence);
    return this._model.similar(q, numSamples, similarity, temperature, this._controlArgs);
  }

  // -------------------------------
  // QoL (Quality of Life)
  // -------------------------------

  /** Cambia SPQ (p.ej., para cuadrícula más fina) */
  setStepsPerQuarter(spq) { this._spq = spq; }

  /** Cambia tempo QPM/BPM (repercute en sample/decode) */
  setQpm(qpm) { this._qpm = qpm; }

  /** Devuelve SPQ/QPM actuales (útil para paneles de UI). */
  getConfig() {
    return { stepsPerQuarter: this._spq, qpm: this._qpm };
  }
}

// ----------------------------------------------------------------------------
// Ejemplos de integración (solo como guía, no se ejecutan aquí):
//
// 1) SAMPLE simple a la UI genérica:
//    const [ns] = await vae.sample(1, 0.9);
//    App.loadTrack(ns, { name: 'VAE sample', program: 0 });
//
// 2) INTERPOLACIÓN entre dos melodías existentes (p.ej., cargadas por MIDI):
//    const outs = await vae.interpolate([melA, melB], 8, 0.7);
//    // outs[0] ≈ reconstrucción de melA, outs[7] ≈ reconstrucción de melB
//    App.replaceMain(outs[0]); // o mostrar una lista y elegir
//
// 3) VARIACIONES similares a una entrada:
//    const vars = await vae.similar(melody, 4, 0.8, 0.6);
//    vars.forEach((ns, i) => App.loadTrack(ns, { name: `Var #${i+1}`, program: 0 }));
//
// 4) ENCODE/DECODE manual (avanzado en el taller):
//    const z = await vae.encode(melody);
//    // ... manipular z con tfjs ...
//    const outSeqs = await vae.decode(z, 0.6);
//    z.dispose();
// ----------------------------------------------------------------------------
