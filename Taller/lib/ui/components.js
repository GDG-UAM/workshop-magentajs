// En: Taller/lib/ui/components.js

import { downloadMidi, fileToSequence } from '../core/midi.js';
import { mergeFromState, setInstrument, quantize } from '../core/sequences.js';

// Exponemos solo lo que sigue usándose en el resto de la app
window.__lib = {
  download: downloadMidi,
  mergeFromState,
  setInstrument,
  quantize,
};

export function bindTitleInput(selector, state) {
  const el = document.querySelector(selector);
  el.addEventListener('input', () => (state.title = el.value));
}

export function buildTransport(selector, player, state) {
  // Desbloqueo de audio en el primer gesto del usuario
  (function unlockAudioOnce() {
    const resume = async () => {
      try {
        if (window.Tone?.context?.state !== 'running') await window.Tone.start();
      } catch {}
      window.removeEventListener('pointerdown', resume, true);
      window.removeEventListener('keydown', resume, true);
    };
    window.addEventListener('pointerdown', resume, true);
    window.addEventListener('keydown', resume, true);
  })();

  const root = document.querySelector(selector);
  root.innerHTML = `
    <button id="btnPlay">▶ Play</button>
    <button id="btnStop">■ Stop</button>
  `;

  const btnPlay = root.querySelector('#btnPlay');
  btnPlay.onclick = async () => {
    if (!state.current) return;
    if (player.isPlaying()) {
      player.pause();
      btnPlay.textContent = '▶ Play';
    } else {
      try {
        if (window.Tone?.context?.state !== 'running') await window.Tone.start();
      } catch {}
      await player.resumeOrStart(state.current, { qpm: state.qpm });
      btnPlay.textContent = '❚❚ Pause';
    }
  };

  root.querySelector('#btnStop').onclick = () => {
    player.stop();
    btnPlay.textContent = '▶ Play';
  };
}

export function buildSaveLoad(selector, state, onLoadSequence, onDownload) {
  const root = document.querySelector(selector);
  root.innerHTML = `
    <button id="btnDownload">💾 Descargar .mid</button>
    <input id="fileIn" type="file" accept=".mid,.midi" />
  `;
  root.querySelector('#btnDownload').onclick = () => onDownload();
  root.querySelector('#fileIn').onchange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const ns = await fileToSequence(file);
    onLoadSequence(ns);
  };
}

function labelFromIndex(state, idx) {
  if (idx == null) return '—';
  return state.tracks[idx]?.name ?? `Pista ${idx + 1}`;
}

export function buildTracks(container, state, actions) {
  const {
    onMergeTracks,
    onTrackUpdate,
    onToggleTrack,
    onConcatenateTracks,
    onSelectForConcat,
    onClearConcatSelection,
  } = actions || {};

  const root = document.querySelector(container);

  const render = () => {
    root.innerHTML = `
      <div style="margin-bottom:.5rem; display:flex; gap:8px;">
        <button id="btnMerge">Unir (Paralelo)</button>
        <button id="btnConcat">Concatenar últimas 2 pistas</button>
      </div>
      <div id="concatUI" style="margin-bottom:.5rem; display:flex; gap:12px; align-items:center; flex-wrap: wrap;">
        <strong>Selecciona 2 pistas (A y B):</strong>
        <span>A: <em id="selA">${
          Number.isInteger(state.concatSelection?.a)
            ? (state.tracks[state.concatSelection.a]?.name || `Track ${state.concatSelection.a + 1}`)
            : '—'
        }</em></span>
        <span>B: <em id="selB">${
          Number.isInteger(state.concatSelection?.b)
            ? (state.tracks[state.concatSelection.b]?.name || `Track ${state.concatSelection.b + 1}`)
            : '—'
        }</em></span>
        <button id="btnConcatAB" ${
          Number.isInteger(state.concatSelection?.a) && Number.isInteger(state.concatSelection?.b)
            ? ''
            : 'disabled'
        }>Concatenar A+B</button>
        <button id="btnConcatClear">Limpiar selección</button>
      </div>
      <div id="tracksList"></div>
    `;

    root.querySelector('#btnMerge').onclick = () => onMergeTracks();
    root.querySelector('#btnConcat').onclick = () => onConcatenateTracks();
    root.querySelector('#btnConcatAB').onclick = () => onConcatenateTracks();
    root.querySelector('#btnConcatClear').onclick = () => onClearConcatSelection?.();

    const list = root.querySelector('#tracksList');
    state.tracks.forEach((t, i) => {
      const row = document.createElement('div');
      const isA = Number.isInteger(state.concatSelection?.a) && state.concatSelection.a === i;
      const isB = Number.isInteger(state.concatSelection?.b) && state.concatSelection.b === i;
      row.style.cssText =
        'display:flex; gap:.5rem; align-items:center; margin-bottom:.25rem; padding:.25rem .4rem; border-radius:4px;' +
        (isA || isB ? ` background:${isA ? '#e7f3ff' : '#fff4e6'};` : '');
      row.innerHTML = `
        <input type="checkbox" data-idx="${i}" class="sel" ${t.isActive ? 'checked' : ''}>
        <input type="text" data-idx="${i}" class="name" value="${(t.name ?? 'Track')
          .replace(/"/g, '&quot;')}" placeholder="Nombre de pista" style="width: 12rem;" />
        <label>Prog<input type="number" min="0" max="127" value="${
          t.program ?? 0
        }" data-idx="${i}" class="pgm" style="width:4em"></label>
        <label>Drum<input type="checkbox" ${t.isDrum ? 'checked' : ''} data-idx="${i}" class="drm"></label>
        <button data-idx="${i}" class="pick">Elegir</button>
        <button data-idx="${i}" class="del">🗑</button>
      `;
      list.appendChild(row);
    });

    list.querySelectorAll('.sel, .name, .pgm, .drm, .del, .pick').forEach((el) => {
      const i = +el.dataset.idx;
      if (el.classList.contains('sel')) {
        el.onchange = () => {
          onToggleTrack(i);
        };
      } else if (el.classList.contains('name')) {
        el.onblur = (e) => {
          state.tracks[i].name = e.target.value;
          onTrackUpdate();
        };
        el.onkeydown = (e) => {
          if (e.key === 'Enter') e.target.blur();
          if (e.key === 'Escape') {
            e.target.value = state.tracks[i].name ?? 'Track';
            e.target.blur();
          }
        };
      } else if (el.classList.contains('pgm')) {
        el.oninput = (e) => {
          state.tracks[i].program = +e.target.value;
          onTrackUpdate();
        };
      } else if (el.classList.contains('drm')) {
        el.onchange = (e) => {
          state.tracks[i].isDrum = e.target.checked;
          onTrackUpdate();
        };
      } else if (el.classList.contains('pick')) {
        el.onclick = () => {
          onSelectForConcat?.(i);
        };
      } else if (el.classList.contains('del')) {
        el.onclick = () => {
          state.tracks.splice(i, 1);
          onTrackUpdate(true);
        };
      }
    });
  };

  let trackStateSignature = '';
  const getStateSignature = () =>
    JSON.stringify({
      tracks: state.tracks.map((t) => ({ ...t, ns: null })),
      concat: state.concatSelection || { a: null, b: null },
    });

  setInterval(() => {
    const newSignature = getStateSignature();
    if (newSignature !== trackStateSignature) {
      trackStateSignature = newSignature;
      render();
    }
  }, 100);
}
