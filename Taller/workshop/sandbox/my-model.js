/*
Recuerda:
  - SPQ = steps por negra; QPM = negras por minuto.
  - 1 step (seg) = 60 / (QPM × SPQ).
*/

import { makeArpeggio, makeScale, makeMajorScale, makeMelody, makeAbsoluteSequence} from '../../lib/models/baseline.js';
// 1. Importamos las clases de los modelos de IA y las URLs de los checkpoints
import { MusicRnnService } from '../../lib/models/musicrnn.js';
import { MelodyVaeService, TrioVaeService } from '../../lib/models/musicvae.js';
import { CoconetService } from '../../lib/models/coconet.js';


import { CHECKPOINTS, WORKSHOP } from '../../lib/config/constants.js';

window.addEventListener('DOMContentLoaded', () => {
  console.log('DOM listo. Configurando todos los botones...');
  const modelsPanel = document.getElementById('modelsPanel');

  // CONSTANTES
  /*
  Para aumentar el tempo o la "resolución de la canción,
  modifica los valores de QPM y SPQ en el archivo constants.js.
  */
  const { QPM, SPQ } = WORKSHOP;

  // --- Botones de Melodías Simples (Baseline) ---
  const btnScale = document.createElement('button');
  const btnArpeggio = document.createElement('button');
  const btnMajor = document.createElement('button');
  const btnCustomMelody = document.createElement('button');
  const btnCustomAbs = document.createElement('button');

  // TODO: añadir botón de crear melodías a partir de notas aqui.

  btnScale.textContent = 'Crear Escala';
  btnArpeggio.textContent = 'Crear Arpegio';
  btnMajor.textContent = 'Crear Escala Mayor (real)';
  btnCustomMelody.textContent = 'Crear Melodía (pitches secuenciales)';
  btnCustomAbs.textContent = 'Crear Secuencia (tiempos absolutos)';

  modelsPanel.appendChild(btnScale);
  modelsPanel.appendChild(btnArpeggio);
  modelsPanel.appendChild(btnMajor);
  modelsPanel.appendChild(btnCustomMelody);
  modelsPanel.appendChild(btnCustomAbs);

  btnScale.onclick = () => {
    const miEscala = makeScale({ tonic: 50, length: 16, durBeats: 0.25, qpm: QPM });
    App.loadTrack(miEscala, { name: 'Mi Escala' });
  };

  btnArpeggio.onclick = () => {
    // Corregido: makeArpeggio usa 'chord' en lugar de 'tonic'
    const miArpegio = makeArpeggio({ chord: [50, 54, 57, 62], cycles: 4, durBeats: 0.25, qpm: QPM });
    App.loadTrack(miArpegio, { name: 'Mi Arpegio' });
  };

  btnMajor.onclick = () => {
    const ns = makeMajorScale({ tonic: 60, octaves: 1, durBeats: 0.25 }); // Do mayor, 1 octava
    App.loadTrack(ns, { name: 'Escala Mayor' });
  };

  btnCustomMelody.onclick = () => {
    const ns = makeMelody({
      pitches: [60, 62, 64, 65, 67, 69, 71, 72, 72, 71, 69, 67, 65, 64, 62, 60], // Do mayor ascendente
      durBeats: 0.25                              // semicorcheas
    });
    App.loadTrack(ns, { name: 'Melodía (secuencial)' });
  };

  btnCustomAbs.onclick = () => {
    const ns = makeAbsoluteSequence({
      events: [
        { pitch: 60, startBeats: 0,   durBeats: 1   }, // C4, negra
        { pitch: 64, startBeats: 1,   durBeats: 0.5 }, // E4, corchea
        { pitch: 67, startBeats: 1.5, durBeats: 0.5 }, // G4, corchea
        // Acorde en el beat 2 (C-E-G simultáneo, negras)
        { pitch: 60, startBeats: 2,   durBeats: 1   },
        { pitch: 64, startBeats: 2,   durBeats: 1   },
        { pitch: 67, startBeats: 2,   durBeats: 1   }
      ]
    });
    App.loadTrack(ns, { name: 'Secuencia (absoluta)' });
  };

  // Separador visual para los modelos de IA
  modelsPanel.appendChild(document.createElement('hr'));

  // --- 2. Instanciamos los modelos de IA  con QPM y SPQ del taller ---

  /*
  --IMPORTANTE--
  Tempo único del taller: QPM
  Resolución única del taller: SPQ
  */

  // 1) Instancias
  const rnnBasic = new MusicRnnService({
    checkpointURL: CHECKPOINTS.musicrnn.basic,
    qpm: QPM,
    stepsPerQuarter: SPQ,
  });
  const rnnMelody = new MusicRnnService({
    checkpointURL: CHECKPOINTS.musicrnn.melody,
    qpm: QPM,
    stepsPerQuarter: SPQ,
  });
  const vaeMelody = new MelodyVaeService({
  checkpointURL: CHECKPOINTS.musicvae.melody,
  qpm: QPM,
  stepsPerQuarter: SPQ
  });

  const vaeTrio = new TrioVaeService({
    checkpointURL: CHECKPOINTS.musicvae.trio,
    qpm: QPM,
    stepsPerQuarter: SPQ
  });

  // INFO DE COCO:
  // numIterations: más iteraciones → mejor coherencia (más lento).
  // temperature: más alto → más aleatorio/creativo.
  const coco = new CoconetService({
    checkpointURL: CHECKPOINTS.coconet.bach,
    qpm: QPM,
    stepsPerQuarter: SPQ,
    numIterations: 64,   // puedes exponerlo como slider si quieres
    temperature: 0.99
  });


  // --- Botones para MusicRNN (Continuar una melodía) ---
  async function runRnn(model, button, label, { steps = 64, temperature = 1.0 } = {}) {
    button.disabled = true;
    const prev = button.textContent;
    button.textContent = 'Generando... 🧠';
    try {
      await model.initialize();
      const { current } = App.getState();   // mezcla de pistas activas
      if (!current || !current.notes?.length) {
        alert('No hay mezcla activa. Activa una melodía o crea una escala/arpegio primero.');
        return;
      }
      const cont = await model.continue(current, { steps, temperature });
      App.loadTrack(cont, { name: `${label} (cont.)` });
    } catch (e) {
      console.error(`${label} error:`, e);
      alert(`Error en ${label}: ` + (e?.message || String(e)));
    } finally {
      button.textContent = prev;
      button.disabled = false;
    }
  };

  // --- Basic RNN ---

  // Botones para los dos RNNs
  const btnRnnBasic = document.createElement('button');
  btnRnnBasic.textContent = 'IA: Continuar (Basic RNN)';
  modelsPanel.appendChild(btnRnnBasic);
  btnRnnBasic.onclick = () => runRnn(rnnBasic, btnRnnBasic, 'Basic RNN', { steps: 64, temperature: 1.0 });

  const btnRnnMelody = document.createElement('button');
  btnRnnMelody.textContent = 'IA: Continuar (Melody RNN)';
  modelsPanel.appendChild(btnRnnMelody);
  btnRnnMelody.onclick = () => runRnn(rnnMelody, btnRnnMelody, 'Melody RNN', { steps: 64, temperature: 1.0 });

  // --- Melody VAE ---
  const btnVaeMelody = document.createElement('button');
  btnVaeMelody.textContent = 'VAE: Melody (4bar)';
  modelsPanel.appendChild(btnVaeMelody);

  btnVaeMelody.onclick = async () => {
    const prev = btnVaeMelody.textContent; btnVaeMelody.disabled = true;
    btnVaeMelody.textContent = 'Generando... 🧠';
    try {
      await vaeMelody.initialize();
      const [out] = await vaeMelody.sample(1, 0.9);
      App.loadTrack(out, { name: 'Melodía VAE' });
    } catch (e) {
      console.error('Error VAE (melody):', e);
      alert('Error (Melody VAE): ' + (e?.message || String(e)));
    } finally { btnVaeMelody.textContent = prev; btnVaeMelody.disabled = false; }
  };

  // --- Trio VAE ---
  const btnVaeTrio = document.createElement('button');
  btnVaeTrio.textContent = 'VAE: Trio (4bar)';
  modelsPanel.appendChild(btnVaeTrio);

  btnVaeTrio.onclick = async () => {
    const prev = btnVaeTrio.textContent; btnVaeTrio.disabled = true;
    btnVaeTrio.textContent = 'Generando... 🧠';
    try {
      await vaeTrio.initialize();
      const [out] = await vaeTrio.sample(1, 0.9);
      const parts = vaeTrio.splitIntoTracks(out);
      if (parts.length === 0) {
        App.loadTrack(out, { name: 'Trio (única pista)' });
      } else {
        parts.forEach(p => App.loadTrack(p.ns, {
          name: `Trio: ${p.name}`, program: p.program, isDrum: p.isDrum
        }));
      }
    } catch (e) {
      console.error('Error VAE (trio):', e);
      alert('Error (Trio VAE): ' + (e?.message || String(e)));
    } finally { btnVaeTrio.textContent = prev; btnVaeTrio.disabled = false; }
  };

  // --- Botón para Coconet (Rellenar acordes al estilo Bach) ---
  // Para mejores resultados con Coconet, te recomiendo activar solo una melodía monofónica antes de armonizar
  const btnCocoHarm = document.createElement('button');
  btnCocoHarm.textContent = 'IA: Armonizar 4 voces (Coconet)';
  modelsPanel.appendChild(btnCocoHarm);

  btnCocoHarm.onclick = async () => {
    btnCocoHarm.disabled = true;
    const prev = btnCocoHarm.textContent;
    btnCocoHarm.textContent = 'Armonizando… 🧠';

    try {
      await coco.initialize();
      const { current, tracks } = App.getState();

      // Semilla recomendada: la MEZCLA ACTIVA actual (monofónica si puedes).
      const seed = current || (tracks.length ? tracks[tracks.length - 1].ns : null);
      if (!seed || !(seed.notes?.length)) {
        alert('Primero crea/carga una MELODÍA (escala, arpegio, etc.) y actívala.');
        return;
      }

      const out = await coco.harmonize(seed, {
        temperature: 0.98,  // ajusta sabor
        numIterations: 64   // más = mejor y más lento
      });

      App.loadTrack(out, { name: 'Coconet – 4 voces' });
    } catch (e) {
      console.error('Coconet harmonize error:', e);
      alert('Error en Coconet: ' + (e?.message || String(e)));
    } finally {
      btnCocoHarm.textContent = prev;
      btnCocoHarm.disabled = false;
    }
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




  // Botón de concatenar eliminado: la concatenación ahora se realiza desde el panel de Pistas.
});