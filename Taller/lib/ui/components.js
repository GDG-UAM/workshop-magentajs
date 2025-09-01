// Construye paneles de UI genéricos y expone utilidades comunes en window.__lib

import { downloadMidi, fileToSequence } from '../core/midi.js';
import { trim, mergeFromState, setInstrument, quantize } from '../core/sequences.js';

// ---------- Exponer utilidades a la UI genérica ----------
window.__lib = {
  trim,
  download: downloadMidi,
  mergeFromState,
  setInstrument,
  quantize
};

// ---------- Title (sencillo) ----------
export function bindTitleInput(selector, state) {
  const el = document.querySelector(selector);
  el.addEventListener('input', () => state.title = el.value);
}

// ---------- Transporte ----------
export function buildTransport(selector, player, state) {
  const root = document.querySelector(selector);
  root.innerHTML = `
    <button id="btnPlay">Play</button>
    <button id="btnPause">Pause</button>
    <button id="btnStop">Stop</button>
    <label>QPM <input id="qpm" type="number" value="${state.qpm}" min="40" max="220" step="1"></label>
    <label>Loop A <input id="loopA" type="number" value="0" step="0.1"></label>
    <label>Loop B <input id="loopB" type="number" value="" step="0.1" placeholder="(vacio = sin loop)"></label>
  `;
  root.querySelector('#btnPlay').onclick = () => player.start(state.current ?? { notes: [], totalTime: 0 }, { qpm: state.qpm });
  root.querySelector('#btnPause').onclick = () => player.pause();
  root.querySelector('#btnStop').onclick = () => player.stop();
  root.querySelector('#qpm').oninput = (e) => { state.qpm = +e.target.value; player.setQpm(state.qpm); };
  const applyLoop = () => {
    const a = +root.querySelector('#loopA').value || 0;
    const bRaw = root.querySelector('#loopB').value;
    const b = bRaw === '' ? null : +bRaw;
    player.setLoop(a, b);
  };
  root.querySelector('#loopA').onchange = applyLoop;
  root.querySelector('#loopB').onchange = applyLoop;
}

// ---------- Trim / Audición ----------
export function buildTrim(selector, state, onApplyTrim) {
  const root = document.querySelector(selector);
  root.innerHTML = `
    <label>Inicio (s) <input id="trimStart" type="number" min="0" step="0.1" value="0"></label>
    <label>Fin (s) <input id="trimEnd" type="number" min="0" step="0.1" value="4"></label>
    <button id="btnAudition">Escuchar solo fragmento</button>
    <button id="btnApplyTrim">Aplicar recorte</button>
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
  };
}

// ---------- Guardar / Cargar ----------
export function buildSaveLoad(selector, state, onLoadSequence, onDownload) {
  const root = document.querySelector(selector);
  root.innerHTML = `
    <button id="btnDownload">Descargar .mid</button>
    <input id="fileIn" type="file" accept=".mid,.midi" />
  `;
  root.querySelector('#btnDownload').onclick = () => onDownload();
  root.querySelector('#fileIn').onchange = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    const ns = await fileToSequence(file);
    onLoadSequence(ns);
  };
}

// ---------- Pistas (añadir/quitar, program, merge) ----------
export function buildTracks(selector, state, onMergeTracks) {
  const root = document.querySelector(selector);
  const render = () => {
    root.innerHTML = `
      <div style="margin-bottom:.5rem">
        <button id="btnMerge">Unir pistas → principal</button>
      </div>
      <div id="tracksList"></div>
    `;
    root.querySelector('#btnMerge').onclick = () => onMergeTracks();

    const list = root.querySelector('#tracksList');
    state.tracks.forEach((t, i) => {
      const row = document.createElement('div');
      row.style.display = 'flex';
      row.style.gap = '.5rem';
      row.style.alignItems = 'center';
      row.style.marginBottom = '.25rem';
      row.innerHTML = `
        <span>#${i+1} ${t.name ?? 'Track'}</span>
        <label>Program <input type="number" min="0" max="127" step="1" value="${t.program ?? 0}" data-idx="${i}" class="pgm"></label>
        <label>Drum <input type="checkbox" ${t.isDrum ? 'checked' : ''} data-idx="${i}" class="drm"></label>
        <button data-idx="${i}" class="del">🗑</button>
      `;
      list.appendChild(row);
    });

    list.querySelectorAll('.pgm').forEach(inp => {
      inp.oninput = (e) => { const i = +e.target.dataset.idx; state.tracks[i].program = +e.target.value; };
    });
    list.querySelectorAll('.drm').forEach(inp => {
      inp.onchange = (e) => { const i = +e.target.dataset.idx; state.tracks[i].isDrum = e.target.checked; };
    });
    list.querySelectorAll('.del').forEach(btn => {
      btn.onclick = (e) => {
        const i = +e.target.dataset.idx;
        state.tracks.splice(i, 1);
        render();
      };
    });
  };
  render();
}
