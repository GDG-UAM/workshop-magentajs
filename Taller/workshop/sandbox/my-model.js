/*
Recuerda: 
  - SPQ = steps por negra; QPM = negras por minuto.
  - 1 step (seg) = 60 / (QPM × SPQ).
*/

import { makeArpeggio, makeScale, makeMajorScale } from '../../lib/models/baseline.js';
// 1. Importamos las clases de los modelos de IA y las URLs de los checkpoints
import { MusicRnnService } from '../../lib/models/musicrnn.js';
import { MelodyVaeService, TrioVaeService } from '../../lib/models/musicvae.js';


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

  // TODO: añadir botón de crear melodías a partir de notas aqui.

  btnScale.textContent = 'Crear Escala';
  btnArpeggio.textContent = 'Crear Arpegio';
  btnMajor.textContent = 'Crear Escala Mayor (real)';
  modelsPanel.appendChild(btnScale);
  modelsPanel.appendChild(btnArpeggio);
  modelsPanel.appendChild(btnMajor);

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

  // Separador visual para los modelos de IA
  modelsPanel.appendChild(document.createElement('hr'));

  // --- 2. Instanciamos los modelos de IA  con QPM y SPQ del taller ---

  /*
  --IMPORTANTE--
  Tempo único del taller: QPM
  Resolución única del taller: SPQ
  */
  const rnn = new MusicRnnService({
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

  // --- Botón para MusicRNN (Continuar una melodía) ---
  const btnRnn = document.createElement('button');
  btnRnn.textContent = 'IA: Continuar Melodía (RNN)';
  modelsPanel.appendChild(btnRnn);

  btnRnn.onclick = async () => {
    btnRnn.textContent = 'Generando... 🧠';
    btnRnn.disabled = true;

    try {
    await rnn.initialize(); // Asegura que el modelo esté cargado
    const { current } = App.getState();   // ← mezcla activa ya unificada por generic.js
    if (!current || !current.notes?.length) {
      alert('No hay mezcla activa. Activa pistas o crea una escala/arpegio primero.');
      return;
    }

    const cont = await rnn.continue(current, { steps: 64, temperature: 1.0 });
    App.loadTrack(cont, { name: 'Continuación RNN (mezcla activa)' });

    } catch (error) {
        console.error('Error RNN:', error);
        alert('Error al generar con MusicRNN: ' + (error?.message || String(error)));
    } finally {
      btnRnn.textContent = 'IA: Continuar Melodía (RNN)';
      btnRnn.disabled = false;
    }
  };

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

  // Botón de concatenar eliminado: la concatenación ahora se realiza desde el panel de Pistas.
});