// ----------------------------------------------------------------------------
// MusicVAE wrapper para Magenta.js orientado a taller/competición.
// - Carga perezosa del modelo (initialize())
// - API de alto nivel: sample(), interpolate(), encode(), decode(), similar()
// - Normaliza siempre salida (tempo/SPQ y totalTime/totalQuantizedSteps)
// - Soporta tanto "mm" global (CDN) como import dinámico ESM
// - splitIntoTracks(ns): separa por partes (útil para Trio/GrooVAE)
// - Tres variantes listas: MelodyVaeService, TrioVaeService, GrooveVaeService
//
// Buenas prácticas incluidas:
//   * Nunca devolvemos secuencias sin totalTime o totalQuantizedSteps (>0).
//   * Respetamos el SPQ propio del modelo cuando aplica (Trio/Groove).
//   * No mutamos NoteSequences de entrada: clonamos/sanitizamos.
// ----------------------------------------------------------------------------

/** Obtiene el namespace de Magenta.js robustamente (CDN ó ESM). */
async function getMagenta() {
  if (typeof window !== 'undefined' && window.mm) return window.mm;
  try {
    const mod = await import('@magenta/music');
    return mod;
  } catch (err) {
    console.error(
      '[MusicVaeService] No encuentro @magenta/music.\n' +
      '  (A) CDN: <script src="https://unpkg.com/@magenta/music@1.23.1"></script>\n' +
      '  (B) npm i @magenta/music  + bundler (Vite/Webpack)'
    );
    throw err;
  }
}

/** Heurística: hay modelos que fijan su propio SPQ (p.ej. trio_*, groovae_). */
function urlHasOwnSpq(url = '') {
  return /\/(trio_|groovae_)/i.test(String(url));
}

/**
 * @typedef {Object} MusicVaeOptions
 * @property {string}  checkpointURL            URL/carpeta del checkpoint de MusicVAE.
 * @property {number}  [stepsPerQuarter=4]      SPQ (resolución de cuadrícula).
 * @property {number}  [qpm=120]                Tempo QPM/BPM.
 * @property {Object}  [controlArgs]            Args para modelos condicionados (acordes, etc).
 * @property {boolean} [preferModelSpq]         Fuerza a usar SPQ del modelo si lo declara.
 */

/** Servicio base para trabajar con MusicVAE. */
export class MusicVaeService {
  constructor({
    checkpointURL,
    stepsPerQuarter = 4,
    qpm = 120,
    controlArgs = undefined,
    preferModelSpq = undefined, // por defecto: deducido por URL
  } = {}) {
    if (!checkpointURL) throw new Error('[MusicVaeService] Falta "checkpointURL".');

    // Config
    this._checkpointURL  = checkpointURL;
    this._spq            = stepsPerQuarter;
    this._qpm            = qpm;
    this._controlArgs    = controlArgs;

    // Estado interno
    this._mm             = null;     // namespace Magenta
    this._model          = null;     // instancia mm.MusicVAE
    this._init           = null;     // promesa initialize()
    this._modelSpq       = null;     // SPQ declarado por el modelo (si lo hay)
    this._spqFromModel   = (preferModelSpq != null)
      ? !!preferModelSpq
      : urlHasOwnSpq(checkpointURL); // heurística si no se fuerza

    // Flags semánticos útiles (nombres de ayuda, no estrictamente necesarios)
    this._isTrio         = /trio_/i.test(checkpointURL);
    this._isGroove       = /groovae_/i.test(checkpointURL);
  }

  // -------------------------------
  // Ciclo de vida
  // -------------------------------

