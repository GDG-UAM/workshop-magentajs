// En: Taller/generic/generic.js

import { LoopingPlayer } from '../lib/core/player.js';
import { Roll } from '../lib/core/visualize.js';
import { buildTransport, buildTrim, buildSaveLoad, buildTracks, bindTitleInput } from '../lib/ui/components.js';
import { mergeFromState, concatenate } from '../lib/core/sequences.js';

export const App = (() => {
  const state = {
    title: '',
    current: null,
    original: null,
    tracks: [],
    qpm: 120
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
    buildTracks('#tracksPanel', state, onMergeTracks, onTrackUpdate, onToggleTrack, onConcatenateTracks);

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
    if (state.tracks.length > 0) {
      // 1. Filtramos para quedarnos solo con las pistas activas
      const activeTracks = state.tracks.filter(t => t.isActive);
      // 2. Extraemos las NoteSequences de esas pistas
      const sequencesToConcat = activeTracks.map(t => t.ns);
      // 3. Usamos la función concatenate
      const finalSequence = concatenate(sequencesToConcat);
      replaceMain(finalSequence);
    }
  }

  function onLoadSequence(ns) {
    // ... (Esta función no necesita cambios)
     replaceMain(ns);
     state.tracks = [];
     onTrackUpdate();
  }

  function onDownload() {
    // ... (Esta función no necesita cambios)
    if(state.current) {
      window.__lib.download(state.current, (state.title || 'track') + '.mid'); 
    }
  }

  function onMergeTracks() {
    if (state.tracks.length > 0) {
      const merged = mergeFromState(state);
      replaceMain(merged);
    }
  }

  // --- NUEVA FUNCIÓN ---
  function onToggleTrack(trackIndex) {
    // Invierte el estado de la pista (si estaba activa, la desactiva y viceversa)
    state.tracks[trackIndex].isActive = !state.tracks[trackIndex].isActive;
    // Forzamos una actualización de la UI para que el checkbox se redibuje
    onTrackUpdate();
    // Opcional: si quieres que la música se actualice al instante al marcar/desmarcar
    onMergeTracks();
  }

  function onTrackUpdate(force = false) {
    // El observer se encargará de esto, pero podemos forzarlo si es necesario (ej: al borrar)
    if (force) {
      const tracksCopy = [...state.tracks];
      state.tracks.length = 0;
      Array.prototype.push.apply(state.tracks, tracksCopy);
    }
  }

  return { mount, loadTrack, replaceMain, getState: () => state };
})();

window.addEventListener('DOMContentLoaded', () => {
  App.mount();
});