// File: Taller/demos/all/all.js
// Demo “todo en uno” para el taller.
// Muestra controles de: Baseline, RNN (basic/melody), VAE (melody/trio) y Coconet.
// Reutiliza la UI genérica (window.App) ya montada por generic.js.

// ──────────────────────────────────────────────────────────────────────────────
// Imports
import { makeScale, makeArpeggio, makeMajorScale, makeMelody } from '../../lib/models/baseline.js';
import { MusicRnnService } from '../../lib/models/musicrnn.js';
import { MelodyVaeService, TrioVaeService } from '../../lib/models/musicvae.js';
import { CoconetService } from '../../lib/models/coconet.js';
import { CHECKPOINTS, WORKSHOP } from '../../lib/config/constants.js';

// ──────────────────────────────────────────────────────────────────────────────
// Utilidad para crear botones rápido
const mkBtn = (panel, label) => { const b = document.createElement('button'); b.textContent = label; panel.appendChild(b); return b; };
const setBusy = (btn, txt) => { btn.dataset.prev = btn.textContent; btn.textContent = txt; btn.disabled = true; };
const clearBusy = (btn) => { btn.textContent = btn.dataset.prev || btn.textContent; btn.disabled = false; };

// ──────────────────────────────────────────────────────────────────────────────
export function setup({ app, panel }) {
  panel.innerHTML = '';

  const { QPM, SPQ } = WORKSHOP;

  // Títulos/separadores bonitos
  const addH = (txt) => { const h = document.createElement('h4'); h.textContent = txt; h.style.marginTop = '1rem'; panel.appendChild(h); return h; };
  const addP = (html) => { const p = document.createElement('p'); p.innerHTML = html; p.style.color = '#666'; p.style.fontSize = '0.9em'; panel.appendChild(p); return p; };

  // ╭──────────────────────╮
  // │  BASELINE (sin IA)   │
  // ╰──────────────────────╯

  addH('Baseline (sin IA)');
  addP('Generadores simples para crear material de partida.');

  const btnScale    = mkBtn(panel, 'Escala aritmética');
  const btnMajor    = mkBtn(panel, 'Escala Mayor (real)');
  const btnArp      = mkBtn(panel, 'Arpegio (C–E–G–C)');
  const btnMelody   = mkBtn(panel, 'Melodía (pitches secuenciales)');

  btnScale.onclick = () => {
    const ns = makeScale({ tonic: 60, length: 16, durBeats: 0.25, qpm: QPM });
    app.loadTrack(ns, { name: 'Escala (aritm.)' });
  };
  btnMajor.onclick = () => {
    const ns = makeMajorScale({ tonic: 60, octaves: 1, durBeats: 0.25, qpm: QPM });
    app.loadTrack(ns, { name: 'Escala Mayor' });
  };
  btnArp.onclick = () => {
    const ns = makeArpeggio({ chord: [60, 64, 67, 72], cycles: 4, durBeats: 0.25, qpm: QPM });
    app.loadTrack(ns, { name: 'Arpegio C–E–G–C' });
  };
  btnMelody.onclick = () => {
    const ns = makeMelody({ pitches: [60,62,64,65,67,69,71,72, 71,69,67,65,64,62,60], durBeats: 0.25, qpm: QPM });
    app.loadTrack(ns, { name: 'Melodía (seq)' });
  };

  // ─────────────────────────── Rock Drums (Verse/Chorus) ───────────────────────────
  (() => {
    // Mapa GM para batería
    const DRUMS = {
      KICK: 36,
      SNARE: 38,
      HAT_C: 42,
      HAT_O: 46,
      CRASH: 49,
      RIDE: 51,
      TOM_HI: 50,
      TOM_MID: 47,
      TOM_LO: 45,
    };

    // Duraciones en beats ajustadas a tu rejilla (1 step = 1/SPQ beats)
    const STEP = 1 / SPQ;          // 1 semicorchea si SPQ=4
    const SHORT = STEP;            // duración mínima segura para evitar 0 steps
    const CYMB = STEP * 2;         // algo más largo para platos

    const BAR_LEN = 4;             // 4/4 → 4 beats por compás

    // Empuja un patrón (array de offsets en beats) repetido en un compás base
    function pushPattern(ev, pitch, barStart, offsets, durBeats, velocity = 100) {
      for (const off of offsets) {
        ev.push({ pitch, startBeats: barStart + off, durBeats, velocity });
      }
    }

    // Rellena eventos de una sección ("verse" | "chorus") a partir de un compás de inicio
    function addSectionEvents(ev, { section = 'verse', bars = 8, startBar = 0 }) {
      for (let b = 0; b < bars; b++) {
        const barStart = (startBar + b) * BAR_LEN;

        // Chapa principal: verso = hat cerrado a corcheas; estribillo = ride a corcheas
        const pulseOffsets = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5];
        const pulsePitch = section === 'verse' ? DRUMS.HAT_C : DRUMS.RIDE;
        pushPattern(ev, pulsePitch, barStart, pulseOffsets, SHORT, section === 'verse' ? 85 : 100);

        // Caja en 2 y 4 (beats 1 y 3 en base 0)
        pushPattern(ev, DRUMS.SNARE, barStart, [1, 3], SHORT, 115);

        // Bombo
        if (section === 'verse') {
          // Típico rock: 1 y 3 + pequeñas variaciones alternas
          const kick = [0, 2].concat((b % 2 === 1) ? [2.5] : [1.5]);
          pushPattern(ev, DRUMS.KICK, barStart, kick, SHORT, 120);
          // Apertura de charles al final del compás
          ev.push({ pitch: DRUMS.HAT_O, startBeats: barStart + 3.5, durBeats: CYMB, velocity: 105 });
        } else {
          // Estribillo: más empuje
          const kick = [0, 1.5, 2, 3.5];
          pushPattern(ev, DRUMS.KICK, barStart, kick, SHORT, 122);
        }

        // Crash al inicio de la sección
        if (b === 0) {
          ev.push({ pitch: DRUMS.CRASH, startBeats: barStart, durBeats: CYMB, velocity: 127 });
        }
      }

      // Fill sencillo de toms al final de la sección
      const lastBarStart = (startBar + bars - 1) * BAR_LEN;
      const fill = [
        { pitch: DRUMS.TOM_HI, startBeats: lastBarStart + 3.00, durBeats: SHORT, velocity: 116 },
        { pitch: DRUMS.TOM_MID, startBeats: lastBarStart + 3.25, durBeats: SHORT, velocity: 116 },
        { pitch: DRUMS.TOM_LO, startBeats: lastBarStart + 3.50, durBeats: SHORT, velocity: 116 },
      ];
      ev.push(...fill);
    }

    // Construye una NS de batería para una sección
    function makeRockDrumsSection(section = 'verse', bars = 8) {
      const events = [];
      addSectionEvents(events, { section, bars, startBar: 0 });
      const ns = makeAbsoluteSequence({ events, qpm: QPM });
      // Importante: marcar cada nota como batería
      ns.notes.forEach(n => n.isDrum = true);
      return ns;
    }

    // Construye una NS con estructura completa (por defecto: verso x8 + estribillo x8)
    function makeRockDrumsSong(structure = [['verse', 8], ['chorus', 8]]) {
      const events = [];
      let cursorBar = 0;
      for (const [section, bars] of structure) {
        addSectionEvents(events, { section, bars, startBar: cursorBar });
        cursorBar += bars;
      }
      const ns = makeAbsoluteSequence({ events, qpm: QPM });
      ns.notes.forEach(n => n.isDrum = true);
      return ns;
    }

    // ── Botones UI ──
    const btnDrumsVerse = document.createElement('button');
    btnDrumsVerse.textContent = 'Batería Rock – Verso';
    btnDrumsVerse.onclick = () => {
      const ns = makeRockDrumsSection('verse', 8);
      App.loadTrack(ns, { name: 'Batería: Verso (8 compases)', isDrum: true });
    };
    modelsPanel.appendChild(btnDrumsVerse);

    const btnDrumsChorus = document.createElement('button');
    btnDrumsChorus.textContent = 'Batería Rock – Estribillo';
    btnDrumsChorus.onclick = () => {
      const ns = makeRockDrumsSection('chorus', 8);
      App.loadTrack(ns, { name: 'Batería: Estribillo (8 compases)', isDrum: true });
    };
    modelsPanel.appendChild(btnDrumsChorus);

    const btnDrumsSong = document.createElement('button');
    btnDrumsSong.textContent = 'Batería Rock – Canción (Verse→Chorus)';
    btnDrumsSong.onclick = () => {
      // Cambia la estructura si quieres (p.ej. [['verse',8], ['chorus',8], ['verse',8], ['chorus',8]])
      const ns = makeRockDrumsSong([['verse', 8], ['chorus', 8]]);
      App.loadTrack(ns, { name: 'Batería: Verse→Chorus', isDrum: true });
    };
    modelsPanel.appendChild(btnDrumsSong);
  })();




  // ╭──────────────────────╮
  // │      RNN (IA)        │
  // ╰──────────────────────╯

  addH('RNN (continuar melodía)');
  addP('Elige un checkpoint y continúa la mezcla activa (mejor si es monofónica).');

  const rnnBasic  = new MusicRnnService({ checkpointURL: CHECKPOINTS.musicrnn.basic,  qpm: QPM, stepsPerQuarter: SPQ });
  const rnnMelody = new MusicRnnService({ checkpointURL: CHECKPOINTS.musicrnn.melody, qpm: QPM, stepsPerQuarter: SPQ });

  const btnPreRNN   = mkBtn(panel, 'Pre-cargar RNNs');
  const btnRnnBasic = mkBtn(panel, 'Continuar (Basic RNN)');
  const btnRnnMel   = mkBtn(panel, 'Continuar (Melody RNN)');

  btnPreRNN.onclick = async () => {
    setBusy(btnPreRNN, 'Cargando…');
    try { await Promise.all([rnnBasic.initialize(), rnnMelody.initialize()]); btnPreRNN.textContent = 'RNNs listos ✅'; }
    catch (e) { console.error(e); alert('No se pudo cargar RNN: ' + (e?.message || String(e))); clearBusy(btnPreRNN); }
  };

  const runRnn = async (model, label) => {
    const { current } = app.getState();
    if (!current || !current.notes?.length) { alert('Activa o crea una melodía primero.'); return; }
    await model.initialize();
    const cont = await model.continue(current, { steps: 64, temperature: 1.0 });
    app.loadTrack(cont, { name: `${label} (cont.)` });
  };

  btnRnnBasic.onclick = async () => { setBusy(btnRnnBasic,'Generando…'); try { await runRnn(rnnBasic, 'Basic RNN'); } catch(e){ alert(e.message||e);} finally{ clearBusy(btnRnnBasic);} };
  btnRnnMel.onclick   = async () => { setBusy(btnRnnMel,'Generando…');   try { await runRnn(rnnMelody,'Melody RNN'); } catch(e){ alert(e.message||e);} finally{ clearBusy(btnRnnMel);} };

  // ╭──────────────────────╮
  // │        VAE           │
  // ╰──────────────────────╯

  addH('VAE (sample / similar / interpolar / trío)');
  addP('Melody VAE para melodías; Trio VAE genera varias partes.');

  const vaeMelody = new MelodyVaeService({ checkpointURL: CHECKPOINTS.musicvae.melody, qpm: QPM, stepsPerQuarter: SPQ });
  const vaeTrio   = new TrioVaeService   ({ checkpointURL: CHECKPOINTS.musicvae.trio,   qpm: QPM, stepsPerQuarter: SPQ });
  const TEMP = 0.9;

  const btnPreVAE   = mkBtn(panel, 'Pre-cargar VAE');
  const btnSampleM  = mkBtn(panel, 'Melody VAE: Sample 1');
  const btnSimilarM = mkBtn(panel, 'Melody VAE: Variar Actual (x4)');
  const btnSetA     = mkBtn(panel, 'Guardar ACTUAL como A');
  const btnSetB     = mkBtn(panel, 'Guardar ACTUAL como B');
  const btnInterp   = mkBtn(panel, 'Interpolar A→B (9)');
  const btnSampleTr = mkBtn(panel, 'Trio VAE: Sample 1');

  let seedA = null, seedB = null;

  btnPreVAE.onclick = async () => {
    setBusy(btnPreVAE, 'Cargando…');
    try { await Promise.all([vaeMelody.initialize(), vaeTrio.initialize()]); btnPreVAE.textContent = 'VAE listo ✅'; }
    catch (e) { console.error(e); alert('No se pudo cargar VAE: ' + (e?.message || String(e))); clearBusy(btnPreVAE); }
  };

  btnSampleM.onclick = async () => {
    setBusy(btnSampleM,'Generando…');
    try { await vaeMelody.initialize(); const [out] = await vaeMelody.sample(1, TEMP); app.loadTrack(out, { name: 'Melody VAE (sample)' }); }
    catch(e){ console.error(e); alert('Error VAE (melody): '+(e?.message||String(e))); } finally{ clearBusy(btnSampleM); }
  };

  btnSimilarM.onclick = async () => {
    const { current } = app.getState(); if (!current || !current.notes?.length) { alert('Activa o crea una melodía primero.'); return; }
    setBusy(btnSimilarM,'Variando…');
    try { await vaeMelody.initialize(); const outs = await vaeMelody.similar(current, 4, 0.8, TEMP); outs.forEach((ns,i)=> app.loadTrack(ns,{ name:`VAE similar #${i+1}` })); }
    catch(e){ console.error(e); alert('Error en similar: '+(e?.message||String(e))); } finally{ clearBusy(btnSimilarM); }
  };

  btnSetA.onclick = () => { const { current } = app.getState(); if (!current) return alert('No hay “actual”.'); seedA = current; btnSetA.textContent = 'A ✔'; setTimeout(()=>btnSetA.textContent='Guardar ACTUAL como A',800); };
  btnSetB.onclick = () => { const { current } = app.getState(); if (!current) return alert('No hay “actual”.'); seedB = current; btnSetB.textContent = 'B ✔'; setTimeout(()=>btnSetB.textContent='Guardar ACTUAL como B',800); };

  btnInterp.onclick = async () => {
    if (!seedA || !seedB) return alert('Guarda primero A y B.');
    setBusy(btnInterp,'Interpolando…');
    try { await vaeMelody.initialize(); const outs = await vaeMelody.interpolate([seedA, seedB], 9, 0.7); outs.forEach((ns,i)=> app.loadTrack(ns,{ name:`Interp #${i+1}` })); app.replaceMain(outs[4] ?? outs[0]); }
    catch(e){ console.error(e); alert('Error en interpolate: '+(e?.message||String(e))); } finally{ clearBusy(btnInterp); }
  };

  btnSampleTr.onclick = async () => {
    setBusy(btnSampleTr,'Generando…');
    try {
      await vaeTrio.initialize();
      const [out] = await vaeTrio.sample(1, TEMP);
      if (typeof vaeTrio.splitIntoTracks === 'function') {
        const parts = vaeTrio.splitIntoTracks(out);
        (parts?.length ? parts : [{ ns: out, name: 'Trio (única)' }])
          .forEach(p => app.loadTrack(p.ns, { name: `Trio: ${p.name}`, program: p.program, isDrum: p.isDrm }));
      } else {
        app.loadTrack(out, { name: 'Trio (única pista)' });
      }
    } catch(e){ console.error(e); alert('Error VAE (trio): '+(e?.message||String(e))); } finally{ clearBusy(btnSampleTr); }
  };

  // ╭──────────────────────╮
  // │       COCONET        │
  // ╰──────────────────────╯

  addH('Coconet (armonizar 4 voces)');
  addP('Recomendado: semilla monofónica; p.ej., una escala mayor simple.');

  const coco = new CoconetService({ checkpointURL: CHECKPOINTS.coconet.bach, qpm: QPM, stepsPerQuarter: SPQ, numIterations: 64, temperature: 0.99 });

  const btnPreCoco  = mkBtn(panel, 'Pre-cargar Coconet');
  const btnSeedCo   = mkBtn(panel, 'Semilla: Escala Mayor');
  const btnHarm     = mkBtn(panel, 'Armonizar 4 voces');
  let lastSeed = null, lastHarm = null;
  btnShowSeed.disabled = btnShowHarm.disabled = true;

  btnPreCoco.onclick = async () => {
    setBusy(btnPreCoco,'Cargando…'); try { await coco.initialize(); btnPreCoco.textContent = 'Coconet listo ✅'; } catch(e){ console.error(e); alert('No se pudo cargar Coconet: '+(e?.message||String(e))); clearBusy(btnPreCoco); }
  };

  btnSeedCo.onclick = () => {
    lastSeed = makeMajorScale({ tonic: 60, octaves: 1, durBeats: 0.25, qpm: QPM });
    lastHarm = null;
    app.replaceMain(lastSeed);
    app.loadTrack(lastSeed, { name: 'Semilla (escala mayor)' });
    btnShowSeed.disabled = false;
    btnShowHarm.disabled = true;
  };

  btnHarm.onclick = async () => {
    const { current } = app.getState();
    if (!current || !current.notes?.length) return alert('Crea/activa una melodía primero (p.ej., la Semilla).');
    setBusy(btnHarm,'Armonizando…');
    try {
      await coco.initialize();
      lastSeed = current;
      lastHarm = await coco.harmonize(current, { numIterations: 64, temperature: 0.98 });
      app.loadTrack(lastHarm, { name: 'Coconet – 4 voces' });
      btnShowHarm.disabled = false; btnShowSeed.disabled = false;
    } catch(e){ console.error(e); alert('Error Coconet: '+(e?.message||String(e))); }
    finally { clearBusy(btnHarm); }
  };

  // Nota al pie
  addP('Tip: combina Baseline→RNN→VAE→Coconet. Usa “Unir (Paralelo)” o “Concatenar” desde el panel de pistas.');
}