  /** Carga Magenta y el checkpoint. Idempotente. */
  async initialize() {
    if (this._init) return this._init;
    this._init = (async () => {
      this._mm = await getMagenta();
      this._model = new this._mm.MusicVAE(this._checkpointURL);
      await this._model.initialize();

      // Intentar descubrir SPQ del modelo
      const dcArgs = this._model?.dataConverter?.args || {};
      if (Number.isInteger(dcArgs.stepsPerQuarter)) {
        this._modelSpq = dcArgs.stepsPerQuarter;
        // Si el modelo declara SPQ, por defecto lo respetamos para evitar conflictos.
        if (this._spqFromModel === false) {
          // respetar preferencia manual
        } else {
          this._spqFromModel = true;
        }
      }
    })();
    return this._init;
  }

  /** Libera memoria. */
  dispose() {
    if (this._model?.dispose) this._model.dispose();
    this._model = null;
    this._mm = null;
    this._init = null;
  }

  /** Cambia de checkpoint (requerirá nuevo initialize()). */
  setCheckpointURL(url) {
    if (!url || typeof url !== 'string') {
      throw new Error('[MusicVaeService] setCheckpointURL: url inválida');
    }
    this.dispose();
    this._checkpointURL = url;
    this._spqFromModel  = urlHasOwnSpq(url);
    this._modelSpq      = null;
    this._isTrio        = /trio_/i.test(url);
    this._isGroove      = /groovae_/i.test(url);
  }

  // -------------------------------
  // Helpers internos
  // -------------------------------

  /** Cuantiza a SPQ objetivo (modelo o taller). No muta la entrada. */
  _quantize(ns) {
    try {
      const mm  = this._mm;
      const spq = (this._spqFromModel && this._modelSpq) ? this._modelSpq : this._spq;
      if (!spq) return ns;
      // ya cuantizada al mismo SPQ → tal cual
      const cur = ns?.quantizationInfo?.stepsPerQuarter;
      if (cur === spq) return ns;
      // des-cuantizar si trae otra cuadrícula
      if (cur && cur !== spq) {
        const qpm = ns?.tempos?.[0]?.qpm ?? this._qpm ?? 120;
        const unq = mm.sequences.unquantizeSequence(ns, qpm);
        return mm.sequences.quantizeNoteSequence(unq, spq);
      }
      // no cuantizada → cuantiza directo
      return mm.sequences.quantizeNoteSequence(ns, spq);
    } catch {
      return ns;
    }
  }

  /** Fija tempo y SPQ en la cabecera (no toca las notas). */
  _fixTempoAndSPQ(ns, spqOverride = null) {
    const out = (this._mm?.sequences?.clone)
      ? this._mm.sequences.clone(ns)
      : JSON.parse(JSON.stringify(ns));
    const spq = spqOverride ?? this._modelSpq ?? this._spq ?? 4;
    out.tempos = [{ time: 0, qpm: this._qpm }];
    out.quantizationInfo = { stepsPerQuarter: spq };
    return out;
  }

  /** Garantiza totalTime/totalQuantizedSteps (al menos uno > 0). */
  _ensureTotals(ns) {
    const spq = ns?.quantizationInfo?.stepsPerQuarter || this._modelSpq || this._spq || 4;

    // totalQuantizedSteps
    if (!Number.isFinite(ns.totalQuantizedSteps)) {
      let maxQ = 0;
      const notes = ns.notes || [];
      for (const n of notes) {
        const qe = (n.quantizedEndStep != null)
          ? n.quantizedEndStep
          : (n.quantizedStartStep != null ? n.quantizedStartStep : 0);
        if (qe > maxQ) maxQ = qe;
      }
      if (maxQ > 0) ns.totalQuantizedSteps = maxQ;
    }

    // totalTime
    if (!Number.isFinite(ns.totalTime)) {
      let maxEnd = 0;
      const notes = ns.notes || [];
      for (const n of notes) {
        if (typeof n.endTime === 'number') maxEnd = Math.max(maxEnd, n.endTime);
      }
      if (maxEnd > 0) {
        ns.totalTime = maxEnd;
      } else if (Number.isFinite(ns.totalQuantizedSteps)) {
        const secPerBeat = 60 / (this._qpm || 120);
        const secPerStep = secPerBeat / spq;
        ns.totalTime = ns.totalQuantizedSteps * secPerStep;
      }
    }

    // Epsilon: el visualizador necesita uno “truthy”
    if (!(ns.totalTime > 0) && !(ns.totalQuantizedSteps > 0)) {
      if (ns.quantizationInfo?.stepsPerQuarter) ns.totalQuantizedSteps = 1;
      else ns.totalTime = 0.001;
    }
    return ns;
  }

