import { makeArpeggio, makeScale } from '../../lib/models/baseline.js';
// 1. Importamos las clases de los modelos de IA y las URLs de los checkpoints
import { MusicRnnService } from '../../lib/models/musicrnn.js';
import { MusicVaeService } from '../../lib/models/musicvae.js';
import { CHECKPOINTS } from '../../lib/config/constants.js';

window.addEventListener('DOMContentLoaded', () => {
  console.log('DOM listo. Configurando todos los botones...');
  const modelsPanel = document.getElementById('modelsPanel');

  // --- Botones de Melodías Simples (Baseline) ---
  const btnScale = document.createElement('button');
  const btnArpeggio = document.createElement('button');
  btnScale.textContent = 'Crear Escala';
  btnArpeggio.textContent = 'Crear Arpegio';
  modelsPanel.appendChild(btnScale);
  modelsPanel.appendChild(btnArpeggio);

  btnScale.onclick = () => {
    const miEscala = makeScale({ tonic: 50, length: 16, dur: 0.25 });
    App.loadTrack(miEscala, { name: 'Mi Escala' });
  };

  btnArpeggio.onclick = () => {
    // Corregido: makeArpeggio usa 'chord' en lugar de 'tonic'
    const miArpegio = makeArpeggio({ chord: [50, 54, 57, 62], cycles: 4, dur: 0.25 });
    App.loadTrack(miArpegio, { name: 'Mi Arpegio' });
  };

  // Separador visual para los modelos de IA
  modelsPanel.appendChild(document.createElement('hr'));

  // --- 2. Instanciamos los modelos de IA ---
  const rnn = new MusicRnnService({ checkpointURL: CHECKPOINTS.musicrnn.melody });
  const vae = new MusicVaeService({ checkpointURL: CHECKPOINTS.musicvae.melody });

  // --- Botón para MusicRNN (Continuar una melodía) ---
  const btnRnn = document.createElement('button');
  btnRnn.textContent = 'IA: Continuar Melodía (RNN)';
  modelsPanel.appendChild(btnRnn);

  btnRnn.onclick = async () => {
    btnRnn.textContent = 'Generando... 🧠';
    btnRnn.disabled = true;

    // MusicRNN necesita una "semilla" para empezar. Usemos la última pista activa.
    const state = App.getState();
    const lastTrack = state.tracks.length > 0 ? state.tracks[state.tracks.length - 1].ns : null;

    if (!lastTrack) {
        alert("Añade primero una pista (escala o arpegio) para que la IA la pueda continuar.");
        btnRnn.textContent = 'IA: Continuar Melodía (RNN)';
        btnRnn.disabled = false;
        return;
    }

    await rnn.initialize(); // Asegura que el modelo esté cargado
    const continuacion = await rnn.continue(lastTrack, { steps: 64, temperature: 1.1 });
    App.loadTrack(continuacion, { name: 'Continuación RNN' });

    btnRnn.textContent = 'IA: Continuar Melodía (RNN)';
    btnRnn.disabled = false;
  };

  // --- Botón para MusicVAE (Crear una melodía desde cero) ---
  const btnVae = document.createElement('button');
  btnVae.textContent = 'IA: Crear Melodía (VAE)';
  modelsPanel.appendChild(btnVae);

  btnVae.onclick = async () => {
    btnVae.textContent = 'Generando... 🧠';
    btnVae.disabled = true;

    await vae.initialize(); // Asegura que el modelo esté cargado
    // .sample(1) crea 1 melodía nueva y aleatoria
    const [melodiaNueva] = await vae.sample(1, 0.9);
    App.loadTrack(melodiaNueva, { name: 'Melodía VAE' });

    btnVae.textContent = 'IA: Crear Melodía (VAE)';
    btnVae.disabled = false;
  };
});