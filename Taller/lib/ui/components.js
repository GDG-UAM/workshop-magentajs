// En: Taller/lib/ui/components.js

import { downloadMidi, fileToSequence } from '../core/midi.js';
import { trim, mergeFromState, setInstrument, quantize } from '../core/sequences.js';

window.__lib = { trim, download: downloadMidi, mergeFromState, setInstrument, quantize };

export function bindTitleInput(selector, state) {
  const el = document.querySelector(selector);
  el.addEventListener('input', () => state.title = el.value);
}

export function buildTransport(selector, player, state) {
    const root = document.querySelector(selector);
    root.innerHTML = `
        <button id="btnPlay">▶ Play</button>
        <button id="btnStop">■ Stop</button>
        <label>QPM <input id="qpm" type="number" value="${state.qpm}" min="40" max="220" step="1"></label>
    `;
    const btnPlay = root.querySelector('#btnPlay');
    btnPlay.onclick = async () => {
        if (!state.current) return;
        if (player.isPlaying()) {
            player.pause();
            btnPlay.textContent = '▶ Play';
        } else {
            await player.resumeOrStart(state.current, { qpm: state.qpm });
            btnPlay.textContent = '❚❚ Pause';
        }
    };
    root.querySelector('#btnStop').onclick = () => {
        player.stop();
        btnPlay.textContent = '▶ Play';
    };
    root.querySelector('#qpm').oninput = (e) => {
        state.qpm = +e.target.value;
        player.setQpm(state.qpm);
    };
}

export function buildTrim(selector, state, onApplyTrim) {
    const root = document.querySelector(selector);
    root.innerHTML = `
      <label>Inicio (s) <input id="trimStart" type="number" min="0" step="0.1" value="0"></label>
      <label>Fin (s) <input id="trimEnd" type="number" min="0" step="0.1" value="4"></label>
      <button id="btnAudition">♫ Escuchar fragmento</button>
      <button id="btnApplyTrim">✂ Aplicar recorte</button>
      <button id="btnRestore" style="display:none;">↩ Restaurar Original</button>
    `;
    root.querySelector('#btnAudition').onclick = () => {
        const startSec = +root.querySelector('#trimStart').value;
        const endSec = +root.querySelector('#trimEnd').value;
        onApplyTrim({ startSec, endSec, audition: true });
    };
    root.querySelector('#btnApplyTrim').onclick = () => {
        const startSec = +root.querySelector('#trimStart').value;
        const endSec = +root.querySelector('#trimEnd').value;
        onApplyTrim({ startSec, endSec, audition: false });
        root.querySelector('#btnRestore').style.display = 'inline-block';
    };
    root.querySelector('#btnRestore').onclick = (e) => {
        onApplyTrim({ restore: true });
        e.target.style.display = 'none';
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
        const file = e.target.files?.[0]; if (!file) return;
        const ns = await fileToSequence(file);
        onLoadSequence(ns);
    };
}

// --- LÍNEA CORREGIDA ---
// Añadimos 'onConcatenateTracks' como un parámetro que la función recibe.
export function buildTracks(selector, state, onMergeTracks, onTrackUpdate, onToggleTrack, onConcatenateTracks) {
  const root = document.querySelector(selector);

  const render = () => {
    root.innerHTML = `
      <div style="margin-bottom:.5rem; display:flex; gap:8px;">
        <button id="btnMerge">Unir (Paralelo)</button>
        <button id="btnConcat">Concatenar (Secuencial)</button>
      </div>
      <div id="tracksList"></div>
    `;
    root.querySelector('#btnMerge').onclick = () => onMergeTracks();
    // Ahora 'onConcatenateTracks' existe y está definido.
    root.querySelector('#btnConcat').onclick = () => onConcatenateTracks();

    const list = root.querySelector('#tracksList');
    state.tracks.forEach((t, i) => {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex; gap:.5rem; align-items:center; margin-bottom:.25rem;';
        row.innerHTML = `
        <input type="checkbox" data-idx="${i}" class="sel" ${t.isActive ? 'checked' : ''}>
        <span>${t.name ?? 'Track'}</span>
        <label>Prog<input type="number" min="0" max="127" value="${t.program ?? 0}" data-idx="${i}" class="pgm" style="width:4em"></label>
        <label>Drum<input type="checkbox" ${t.isDrum ? 'checked' : ''} data-idx="${i}" class="drm"></label>
        <button data-idx="${i}" class="del">🗑</button>
      `;
        list.appendChild(row);
    });

    list.querySelectorAll('.sel, .pgm, .drm, .del').forEach(el => {
        const i = +el.dataset.idx;
        if (el.classList.contains('sel')) {
            el.onchange = () => { onToggleTrack(i); };
        } else if (el.classList.contains('pgm')) {
            el.oninput = (e) => { state.tracks[i].program = +e.target.value; onTrackUpdate(); };
        } else if (el.classList.contains('drm')) {
            el.onchange = (e) => { state.tracks[i].isDrum = e.target.checked; onTrackUpdate(); };
        } else if (el.classList.contains('del')) {
            el.onclick = () => { state.tracks.splice(i, 1); onTrackUpdate(true); };
        }
    });
  };

  let trackStateSignature = '';
  const getStateSignature = (tracks) => JSON.stringify(tracks.map(t => ({...t, ns: null })));
  setInterval(() => {
    const newSignature = getStateSignature(state.tracks);
    if (newSignature !== trackStateSignature) {
      trackStateSignature = newSignature;
      render();
    }
  }, 100);
}