  /** Sanea: fija tempo/SPQ y asegura totales (sin mutar entrada). */
  _sanitize(ns, { spq } = {}) {
    const fixed = this._fixTempoAndSPQ(ns, spq);
    return this._ensureTotals(fixed);
  }

  /** Normaliza lista de NS (cuantiza si procede). */
  _prepInputList(input) {
    const list = Array.isArray(input) ? input : [input];
    return list.map(ns => this._quantize(ns));
  }

  // -------------------------------
  // splitIntoTracks (útil para Trio/Groove)
  // -------------------------------

  /**
   * Agrupa por 'instrument' si existe; si no, por (isDrum, program).
   * Devuelve [{ ns, name, program, isDrum }...], listo para App.loadTrack().
   */
  splitIntoTracks(ns) {
    const spqSrc = ns?.quantizationInfo?.stepsPerQuarter || this._modelSpq || this._spq || 4;
    const src    = this._sanitize(ns, { spq: spqSrc });
    const notes  = Array.isArray(src.notes) ? src.notes : [];
    if (!notes.length) return [];

    const groups = new Map();
    for (const n of notes) {
      const key = Number.isInteger(n.instrument)
        ? `inst:${n.instrument}`
        : (n.isDrum ? 'drums' : `prog:${(Number.isInteger(n.program) ? n.program : 0)}`);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(n);
    }

    const out = [];
    for (const [key, g] of groups.entries()) {
      const cloned = {
        notes: g.map(n => ({ ...n })),
        tempos: [{ time: 0, qpm: this._qpm }],
        quantizationInfo: { stepsPerQuarter: spqSrc }
      };
      this._ensureTotals(cloned);

      const first   = g[0] || {};
      const isDrum  = this._isGroove ? true : !!first.isDrum; // GrooVAE: todo batería
      const program = Number.isInteger(first.program) ? first.program : 0;

      let name;
      if (isDrum || key === 'drums') {
        name = 'Batería';
      } else if (key.startsWith('inst:')) {
        const idx = parseInt(key.split(':')[1], 10);
        name = `Parte inst ${isNaN(idx) ? '?' : idx}`;
      } else if (this._isTrio) {
        // pista heurística en Trio (bajo/melodía según pitch)
        const avgPitch = g.reduce((s, n) => s + (n.pitch ?? 60), 0) / g.length;
        name = avgPitch < 52 ? 'Bajo' : 'Melodía';
      } else {
        name = 'Parte';
      }

      out.push({ ns: this._ensureTotals(cloned), name, program, isDrum });
    }

    // Orden recomendado
    const score = (p) => p.isDrum ? 0 :
      (p.name.toLowerCase().includes('bajo') ? 1 :
       (p.name.toLowerCase().includes('melod') ? 2 : 3));
    out.sort((a, b) => score(a) - score(b));

    return out;
  }

  // -------------------------------
  // API de generación / latente
  // -------------------------------

  /** Genera desde el prior. Devuelve NS saneadas. */
  async sample(numSamples = 1, temperature = 0.5) {
    await this.initialize();
    let outs;
    if (this._spqFromModel) {
      outs = await this._model.sample(numSamples, temperature, this._controlArgs);
    } else {
      outs = await this._model.sample(
        numSamples, temperature, this._controlArgs, this._spq, this._qpm
      );
    }
    const spq = this._modelSpq ?? this._spq ?? 4;
    return outs.map(ns => this._sanitize(ns, { spq }));
  }

