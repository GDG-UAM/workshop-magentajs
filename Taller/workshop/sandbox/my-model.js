/*
Recuerda: 
  - SPQ = steps por negra; QPM = negras por minuto.
  - 1 step (seg) = 60 / (QPM × SPQ).
*/

import { makeArpeggio, makeScale, makeMajorScale } from '../../lib/models/baseline.js';
// 1. Importamos las clases de los modelos de IA y las URLs de los checkpoints
import { MusicRnnService } from '../../lib/models/musicrnn.js';
import { MusicVaeService } from '../../lib/models/musicvae.js';
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
  const vae = new MusicVaeService({
    checkpointURL: CHECKPOINTS.musicvae.melody,
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

  // --- Botón para MusicVAE (Crear una melodía desde cero) ---
  const btnVae = document.createElement('button');
  btnVae.textContent = 'IA: Crear Melodía (VAE)';
  modelsPanel.appendChild(btnVae);

  btnVae.onclick = async () => {
    btnVae.textContent = 'Generando... 🧠';
    btnVae.disabled = true;


    try {
      await vae.initialize(); // Asegura que el modelo esté cargado
      // .sample(1) crea 1 melodía nueva y aleatoria
      const [melodiaNueva] = await vae.sample(1, 0.9);
      App.loadTrack(melodiaNueva, { name: 'Melodía VAE' });

    } catch(error){
      console.error('Error VAE:', error);
      alert('Error al generar con MusicVAE: ' + (error?.message || String(error)));
    } finally {
      btnVae.textContent = 'IA: Crear Melodía (VAE)';
      btnVae.disabled = false;
    }
  };

  // Botón de concatenar eliminado: la concatenación ahora se realiza desde el panel de Pistas.
});