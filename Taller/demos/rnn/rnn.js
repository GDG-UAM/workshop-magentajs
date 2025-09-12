// File: Taller/demos/rnn/rnn.js
// Demo de MusicRNN (Magenta.js) para el taller.
// - Muestra dos checkpoints: "basic_rnn" y "melody_rnn".
// - Botón de precarga para evitar la latencia del primer click.
// - Botón de semilla de ejemplo (escala de Do) por si el panel está vacío.
// - Los alumnos SOLO tocan el bloque "ZONA EDITABLE" (instanciar modelos y crear botones).

import { MusicRnnService } from '../../lib/models/musicrnn.js';
import { CHECKPOINTS, WORKSHOP } from '../../lib/config/constants.js';

export function setup({ app, panel }) {
  // ------------------------------------------------------------
  // 0) Marco de la demo (texto e instrucciones)
  // ------------------------------------------------------------
  panel.innerHTML = '';
  const title = document.createElement('h4');
  title.textContent = 'Demo: MusicRNN (continuación de melodías)';
  const help = document.createElement('p');
  help.innerHTML =
    'Consejo: activa <em>una sola</em> pista monofónica como semilla. ' +
    'Si no tienes nada cargado, usa "Semilla de ejemplo".';
  panel.appendChild(title);
  panel.appendChild(help);

  // Utilidad para crear botones rápidos
  const mkBtn = (label) => {
    const b = document.createElement('button');
    b.textContent = label;
    panel.appendChild(b);
    return b;
  };

  // ------------------------------------------------------------
  // 1) Parámetros comunes del taller (tempo y cuadrícula)
  // ------------------------------------------------------------
  const { QPM, SPQ } = WORKSHOP;

  // ------------------------------------------------------------
  // 2) ZONA EDITABLE POR EL ALUMNO (instanciar modelos y crear botones)
  //    * Pueden duplicar este patrón para otros checkpoints de RNN.
  // ------------------------------------------------------------
  // Instancias de modelos (cada una con su checkpoint)
  const rnnBasic = new MusicRnnService({
    checkpointURL: CHECKPOINTS.musicrnn.basic, // basic_rnn
    qpm: QPM,
    stepsPerQuarter: SPQ,
  });
  const rnnMelody = new MusicRnnService({
    checkpointURL: CHECKPOINTS.musicrnn.melody, // melody_rnn
    qpm: QPM,
    stepsPerQuarter: SPQ,
  });

  // Botones de la demo
  const btnPreload   = mkBtn('Pre-cargar RNN (ambos)');
  const btnSeed      = mkBtn('Semilla de ejemplo (Do mayor)');
  const btnRnnBasic  = mkBtn('IA: Continuar (Basic RNN)');
  const btnRnnMelody = mkBtn('IA: Continuar (Melody RNN)');

  // ------------------------------------------------------------
  // 3) Lógica ya preparada (los alumnos no tienen que tocar)
  // ------------------------------------------------------------

  // Precarga ambos modelos (evita la latencia del primer uso)
  btnPreload.onclick = async () => {
    const prev = btnPreload.textContent;
    btnPreload.disabled = true;
    btnPreload.textContent = 'Cargando… ⏳';
    try {
      await Promise.all([rnnBasic.initialize(), rnnMelody.initialize()]);
      btnPreload.textContent = 'RNN listos ✅';
    } catch (e) {
      console.error('Preload RNN error:', e);
      alert('No se pudieron cargar los modelos RNN: ' + (e?.message || String(e)));
      btnPreload.textContent = prev;
      btnPreload.disabled = false;
    }
  };

  // Crea una semilla sencilla con la utilidad del propio servicio (Do mayor)
  btnSeed.onclick = () => {
    // C mayor ascendente (una nota cada 0.5 s). También podrías usar durBeats, etc.
    const seed = rnnMelody.makeSeedFromPitches(
      [60, 62, 64, 65, 67, 69, 71, 72], // C D E F G A B C
      0.5, // segundos por nota
      96
    );
    app.loadTrack(seed, { name: 'Semilla (C mayor)', program: 0 });
  };

  // Helper para ejecutar una continuación con un RNN concreto
  async function runRnn(model, button, label, { steps = 64, temperature = 1.0 } = {}) {
    const prev = button.textContent;
    button.disabled = true;
    button.textContent = 'Generando… 🧠';

    try {
      await model.initialize();

      // Semilla = mezcla activa que ya calcula generic.js (unifica SPQ/tempo/metadata)
      const { current } = app.getState();
      if (!current || !current.notes?.length) {
        alert('No hay semilla activa. Crea/activa una melodía o pulsa "Semilla de ejemplo".');
        return;
      }

      // Generar continuación (en pasos cuantizados)
      const cont = await model.continue(current, { steps, temperature });

      // Cargar como nueva pista
      app.loadTrack(cont, { name: `${label} (cont.)`, program: 0 });
    } catch (e) {
      console.error(`${label} error:`, e);
      alert(`Error en ${label}: ` + (e?.message || String(e)));
    } finally {
      button.textContent = prev;
      button.disabled = false;
    }
  }

  // Clicks de los dos RNN
  btnRnnBasic.onclick  = () => runRnn(rnnBasic,  btnRnnBasic,  'Basic RNN',  { steps: 64, temperature: 1.0 });
  btnRnnMelody.onclick = () => runRnn(rnnMelody, btnRnnMelody, 'Melody RNN', { steps: 64, temperature: 1.0 });

  // Nota de uso
  const foot = document.createElement('p');
  foot.style.marginTop = '0.5rem';
  foot.style.fontSize = '0.9em';
  foot.style.color = '#777';
  foot.innerHTML = 'Tip: prueba diferentes <em>steps</em> y <em>temperature</em> para variar la creatividad.';
  panel.appendChild(foot);
}
