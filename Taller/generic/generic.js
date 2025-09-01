// App genérica: orquesta visualizador, player y paneles.
// Los equipos solo tienen que: generar un NoteSequence y llamar a
//   App.loadTrack(ns, { name, program, isDrum })
// o  App.replaceMain(ns)

import { LoopingPlayer } from '../lib/core/player.js';
import { Roll } from '../lib/core/visualize.js';
import { buildTransport, buildTrim, buildSaveLoad, buildTracks, bindTitleInput } from '../lib/ui/components.js';
import { mergeFromState } from '../lib/core/sequences.js';

export const App = (() => {
  const state = { title: '', current: null, tracks: [], qpm: 120 };
  let player, viz;

  function mount() {
    viz = new Roll(document.getElementById('visualizer'));
    player = new LoopingPlayer({ onPosition: (sec) => viz.updateCursor(sec) });

    bindTitleInput('#songTitle', state);
    buildTransport('#transport', player, state);
    buildTrim('#trimPanel', state, onApplyTrim);
    buildSaveLoad('#saveLoadPanel', state, onLoadSequence, onDownload);
    buildTracks('#tracksPanel', state, onMergeTracks);

    window.App = { mount, loadTrack, replaceMain, getState: () => state };
  }

  function loadTrack(ns, { name = 'Track', program = 0, isDrum = false } = {}) {
    state.tracks.push({ ns, name, program, isDrum });
    replaceMain(mergeFromState(state));
  }

  function replaceMain(ns) {
    state.current = ns;
    viz.render(ns);
    player.stop();
    player.start(ns, { qpm: state.qpm });
  }

  function onApplyTrim({ startSec, endSec }) {
    const ns = window.__lib.trim(state.current, startSec, endSec);
    replaceMain(ns);
  }

  function onLoadSequence(ns) { loadTrack(ns, { name: 'Cargado .mid' }); }
  function onDownload() { window.__lib.download(state.current, (state.title || 'track') + '.mid'); }
  function onMergeTracks() { replaceMain(mergeFromState(state)); }

  return { mount, loadTrack, replaceMain, getState: () => state };
})();
window.addEventListener('DOMContentLoaded', () => App.mount());
