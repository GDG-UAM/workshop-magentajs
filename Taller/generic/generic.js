// En: Taller/generic/generic.js

import { LoopingPlayer } from '../lib/core/player.js';
import { Roll } from '../lib/core/visualize.js';
import { buildTransport, buildSaveLoad, buildTracks, bindTitleInput } from '../lib/ui/components.js';
import { merge, setInstrument } from '../lib/core/sequences.js';
import { concatOnGrid } from '../lib/core/concat.js';

// SPQ (Steps Per Quarter) = subdivisiones por negra.
// QPM (Quarter notes Per Minute) = negras por minuto (tempo).

export const App = (() => {
  // --- Estado global ---
  const state = {
    title: '',
    current: null,     // mezcla de pistas activas visualizada/reproducida
    tracks: [],        // [{ ns, name, program, isDrum, isActive }]
    qpm: 120,
    concatSelection: { a: null, b: null }, // selección A/B
    mergeAwaiting: false
  };

  // Instancias únicas
  let player, viz;

  // -------------------------------
  // Normalización de cuadrícula
  // -------------------------------
  function toUniformGrid(seqs) {
    // Detecta un SPQ de referencia si alguna está cuantizada
    let spq = null;
    for (const s of seqs) {
      const steps = s?.quantizationInfo?.stepsPerQuarter;
      if (Number.isInteger(steps) && steps > 0) { spq = steps; break; }
    }
    if (!spq) return seqs;

    const mm = window.mm;
    const qpmFallback = (seqs.find(s => s?.tempos?.length)?.tempos?.[0]?.qpm) ?? 120;

    return seqs.map(s => {
      const cur = s?.quantizationInfo?.stepsPerQuarter;
      try {
        if (!cur) {
          // no cuantizada → cuantiza directo a SPQ objetivo
          return window.__lib.quantize(s, spq);
        }
        if (cur === spq) return s;
        // distinta cuadrícula → des-cuantizar y re-cuantizar
        const qpm = s?.tempos?.[0]?.qpm ?? qpmFallback;
        const unq = mm.sequences.unquantizeSequence(s, qpm);
        return mm.sequences.quantizeNoteSequence(unq, spq);
      } catch {
        return s; // ante cualquier error, no romper
      }
    });
  }

  // -------------------------------
  // Metadatos mínimos para el viz/reproductor
  // -------------------------------
  function ensureNsMeta(ns) {
    // Clonado seguro
    const copy = window.mm?.sequences?.clone
      ? window.mm.sequences.clone(ns)
      : JSON.parse(JSON.stringify(ns || {}));

    // Asegura arrays
    copy.notes = Array.isArray(copy.notes) ? copy.notes : [];

    // 1) tempos (conserva qpm existente si lo hay)
    const qpm = copy?.tempos?.[0]?.qpm ?? 120;
    copy.tempos = [{ time: 0, qpm }];

    // 2) SPQ de referencia
    const spq = copy?.quantizationInfo?.stepsPerQuarter ?? 4;

    // 3) totalQuantizedSteps si falta (mirando quantizedStart/EndStep)
    if (!Number.isFinite(copy.totalQuantizedSteps)) {
      let maxQ = 0;
      for (const n of copy.notes) {
        const qe = (n.quantizedEndStep != null)
          ? n.quantizedEndStep
          : (n.quantizedStartStep != null ? n.quantizedStartStep : 0);
        if (qe > maxQ) maxQ = qe;
      }
      if (maxQ > 0) copy.totalQuantizedSteps = maxQ;
    }

    // 4) totalTime si falta: primero desde endTime; si no, de steps → segundos
    if (!Number.isFinite(copy.totalTime)) {
      let maxEnd = 0;
      for (const n of copy.notes) {
        if (typeof n.endTime === 'number') maxEnd = Math.max(maxEnd, n.endTime);
      }
      if (maxEnd > 0) {
        copy.totalTime = maxEnd;
      } else if (Number.isFinite(copy.totalQuantizedSteps)) {
        const secPerBeat = 60 / qpm;
        const secPerStep = secPerBeat / spq;
        copy.totalTime = copy.totalQuantizedSteps * secPerStep;
      }
    }

    // 5) Si sigue sin haber nada, pon mínimos para contentar al viz
    if (!(copy.totalTime > 0) && !(copy.totalQuantizedSteps > 0)) {
      if (copy.quantizationInfo?.stepsPerQuarter || spq) {
        copy.quantizationInfo = { stepsPerQuarter: spq || 4 };
        copy.totalQuantizedSteps = 1;
      } else {
        copy.totalTime = 0.001; // evita error del visualizador
      }
    }

    // 6) Si hay steps pero falta quantizationInfo, añádela
    if (Number.isFinite(copy.totalQuantizedSteps) && !copy.quantizationInfo?.stepsPerQuarter) {
      copy.quantizationInfo = { stepsPerQuarter: spq || 4 };
    }

    return copy;
  }

  // -------------------------------
  // Handlers de UI
  // -------------------------------
  function onLoadSequence(ns, meta = {}) {
    const name = meta.name || 'Importado';
    const program = meta.program ?? 0;
    const isDrum = !!meta.isDrum;
    loadTrack(ns, { name, program, isDrum });
  }


  function onLoadTrackFile(ns, meta = {}) {
    const name = meta.name || 'Importado';
    const program = meta.program ?? 0;
    const isDrum = !!meta.isDrum;
    const preserveInstruments = !!meta.preserveInstruments;
    loadTrack(ns, { name, program, isDrum, preserveInstruments });
  }

  function onDownload() {
    const active = state.tracks
      .filter(t => t.isActive)
      .map(t => t.preserveInstruments
        ? ensureNsMeta(t.ns)
        : setInstrument(t.ns, t.program ?? 0, t.isDrum ?? false)
      );

    if (active.length === 0) {
      alert('No hay pistas activas para descargar.');
      return;
    }
    const ns = active.length === 1 ? active[0] : merge(active);
    const filename = (state.title?.trim() || 'magenta_sandbox') + '.mid';
    window.__lib.download(ns, filename);
  }


  // Descarga "lo que oyes" como Track portable (.magtrack)
  function onDownloadTrack() {
    if (!state.current) {
      alert('No hay nada para exportar.');
      return;
    }
    const name = (state.title?.trim() || 'export_mix');
    const trackLike = {
      ns: ensureNsMeta(state.current),
      name,
      program: 0,
      isDrum: false,
      preserveInstruments: true // importante: lo que oyes por-nota
    };
    const filename = `${name.replace(/[\/\\?%*:|"<>]/g,'-')}.magtrack`;
    window.__lib.downloadTrack(trackLike, filename);
  }


  function onToggleTrack(index) {
    const t = state.tracks[index];
    if (!t) return;
    t.isActive = !t.isActive;
    onTrackUpdate();
  }

  function onTrackUpdate() {
    let active = state.tracks
      .filter(t => t.isActive)
      .map(t => t.preserveInstruments
        ? ensureNsMeta(t.ns) // respeta program/isDrum por nota
        : setInstrument(t.ns, t.program ?? 0, t.isDrum ?? false)
      );

    if (active.length === 0) {
      try { player.stop(); } catch {}
      viz.render({ notes: [], totalTime: 0.001 }); // limpia sin romper el viz
      state.current = null;
      return;
    }

    active = toUniformGrid(active);
    const merged = active.length === 1 ? active[0] : merge(active);
    const ns = ensureNsMeta(merged);
    replaceMain(ns);
  }

  function onMergeTracks() {
    const { a, b } = state.concatSelection || {};
    let idxs = [];

    if (Number.isInteger(a) && Number.isInteger(b) && a !== b) {
      idxs = [a, b];
    } else {
      idxs = state.tracks.map((t, i) => (t.isActive ? i : -1)).filter(i => i >= 0);
    }
    if (idxs.length < 2) return;

    const arranged = idxs.map(i => {
      const t = state.tracks[i];
      return t.preserveInstruments
        ? ensureNsMeta(t.ns)
        : setInstrument(t.ns, t.program ?? 0, t.isDrum ?? false);
    });

    const combined = merge(arranged);
    loadTrack(ensureNsMeta(combined), {
      name: 'Unión (paralelo)',
      preserveInstruments: true
    });
    state.concatSelection = { a: null, b: null };
    onTrackUpdate();
  }

  // -------------------------------
  // Montaje de la app
  // -------------------------------
  function mount() {
    viz = new Roll(document.getElementById('visualizer'));
    player = new LoopingPlayer({ onPosition: (sec) => viz.updateCursor(sec) });

    bindTitleInput('#songTitle', state);
    buildTransport('#transport', player, state);

    // Cargar/descargar MIDI
    buildSaveLoad('#saveLoadPanel', state, onLoadTrackFile, onDownloadTrack);

    // Pistas
    buildTracks('#tracksPanel', state, {
      onMergeTracks,
      onTrackUpdate,
      onToggleTrack,
      onConcatenateTracks,
      onSelectForConcat,
      onClearConcatSelection
    });

    // Fachada global
    window.App = {
      mount,
      loadTrack,
      replaceMain,
      getState: () => state,
      selectForConcat: onSelectForConcat,
      clearConcatSelection: onClearConcatSelection,
      concatLastTwo,
      concatAB
    };
  }

  // -------------------------------
  // API principal
  // -------------------------------
  function loadTrack(
    ns,
    { name = 'Track', program = 0, isDrum = false, preserveInstruments = false } = {}
  ) {
    state.tracks.push({
      ns: ensureNsMeta(ns),
      name,
      program,
      isDrum,
      isActive: true,
      preserveInstruments
    });
    console.log(`Pista añadida: ${name} (programa ${program}, isDrum=${isDrum})`);
    console.log(state.tracks);
    onTrackUpdate();
  }

  function replaceMain(ns) {
    const safe = ensureNsMeta(ns);
    state.current = safe;
    viz.render(safe);
    player.start(safe, { qpm: state.qpm });
  }

  function onConcatenateTracks() {
    const { a, b } = state.concatSelection || {};
    try {
      if (Number.isInteger(a) && Number.isInteger(b) && a !== b) {
        const nameA = state.tracks[a]?.name || `Track ${a + 1}`;
        const nameB = state.tracks[b]?.name || `Track ${b + 1}`;
        return concatCreateNew([a, b], { label: `Concatenación ${nameA} + ${nameB}` });
      }
      const activeIdx = state.tracks
        .map((t, i) => (t.isActive ? i : -1))
        .filter(i => i >= 0);
      if (activeIdx.length >= 2) {
        return concatCreateNew(activeIdx, { label: 'Concatenación (activas)' });
      }
    } catch (err) {
      console.error('Error concatenando:', err);
      alert('No se pudo concatenar: ' + (err?.message || String(err)));
    }
  }

  function onSelectForConcat(index) {
    const sel = state.concatSelection || { a: null, b: null };
    if (!Number.isInteger(sel.a)) {
      sel.a = index;
    } else if (!Number.isInteger(sel.b) && index !== sel.a) {
      sel.b = index;
    } else if (index === sel.a) {
      sel.a = null;
    } else if (index === sel.b) {
      sel.b = null;
    } else {
      sel.a = sel.b;
      sel.b = index;
    }
    state.concatSelection = { ...sel };
    if (state.mergeAwaiting && Number.isInteger(sel.a) && Number.isInteger(sel.b) && sel.a !== sel.b) {
      const tA = state.tracks[sel.a];
      const tB = state.tracks[sel.b];
      if (tA?.ns && tB?.ns) {
       const arranged = [tA, tB].map(t =>
         t.preserveInstruments
           ? ensureNsMeta(t.ns)
           : setInstrument(t.ns, t.program ?? 0, t.isDrum ?? false)
       );
       const combined = merge(arranged);
       ;
        const nameA = tA.name || `Track ${sel.a + 1}`;
        const nameB = tB.name || `Track ${sel.b + 1}`;
        loadTrack(ensureNsMeta(combined), {
         name: `Unión ${nameA} + ${nameB}`,
         preserveInstruments: true
       })
      }
      state.mergeAwaiting = false;
      state.concatSelection = { a: null, b: null };
    }
    onTrackUpdate();
  }

  function onClearConcatSelection() {
    state.concatSelection = { a: null, b: null };
    state.mergeAwaiting = false;
    onTrackUpdate();
  }

  async function concatCreateNew(indexes, { label } = {}) {
    const seqs = indexes
      .map(i => {
        const t = state.tracks[i];
        if (!t?.ns) return null;
        // Si la pista ya preserva instrumentos, úsala tal cual.
        // Si no, fija program/isDrum según sus controles actuales.
        return t.preserveInstruments
          ? ensureNsMeta(t.ns)
          : setInstrument(t.ns, t.program ?? 0, t.isDrum ?? false);
      })
      .filter(Boolean);
    if (seqs.length < 2) return;

    const first = seqs[0];
    const qpm = first?.tempos?.[0]?.qpm ?? 120;
    const spq = first?.quantizationInfo?.stepsPerQuarter ?? 4;

    const ns = concatOnGrid(seqs, { qpm, spq, mm: window.mm });
    // MUY IMPORTANTE: preservar instrumentos por nota en la pista resultante
    loadTrack(ensureNsMeta(ns), {
      name: label || 'Concatenación',
      preserveInstruments: true
    });
  }

  function labelFromIndex(idx) {
    if (idx == null) return '—';
    return state.tracks[idx]?.name ?? `Pista ${idx + 1}`;
  }

  async function concatLastTwo() {
    if (state.tracks.length < 2) return;
    const idxA = state.tracks.length - 2;
    const idxB = state.tracks.length - 1;
    await concatCreateNew([idxA, idxB], { label: 'Concatenación (últimas 2)' });
  }

  async function concatAB() {
    const { a, b } = state.concatSelection;
    if (a == null || b == null) return;
    const label = `Concatenación ${labelFromIndex(a)} + ${labelFromIndex(b)}`;
    await concatCreateNew([a, b], { label });
    state.concatSelection = { a: null, b: null };
    onTrackUpdate(true);
  }

  return { mount, loadTrack, replaceMain, getState: () => state };
})();

window.addEventListener('DOMContentLoaded', () => {
  App.mount();
});
