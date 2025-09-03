// En: Taller/generic/generic.js

import { LoopingPlayer } from '../lib/core/player.js';
import { Roll } from '../lib/core/visualize.js';
import { buildTransport, buildTrim, buildSaveLoad, buildTracks, bindTitleInput } from '../lib/ui/components.js';
import { mergeFromState, concatenate, merge, setInstrument } from '../lib/core/sequences.js';
import { concatOnGrid } from '../lib/core/concat.js';

export const App = (() => {
  // Estado: añadir selección A/B
  const state = {
    title: '',
    current: null,
    original: null,
    tracks: [],
    qpm: 120,
    // Selección de pistas (A/B) para acciones de dos pistas
    concatSelection: { a: null, b: null },
    // Si true, al seleccionar A y B se unirá en paralelo automáticamente
    mergeAwaiting: false
  };
  let player, viz;

  function mount() {
    viz = new Roll(document.getElementById('visualizer'));
    player = new LoopingPlayer({ onPosition: (sec) => viz.updateCursor(sec) });

    bindTitleInput('#songTitle', state);
    buildTransport('#transport', player, state);
    buildTrim('#trimPanel', state, onApplyTrim);
    buildSaveLoad('#saveLoadPanel', state, onLoadSequence, onDownload);
    // Pasamos la nueva función onToggleTrack a la UI
    buildTracks(
      '#tracksPanel',
      state,
      onMergeTracks,
      onTrackUpdate,
      onToggleTrack,
      onConcatenateTracks,
      onSelectForConcat,
      onClearConcatSelection
    );

    window.App = { mount, loadTrack, replaceMain, getState: () => state };
  }

  // --- FUNCIÓN MODIFICADA ---
  function loadTrack(ns, { name = 'Track', program = 0, isDrum = false } = {}) {
    // Al añadir una pista, la marcamos como activa por defecto
    state.tracks.push({ ns, name, program, isDrum, isActive: true });
    onTrackUpdate();
  }
  
  function replaceMain(ns) {
    state.current = ns;
    state.original = ns;
    viz.render(ns);
    player.start(ns, { qpm: state.qpm });
  }

  function onApplyTrim({ startSec, endSec, audition = false, restore = false }) {
    // ... (Esta función no necesita cambios)
    if (restore) {
      if (state.original) replaceMain(state.original);
      return;
    }
    const source = state.current || state.original;
    if (!source) return;
    const trimmedNs = window.__lib.trim(source, startSec, endSec);
    if (audition) {
      const auditionPlayer = new LoopingPlayer({});
      auditionPlayer.start(trimmedNs, { qpm: state.qpm });
    } else {
      state.current = trimmedNs;
      viz.render(trimmedNs);
      player.start(trimmedNs, { qpm: state.qpm });
    }
  }

  function onConcatenateTracks() {
    // Usa A+B si están seleccionadas; si no, concatena las activas
    const { a, b } = state.concatSelection || {};
    try {
      if (Number.isInteger(a) && Number.isInteger(b) && a !== b) {
        const nameA = state.tracks[a]?.name || `Track ${a + 1}`;
        const nameB = state.tracks[b]?.name || `Track ${b + 1}`;
        // Reutiliza el helper que añade una pista nueva
        return concatCreateNew([a, b], { label: `Concatenación ${nameA} + ${nameB}` });
      }
      // Fallback: concatenar todas las pistas activas en orden
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
    // Selecciona primero A, luego B. Si A y B ocupados, reinicia con A=index
    const sel = state.concatSelection || { a: null, b: null };
    if (!Number.isInteger(sel.a)) {
      sel.a = index;
    } else if (!Number.isInteger(sel.b) && index !== sel.a) {
      sel.b = index;
    } else if (index === sel.a) {
      // Toggle A
      sel.a = null;
    } else if (index === sel.b) {
      // Toggle B
      sel.b = null;
    } else {
      // Ambos ocupados y clic en otro -> desplazar: A = B actual, B = nuevo
      sel.a = sel.b;
      sel.b = index;
    }
    state.concatSelection = { ...sel };
    // Si estamos esperando unión y A/B están listos, ejecutar unión inmediata
    if (state.mergeAwaiting && Number.isInteger(sel.a) && Number.isInteger(sel.b) && sel.a !== sel.b) {
      const tA = state.tracks[sel.a];
      const tB = state.tracks[sel.b];
      if (tA?.ns && tB?.ns) {
        const arranged = [tA, tB].map(t => setInstrument(t.ns, t.program ?? 0, t.isDrum ?? false));
        const combined = merge(arranged);
        const nameA = tA.name || `Track ${sel.a + 1}`;
        const nameB = tB.name || `Track ${sel.b + 1}`;
        loadTrack(combined, { name: `Unión ${nameA} + ${nameB}` });
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

  // Helper: concatena en cuadrícula y añade nueva pista
  async function concatCreateNew(indexes, { label } = {}) {
    const seqs = indexes.map(i => state.tracks[i]?.ns).filter(Boolean);
    if (seqs.length < 2) return;

    const first = seqs[0];
    const qpm = first?.tempos?.[0]?.qpm ?? 120;
    const spq = first?.quantizationInfo?.stepsPerQuarter ?? 4;

    const ns = concatOnGrid(seqs, { qpm, spq, mm: window.mm });

    // Reutiliza loadTrack para añadir la nueva pista
    loadTrack(ns, { name: label || 'Concatenación' });
    // loadTrack ya llama a onTrackUpdate()
  }

  // --- Helpers opcionales (si los usas en la UI), actualizados para refrescar correctamente ---
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

  const actions = {
    loadTrack,
    replaceMain,
    selectForConcat,
    clearConcatSelection,
    concatLastTwo,
    concatAB
  };

  return { mount, loadTrack, replaceMain, getState: () => state };
})();

window.addEventListener('DOMContentLoaded', () => {
  App.mount();
});