  /** Interpolación latente. */
  async interpolate(inputSequences, numInterps = 5, temperature = 0.5) {
    await this.initialize();
    const qList = this._prepInputList(inputSequences);
    const outs  = await this._model.interpolate(qList, numInterps, temperature, this._controlArgs);
    const spq   = this._modelSpq ?? this._spq ?? 4;
    return outs.map(ns => this._sanitize(ns, { spq }));
  }

  /** Encode → Tensor2D (recuerda .dispose() si haces muchas). */
  async encode(inputSequences) {
    await this.initialize();
    const qList = this._prepInputList(inputSequences);
    return this._model.encode(qList, this._controlArgs);
  }

  /** Decode desde latente. Devuelve NS saneadas. */
  async decode(z, temperature) {
    await this.initialize();
    let outs;
    if (this._spqFromModel) {
      outs = await this._model.decode(z, temperature, this._controlArgs);
    } else {
      outs = await this._model.decode(
        z, temperature, this._controlArgs, this._spq, this._qpm
      );
    }
    const spq = this._modelSpq ?? this._spq ?? 4;
    return outs.map(ns => this._sanitize(ns, { spq }));
  }

  /** Variaciones similares a una entrada. */
  async similar(inputSequence, numSamples = 4, similarity = 0.7, temperature = 0.5) {
    await this.initialize();
    const qList = this._prepInputList(inputSequence);
    const q     = Array.isArray(qList) ? qList[0] : qList; // 1 sola
    const outs  = await this._model.similar(q, numSamples, similarity, temperature, this._controlArgs);
    const spq   = this._modelSpq ?? this._spq ?? 4;
    return outs.map(ns => this._sanitize(ns, { spq }));
  }

  // -------------------------------
  // QoL
  // -------------------------------
  setStepsPerQuarter(spq) { this._spq = spq; }
  setQpm(qpm)            { this._qpm = qpm; }
  getConfig() {
    return {
      stepsPerQuarter: this._spq,
      qpm: this._qpm,
      spqFromModel: this._spqFromModel,
      modelSpq: this._modelSpq,
      isTrio: this._isTrio,
      isGroove: this._isGroove
    };
  }
}

// -------------------------------
// Variantes específicas (a nivel semántico)
// -------------------------------

/** Melody: usa SPQ/QPM del taller (no forzamos SPQ del modelo). */
export class MelodyVaeService extends MusicVaeService {
  constructor(opts = {}) {
    super({ ...opts, preferModelSpq: false });
  }
}

/** Trio: por defecto respetamos el SPQ del modelo si lo declara. */
export class TrioVaeService extends MusicVaeService {
  constructor(opts = {}) {
    super({ ...opts, preferModelSpq: true });
  }
}

/** GrooVAE (drums): por defecto respetamos el SPQ del modelo y marcamos batería. */
export class GrooveVaeService extends MusicVaeService {
  constructor(opts = {}) {
    super({ ...opts, preferModelSpq: true });
  }
}

// -------------------------------
// Factory opcional (azúcar sintáctico)
// -------------------------------
/**
 * Crea un “suite” de 3 VAEs a partir de tus checkpoints.
 * @example
 *   const vae = makeVaeSuite(CHECKPOINTS.musicvae, { qpm: 120, stepsPerQuarter: 4 });
 *   await vae.melody.initialize(); const [ns] = await vae.melody.sample();
 */
export function makeVaeSuite(checkpoints, common = {}) {
  const { melody, trio, groovae } = checkpoints || {};
  return {
    melody : new MelodyVaeService({ checkpointURL: melody,  ...common }),
    trio   : new TrioVaeService({   checkpointURL: trio,    ...common }),
    groovae: new GrooveVaeService({ checkpointURL: groovae, ...common })
  };
}
