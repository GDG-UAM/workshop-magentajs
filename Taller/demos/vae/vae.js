// File: Taller/demos/vae/vae.js
// Demo VAE para el taller.
// - Melody VAE: samplear, variaciones "similares", e interpolar entre A y B.
// - Trio VAE: samplear un trío y separarlo en 3 pistas.
// - Usa la misma UI genérica (App.*) y se monta dentro de #modelsPanel.
//
// ⬇️ Lo ÚNICO que tocarán los alumnos está marcado como "ZONA EDITABLE".

import { MelodyVaeService, TrioVaeService } from '../../lib/models/musicvae.js';
import { makeMajorScale } from '../../lib/models/baseline.js';
import { CHECKPOINTS, WORKSHOP } from '../../lib/config/constants.js';

export function setup({ app, panel }) {
  // ------------------------------------------------------------------
  // Marco visual
  // ------------------------------------------------------------------
  panel.innerHTML = '';
  const title = document.createElement('h4');
  title.textContent = 'Demo: VAE (Melody & Trio)';
  const help = document.createElement('p');
  help.innerHTML =
    'Melody VAE: samplear/variar/interpolar melodías. ' +
    'Trio VAE: genera una salida con bajo, batería y melodía (según checkpoint).';
  panel.appendChild(title);
  panel.appendChild(help);

  const mkBtn = (label) => { const b = document.createElement('button'); b.textContent = label; panel.appendChild(b); return b; };

  // ------------------------------------------------------------------
  // Parámetros globales del taller
  // ------------------------------------------------------------------
  const { QPM, SPQ } = WORKSHOP;

  // ------------------------------------------------------------------
  // ZONA EDITABLE (por los alumnos): instancias y “defaults”
  // ------------------------------------------------------------------
  const vaeMelody = new MelodyVaeService({
    checkpointURL: CHECKPOINTS.musicvae.melody, // p.ej. melody_4bar
    qpm: QPM,
    stepsPerQuarter: SPQ,
  });

  const vaeTrio = new TrioVaeService({
    checkpointURL: CHECKPOINTS.musicvae.trio,   // p.ej. trio_4bar
    qpm: QPM,
    stepsPerQuarter: SPQ,
  });

  const DEFAULT_TEMP = 0.9; // temperatura “agradable” para samples

  // ------------------------------------------------------------------
  // Estado local para INTERPOLACIÓN A ↔ B
  // ------------------------------------------------------------------
  let seedA = null;
  let seedB = null;

  // ------------------------------------------------------------------
  // Botones Melody VAE
  // ------------------------------------------------------------------
  const h2Mel = document.createElement('h5');
  h2Mel.textContent = 'Melody VAE';
  panel.appendChild(h2Mel);

  const btnPreMel = mkBtn('Pre-cargar Melody VAE');
  const btnSeed   = mkBtn('Semilla de ejemplo (Escala Mayor)');
  const btnSample = mkBtn('VAE: Samplear 1 melodía');
  const btnSimilar= mkBtn('VAE: Variar Actual (x4)');
  const btnSetA   = mkBtn('Guardar ACTUAL como A');
  const btnSetB   = mkBtn('Guardar ACTUAL como B');
  const btnInterp = mkBtn('Interpolar A→B (9 salidas)');

  // Preload
  btnPreMel.onclick = async () => {
    const prev = btnPreMel.textContent; btnPreMel.disabled = true; btnPreMel.textContent = 'Cargando… ⏳';
    try { await vaeMelody.initialize(); btnPreMel.textContent = 'Melody VAE listo ✅'; }
    catch (e) { console.error(e); alert('No se pudo cargar Melody VAE: ' + (e?.message || String(e))); btnPreMel.textContent = prev; btnPreMel.disabled = false; }
  };

  // Semilla ejemplo: Escala mayor real (Do, 1 octava), útil para “similar”/“interpolate”
  btnSeed.onclick = () => {
    const seed = makeMajorScale({ tonic: 60, octaves: 1, durBeats: 0.25, qpm: QPM });
    app.loadTrack(seed, { name: 'Semilla: Escala Mayor', program: 0 });
  };

  // Samplear
  btnSample.onclick = async () => {
    const prev = btnSample.textContent; btnSample.disabled = true; btnSample.textContent = 'Generando… 🧠';
    try {
      await vaeMelody.initialize();
      const [out] = await vaeMelody.sample(1, DEFAULT_TEMP);
      app.loadTrack(out, { name: 'Melody VAE (sample)', program: 0 });
    } catch (e) {
      console.error(e); alert('Error en sample VAE: ' + (e?.message || String(e)));
    } finally { btnSample.textContent = prev; btnSample.disabled = false; }
  };

  // Similar (variaciones de la actual)
  btnSimilar.onclick = async () => {
    const prev = btnSimilar.textContent; btnSimilar.disabled = true; btnSimilar.textContent = 'Variando… 🧠';
    try {
      await vaeMelody.initialize();
      const { current } = app.getState();
      if (!current || !current.notes?.length) { alert('Activa o crea primero una melodía.'); return; }
      const vars = await vaeMelody.similar(current, 4, 0.8, DEFAULT_TEMP);
      vars.forEach((ns, i) => app.loadTrack(ns, { name: `VAE similar #${i+1}`, program: 0 }));
    } catch (e) {
      console.error(e); alert('Error en similar VAE: ' + (e?.message || String(e)));
    } finally { btnSimilar.textContent = prev; btnSimilar.disabled = false; }
  };

  // Guardar actual como A / B para interpolar
  btnSetA.onclick = () => {
    const { current } = app.getState();
    if (!current || !current.notes?.length) { alert('No hay “actual” para guardar como A.'); return; }
    seedA = current;
    btnSetA.textContent = 'A ✔';
    setTimeout(() => btnSetA.textContent = 'Guardar ACTUAL como A', 900);
  };

  btnSetB.onclick = () => {
    const { current } = app.getState();
    if (!current || !current.notes?.length) { alert('No hay “actual” para guardar como B.'); return; }
    seedB = current;
    btnSetB.textContent = 'B ✔';
    setTimeout(() => btnSetB.textContent = 'Guardar ACTUAL como B', 900);
  };

  // Interpolar A→B
  btnInterp.onclick = async () => {
    const prev = btnInterp.textContent; btnInterp.disabled = true; btnInterp.textContent = 'Interpolando… 🧠';
    try {
      await vaeMelody.initialize();
      if (!seedA || !seedB) { alert('Guarda primero A y B (usa los botones de arriba).'); return; }
      // 9 salidas (incluye reconstrucciones de los extremos)
      const outs = await vaeMelody.interpolate([seedA, seedB], 9, 0.7);
      outs.forEach((ns, i) => app.loadTrack(ns, { name: `Interp #${i+1}`, program: 0 }));
      // Ponemos la central como “actual”
      const mid = outs[Math.floor(outs.length / 2)];
      if (mid) app.replaceMain(mid);
    } catch (e) {
      console.error(e); alert('Error en interpolate VAE: ' + (e?.message || String(e)));
    } finally { btnInterp.textContent = prev; btnInterp.disabled = false; }
  };

  // ------------------------------------------------------------------
  // Botones Trio VAE
  // ------------------------------------------------------------------
  const h2Trio = document.createElement('h5');
  h2Trio.style.marginTop = '1rem';
  h2Trio.textContent = 'Trio VAE';
  panel.appendChild(h2Trio);

  const btnPreTrio  = mkBtn('Pre-cargar Trio VAE');
  const btnSampleTr = mkBtn('VAE: Samplear 1 trío');

  btnPreTrio.onclick = async () => {
    const prev = btnPreTrio.textContent; btnPreTrio.disabled = true; btnPreTrio.textContent = 'Cargando… ⏳';
    try { await vaeTrio.initialize(); btnPreTrio.textContent = 'Trio VAE listo ✅'; }
    catch (e) { console.error(e); alert('No se pudo cargar Trio VAE: ' + (e?.message || String(e))); btnPreTrio.textContent = prev; btnPreTrio.disabled = false; }
  };

  btnSampleTr.onclick = async () => {
    const prev = btnSampleTr.textContent; btnSampleTr.disabled = true; btnSampleTr.textContent = 'Generando… 🧠';
    try {
      await vaeTrio.initialize();
      const [out] = await vaeTrio.sample(1, DEFAULT_TEMP);

      // Algunas implementaciones de TrioVaeService exponen splitIntoTracks()
      if (typeof vaeTrio.splitIntoTracks === 'function') {
        const parts = vaeTrio.splitIntoTracks(out);
        if (parts && parts.length) {
          parts.forEach(p => app.loadTrack(p.ns, { name: `Trio: ${p.name}`, program: p.program, isDrum: p.isDrum }));
        } else {
          app.loadTrack(out, { name: 'Trio (una pista)', program: 0 });
        }
      } else {
        app.loadTrack(out, { name: 'Trio (una pista)', program: 0 });
      }
    } catch (e) {
      console.error(e); alert('Error en Trio VAE: ' + (e?.message || String(e)));
    } finally { btnSampleTr.textContent = prev; btnSampleTr.disabled = false; }
  };

  // Pie de ayuda
  const foot = document.createElement('p');
  foot.style.marginTop = '0.5rem';
  foot.style.fontSize = '0.9em';
  foot.style.color = '#777';
  foot.innerHTML =
    'Consejos: para interpolar, guarda dos melodías como A y B (pueden ser sampleadas o creadas a mano). ' +
    'Para variaciones similares, activa una melodía y pulsa “Variar Actual”.';
  panel.appendChild(foot);
}
