// Demo Baseline: generadores sin IA (escalas, arpegios, etc.)
import {
  makeScale,
  makeArpeggio,
  makeMajorScale,
  makeMelody,
  makeAbsoluteSequence
} from '../../lib/models/baseline.js';

import { WORKSHOP } from '../../lib/config/constants.js';

/**
 * setup(): el loader te llamará con { app, panel }.
 *  - app  = fachada global expuesta por generic.js (window.App)
 *  - panel= contenedor donde añadimos los botones de la demo
 *
 * 👉 En el taller, lo que harán los alumnos es EXACTAMENTE lo que hay dentro
 *    de cada .onclick: (1) crear una NoteSequence con makeX(), (2) app.loadTrack(...)
 */
export function setup({ app, panel } = {}) {
  console.log('[baseline demo] setup()');

  // Defensa extra por si el loader llamó demasiado pronto:
  app  = app  || window.App;
  panel = panel || document.getElementById('modelsPanel');

  if (!app || typeof app.loadTrack !== 'function') {
    console.error('[baseline demo] App no lista todavía.');
    return;
  }
  if (!panel) {
    console.error('[baseline demo] No encuentro #modelsPanel.');
    return;
  }

  // Limpiamos el panel (si venías de otra demo)
  panel.innerHTML = '';

  const { QPM } = WORKSHOP;

  // ------------------------------------------------------------------
  // 1) Escala aritmética (baseline)
  // ------------------------------------------------------------------
  const btnScale = document.createElement('button');
  btnScale.textContent = 'Baseline: Crear Escala (aritmética)';
  btnScale.onclick = () => {
    // 👇 Lo que harán los alumnos:
    const ns = makeScale({
      tonic: 60,        // C4
      length: 8,        // 8 notas
      step: 2,          // saltos de 2 semitonos (tono)
      durBeats: 0.25,   // semicorcheas
      qpm: QPM
    });
    app.loadTrack(ns, { name: 'Escala baseline' });
  };
  panel.appendChild(btnScale);

  // ------------------------------------------------------------------
  // 2) Arpegio
  // ------------------------------------------------------------------
  const btnArp = document.createElement('button');
  btnArp.textContent = 'Baseline: Crear Arpegio';
  btnArp.onclick = () => {
    const ns = makeArpeggio({
      chord: [60, 64, 67, 72], // C E G C
      cycles: 4,
      durBeats: 0.25,
      qpm: QPM
    });
    app.loadTrack(ns, { name: 'Arpegio baseline' });
  };
  panel.appendChild(btnArp);

  // ------------------------------------------------------------------
  // 3) Escala Mayor REAL (2-2-1-2-2-2-1)
  // ------------------------------------------------------------------
  const btnMajor = document.createElement('button');
  btnMajor.textContent = 'Baseline: Escala Mayor (real)';
  btnMajor.onclick = () => {
    const ns = makeMajorScale({ tonic: 60, octaves: 1, durBeats: 0.25, qpm: QPM });
    app.loadTrack(ns, { name: 'Escala Mayor (real)' });
  };
  panel.appendChild(btnMajor);

  // Separador visual
  panel.appendChild(document.createElement('hr'));

  // ------------------------------------------------------------------
  // 4) Melodía secuencial (lista de pitches)
  // ------------------------------------------------------------------
  const btnSeq = document.createElement('button');
  btnSeq.textContent = 'Baseline: Melodía (pitches secuenciales)';
  btnSeq.onclick = () => {
    const ns = makeMelody({
      pitches: [60, 62, 64, 65, 67, 69, 71, 72, 71, 69, 67, 65, 64, 62, 60],
      durBeats: 0.25,
      qpm: QPM
    });
    app.loadTrack(ns, { name: 'Melodía (secuencial)' });
  };
  panel.appendChild(btnSeq);

  // ------------------------------------------------------------------
  // 5) Secuencia absoluta (start/dur en beats)
  // ------------------------------------------------------------------
  const btnAbs = document.createElement('button');
  btnAbs.textContent = 'Baseline: Secuencia (tiempos absolutos)';
  btnAbs.onclick = () => {
    const ns = makeAbsoluteSequence({
      events: [
        { pitch: 60, startBeats: 0,   durBeats: 1   }, // C4, negra
        { pitch: 64, startBeats: 1,   durBeats: 0.5 }, // E4, corchea
        { pitch: 67, startBeats: 1.5, durBeats: 0.5 }, // G4, corchea
        // acorde en el beat 2
        { pitch: 60, startBeats: 2,   durBeats: 1   },
        { pitch: 64, startBeats: 2,   durBeats: 1   },
        { pitch: 67, startBeats: 2,   durBeats: 1   }
      ],
      qpm: QPM
    });
    app.loadTrack(ns, { name: 'Secuencia (absoluta)' });
  };
  panel.appendChild(btnAbs);

  // Carga algo de entrada para que se vea/escuche al abrir la demo
  const init = makeScale({ tonic: 60, length: 8, step: 2, durBeats: 0.25, qpm: QPM });
  app.loadTrack(init, { name: 'Demo inicial (escala)' });

  console.log('[baseline demo] listo ✅');
}
