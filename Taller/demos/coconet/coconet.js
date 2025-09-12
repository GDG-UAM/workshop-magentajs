// File: Taller/demos/coconet/coconet.js
// Demo de Coconet (armonización a 4 voces) para el taller.
//
// Qué muestra esta demo:
//  - Cómo precargar el modelo para evitar la latencia del primer uso.
//  - Cómo crear una semilla sencilla (ESCALA MAYOR REAL) como línea de soprano.
//  - Cómo llamar a coco.harmonize(seed) para obtener 4 voces.
//  - Un botón A/B para escuchar "antes" (semilla) y "después" (armonizado).
//
// Qué tocan los alumnos:
//  - SOLO la zona marcada como “ZONA EDITABLE”: instanciar CoconetService
//    con su checkpoint y (si quieren) cambiar hiperparámetros/labels/botones.

import { CoconetService } from '../../lib/models/coconet.js';
import { makeMajorScale } from '../../lib/models/baseline.js';
import { CHECKPOINTS, WORKSHOP } from '../../lib/config/constants.js';

export function setup({ app, panel }) {
  // ------------------------------------------------------------
  // 0) Marco visual
  // ------------------------------------------------------------
  panel.innerHTML = '';
  const title = document.createElement('h4');
  title.textContent = 'Demo: Coconet (armonización a 4 voces)';
  const help = document.createElement('p');
  help.innerHTML =
    '1) Crea una <em>semilla monofónica</em> (soprano). ' +
    '2) Pulsa “Armonizar” para obtener S/A/T/B. ' +
    '3) Usa “A/B” para oír antes ⇄ después.';
  panel.appendChild(title);
  panel.appendChild(help);

  const mkBtn = (label) => {
    const b = document.createElement('button');
    b.textContent = label;
    panel.appendChild(b);
    return b;
  };

  // ------------------------------------------------------------
  // 1) Parámetros del taller
  // ------------------------------------------------------------
  const { QPM, SPQ } = WORKSHOP;

  // ------------------------------------------------------------
  // 2) ZONA EDITABLE POR EL ALUMNO
  //    Instancia del modelo y (si se quiere) hiperparámetros por defecto.
  // ------------------------------------------------------------
  const coco = new CoconetService({
    checkpointURL: CHECKPOINTS.coconet.bach, // ← checkpoint Bach Coconet
    qpm: QPM,
    stepsPerQuarter: SPQ,
    numIterations: 64,   // más iteraciones = más coherente (y más lento)
    temperature: 0.99    // más alto = más aleatorio/creativo
  });

  // ------------------------------------------------------------
  // 3) Botones de la demo y estado local
  // ------------------------------------------------------------
  const btnPreload = mkBtn('Pre-cargar Coconet');
  const btnSeed    = mkBtn('Semilla: Escala Mayor (soprano)');
  const btnHarm    = mkBtn('IA: Armonizar 4 voces');
  const btnAB      = mkBtn('A/B: Semilla ⇄ Harmonizado');

  // Guardamos las últimas versiones para el A/B
  let lastSeed = null;       // NoteSequence monofónica
  let lastHarm = null;       // NoteSequence a 4 voces
  let abToggle = false;      // false = semilla, true = armonizado

  // ------------------------------------------------------------
  // 4) Lógica (no necesitan tocarla)
  // ------------------------------------------------------------

  // Precargar modelo
  btnPreload.onclick = async () => {
    const prev = btnPreload.textContent;
    btnPreload.disabled = true;
    btnPreload.textContent = 'Cargando… ⏳';
    try {
      await coco.initialize();
      btnPreload.textContent = 'Coconet listo ✅';
    } catch (e) {
      console.error('Preload Coconet error:', e);
      alert('No se pudo cargar Coconet: ' + (e?.message || String(e)));
      btnPreload.textContent = prev;
      btnPreload.disabled = false;
    }
  };

  // Semilla = ESCALA MAYOR REAL (Do mayor, 1 octava, semicorcheas)
  btnSeed.onclick = () => {
    lastSeed = makeMajorScale({
      tonic: 60,       // C4
      octaves: 1,
      durBeats: 0.25,  // semicorchea
      qpm: QPM
    });
    app.loadTrack(lastSeed, { name: 'Semilla (Escala mayor – Soprano)', program: 0 });
    // A/B vuelve a "antes"
    abToggle = false;
  };

  // Armonizar 4 voces con Coconet
  btnHarm.onclick = async () => {
    const prev = btnHarm.textContent;
    btnHarm.disabled = true;
    btnHarm.textContent = 'Armonizando… 🧠';

    try {
      await coco.initialize();

      // Semilla = si hay alguna en estado actual, úsala; si no, la que guardamos
      const { current } = app.getState();
      const seed = (current && current.notes?.length) ? current : lastSeed;

      if (!seed || !(seed.notes?.length)) {
        alert('Primero crea/activa una MELODÍA monofónica (pulsa “Semilla…” si quieres).');
        return;
      }

      // Generar armonización
      lastHarm = await coco.harmonize(seed, {
        temperature: 0.98,
        numIterations: 64
      });

      // Cargar como pista nueva (la UI la mostrará en la lista)
      app.loadTrack(lastHarm, { name: 'Coconet – 4 voces', program: 0 });

      // Ajustamos el A/B a "después"
      abToggle = true;
      app.replaceMain(lastHarm);
    } catch (e) {
      console.error('Coconet harmonize error:', e);
      alert('Error en Coconet: ' + (e?.message || String(e)));
    } finally {
      btnHarm.textContent = prev;
      btnHarm.disabled = false;
    }
  };

  // A/B: escuchar ANTES (semilla) ⇄ DESPUÉS (armonizado)
  btnAB.onclick = () => {
    if (!lastSeed || !lastSeed.notes?.length) {
      alert('No hay semilla disponible. Crea una con “Semilla: Escala Mayor”.');
      return;
    }
    if (!lastHarm || !lastHarm.notes?.length) {
      alert('Aún no hay “después”. Pulsa “Armonizar 4 voces” primero.');
      return;
    }
    abToggle = !abToggle;
    const which = abToggle ? lastHarm : lastSeed;
    app.replaceMain(which);
    btnAB.textContent = abToggle ? 'A/B: ← Volver a Semilla' : 'A/B: Ver Harmonizado →';
  };

  // Nota final
  const foot = document.createElement('p');
  foot.style.marginTop = '0.5rem';
  foot.style.fontSize = '0.9em';
  foot.style.color = '#777';
  foot.innerHTML =
    'Sugerencia: usa semillas simples (monofónicas) para resultados limpios. ' +
    'Coconet completa Alto/Tenor/Bajo desde la línea de soprano.';
  panel.appendChild(foot);
}
