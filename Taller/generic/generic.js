// En: Taller/generic/generic.js

import { LoopingPlayer } from '../lib/core/player.js';
import { Roll } from '../lib/core/visualize.js';
import { buildTransport, buildTrim, buildSaveLoad, buildTracks, bindTitleInput } from '../lib/ui/components.js';
import { mergeFromState, concatenate, merge, setInstrument } from '../lib/core/sequences.js';
import { concatOnGrid } from '../lib/core/concat.js';

// SPQ (Steps Per Quarter) = número de subdivisiones (steps) en una negra.
// QPM (Quarter notes Per Minute) = número de negras por minuto (tempo).

export const App = (() => {
  // Estado: añadir selección A/B
  const state = {
    title: '',
    // current/original: lo que se está mostrando/reproduciendo ahora y la copia base (para restaurar tras un trim).
    // Trim = recortar un fragmento temporal de una NoteSequence, usando un rango [startSec, endSec).
    current: null, // La secuencia de notas que se está reproduciendo o visualizando actualmente. Suele ser una mezcla de las pistas activas.
    original: null,
    tracks: [], // Un array que almacena todas las pistas de música que se han generado o cargado 
    // track = [{ ns, name, program, isDrum, isActive }]
    qpm: 120,
    // Selección de pistas (A/B) para acciones de dos pistas
    concatSelection: { a: null, b: null },
    // Si true, al seleccionar A y B se unirá en paralelo automáticamente
    mergeAwaiting: false
  };

  // Son singletons: player, viz. Esto significa que solo hay una instancia de cada uno en toda la aplicación (un único reproductor y un único visualizador coordinados).
  let player, viz;

  // Normalizacion de cuadrícula
  function toUniformGrid(seqs) {
    // Si alguna secuencia está cuantizada, usamos su SPQ como referencia
    let spq = null;
    for (const s of seqs) {
      const steps = s?.quantizationInfo?.stepsPerQuarter;
      if (Number.isInteger(steps) && steps > 0) { spq = steps; break; }
    }
    if (!spq) return seqs; // ninguna cuantizada → no tocamos nada

    const mm = window.mm;
    const qpmFallback = (seqs.find(s => s?.tempos?.length)?.tempos?.[0]?.qpm) ?? 120;

    return seqs.map(s => {
      // cur = SPQ actual de s (si existe).
      const cur = s?.quantizationInfo?.stepsPerQuarter;
      try {
        if (!cur) {
          // no cuantizada → cuantizar directo
          return window.__lib.quantize(s, spq);
        }
        if (cur === spq) return s; // ya ok
        // distinta cuadrícula → des-cuantizar y re-cuantizar
        const qpm = s?.tempos?.[0]?.qpm ?? qpmFallback;
        const unq = mm.sequences.unquantizeSequence(s, qpm);
        return mm.sequences.quantizeNoteSequence(unq, spq);
      } catch {
        return s; // ante cualquier error, no romper
      }
    });
  }

function ensureNsMeta(ns) {
  const copy = window.mm?.sequences?.clone
    ? window.mm.sequences.clone(ns)
    : JSON.parse(JSON.stringify(ns));

  const notes = copy.notes || [];

  // 1) totalTime (si hay tiempos en segundos)
  if (copy.totalTime == null) {
    const maxEnd = notes.reduce((mx, n) => Math.max(mx, n.endTime ?? 0), 0);
    if (maxEnd > 0) copy.totalTime = maxEnd;
  }

  // 2) totalQuantizedSteps (aunque falte quantizationInfo)
  const maxQStep = notes.reduce(
    (mx, n) => Math.max(mx, n.quantizedEndStep ?? n.quantizedStartStep ?? 0),
    0
  );
  if (maxQStep > 0 && copy.totalQuantizedSteps == null) {
    copy.totalQuantizedSteps = maxQStep;
    // Asegura quantizationInfo si falta (SPQ por defecto = 4)
    if (!copy.quantizationInfo || !copy.quantizationInfo.stepsPerQuarter) {
      copy.quantizationInfo = { stepsPerQuarter: 4 };
    }
  }

  // 3) tempos mínimo
  if (!copy.tempos || copy.tempos.length === 0) {
    copy.tempos = [{ time: 0, qpm: 120 }];
  }

  return copy;
}



  // --- Handlers requeridos por la UI ---

  function onLoadSequence(ns, meta = {}) {
    const name = meta.name || 'Importado';
    const program = meta.program ?? 0;
    const isDrum = !!meta.isDrum;
    loadTrack(ns, { name, program, isDrum });
  }

  function onDownload() {
    // Prepara una NoteSequence con todas las pistas activas (unidas en paralelo)
    const active = state.tracks
      .filter(t => t.isActive)
      .map(t => setInstrument(t.ns, t.program ?? 0, t.isDrum ?? false));

    if (active.length === 0) {
      alert('No hay pistas activas para descargar.');
      return;
    }
    // Si solo hay una pista activa, la usa tal cual.
    // Si hay varias, las une en paralelo usando la función merge.
    const ns = active.length === 1 ? active[0] : merge(active);
    const filename = (state.title?.trim() || 'magenta_sandbox') + '.mid';
    window.__lib.download(ns, filename);
  }

  function onToggleTrack(index) {
    // Permite activar o desactivar una pista musical en la lista de pistas de la aplicación. Es decir, alterna el estado de una pista entre "activa" y "inactiva".
    const t = state.tracks[index]; // Obtener la pista correspondiente
    if (!t) return; // Si no existe la pista (por ejemplo, el índice es incorrecto), termina la función y no hace nada.
    t.isActive = !t.isActive;
    onTrackUpdate();
  }

  /* Actualiza la pista activa
    - Si no hay pistas activas, detiene la reproducción y limpia el visualizador
    - Si hay pistas activas, garantiza los metadatos y llama a replaceMain()
    para reproducir y visualizar
  */
  function onTrackUpdate() {
      let active = state.tracks
        .filter(t => t.isActive)
        .map(t => setInstrument(t.ns, t.program ?? 0, t.isDrum ?? false));

    if (active.length === 0) {
      try { player.stop(); } catch {}
      viz.render({ notes: [], totalTime: 0 }); // limpia el visualizador
      state.current = null;
      return;
    }

    active = toUniformGrid(active); // unificar SPQ si aplica
    const merged = active.length === 1 ? active[0] : merge(active);
    const ns = ensureNsMeta(merged); // garantizamos los campos
    replaceMain(ns); // hace render + play con QPM actual
  }

  /*
    Une las pistas seleccionadas A y B en paralelo, creando una nueva pista.
    Si no hay A y B seleccionadas, une todas las pistas activas. <- (Jose): No es cierto, no hace nada // TO DO 
    Si hay menos de 2 pistas para unir, no hace nada.
  */
  function onMergeTracks() {
    const { a, b } = state.concatSelection || {};
    let idxs = [];

    if (Number.isInteger(a) && Number.isInteger(b) && a !== b) {
      idxs = [a, b];
    } else {
      idxs = state.tracks.map((t, i) => (t.isActive ? i : -1)).filter(i => i >= 0);
    }
    if (idxs.length < 2) return;

    const arranged = idxs.map(i => {
      const t = state.tracks[i];
      return setInstrument(t.ns, t.program ?? 0, t.isDrum ?? false);
    });

    // Ejemplo:
    // idxs = [0, 2] (índices de pistas activas)
    // arranged = [setInstrument(pista0), setInstrument(pista2)]

    const combined = merge(arranged); // Une en paralelo
    loadTrack(combined, { name: 'Unión (paralelo)' });
    state.concatSelection = { a: null, b: null };
    onTrackUpdate();
  }

  // --- Funciones principales expuestas en App ---
  /*
  La función mount:
      - Inicializa el visualizador y el reproductor.
      - Construye todos los paneles y controles de la interfaz.
      - Enlaza los handlers para que la UI responda a las acciones del usuario.
      - Expone las funciones principales para su uso global.
  */
  // Monta la UI y enlaza los handlers
  function mount() {
    // 1) Crear VISUALIZADOR (piano-roll en el <svg id="visualizer">)
    viz = new Roll(document.getElementById('visualizer'));

    // 2) Crear PLAYER (reproductor) y sincronizar el cursor del roll con el tiempo
    player = new LoopingPlayer({
      onPosition: (sec) => viz.updateCursor(sec)
    });

    // 3) Enlazar el título de la canción al estado (two-way-ish)
    bindTitleInput('#songTitle', state);

    // 4) Construir los controles de transporte (Play/Pause/Loop, etc.)
    buildTransport('#transport', player, state);

    // 5) Construir el panel de recorte (Trim)
    buildTrim('#trimPanel', state, onApplyTrim);

    // 6) Construir panel Guardar/Cargar (.mid) con handlers
    buildSaveLoad(
      '#saveLoadPanel',
      state,
      // onLoadSequence (cuando el usuario carga un .mid)
      (ns, meta = {}) => {
        const name = meta.name || 'Importado';
        const program = meta.program ?? 0;
        const isDrum = !!meta.isDrum;
        loadTrack(ns, { name, program, isDrum });
      },
      // onDownload (cuando el usuario pulsa "Descargar")
      () => {
        const active = state.tracks
          .filter(t => t.isActive)
          .map(t => setInstrument(t.ns, t.program ?? 0, t.isDrum ?? false));
        if (active.length === 0) {
          alert('No hay pistas activas para descargar.');
          return;
        }
        const out = active.length === 1 ? active[0] : merge(active);
        const filename = (state.title?.trim() || 'magenta_sandbox') + '.mid';
        window.__lib.download(out, filename);
      }
    );

    //TO DO: Estas funciones las de arriba (onLoadSequence y onDownload) existen ya en este archivo, no es necesario volver a definirlas aquí.


    // 7) Construir el panel de Pistas (lista, toggles, acciones)
    buildTracks('#tracksPanel', state, {
      onMergeTracks,          // Une en paralelo A+B (o activas)
      onTrackUpdate,          // Recalcula mezcla/visual y reproduce
      onToggleTrack,          // Activa/desactiva una pista
      onConcatenateTracks,    // Concatena temporalmente (A→B)
      onSelectForConcat,      // Marca A o B al pulsar un botón
      onClearConcatSelection  // Limpia la selección A/B
    });

    // 8) Exponer la FACHADA GLOBAL para que otros scripts (my-model.js) la usen
    window.App = {
      mount,
      loadTrack,              // Añadir pista al estado (y refrescar)
      replaceMain,            // Reemplazar la pista “actual” (render+play)
      getState: () => state,  // Lectura del estado para lógica externa (semillas, etc.)
      selectForConcat: onSelectForConcat,
      clearConcatSelection: onClearConcatSelection,
      concatLastTwo,
      concatAB
    };
}

  /* Añade una pista nueva al estado (tracks) y refresca la pista/visual/audio.
     - ns: NoteSequence a añadir
     - { name, program, isDrum }: metadatos opcionales de la pista
  */
  function loadTrack(ns, { name = 'Track', program = 0, isDrum = false } = {}) {
    state.tracks.push({ ns: ensureNsMeta(ns), name, program, isDrum, isActive: true });
    onTrackUpdate();
  }

  /*
    Reemplaza la melodía principal (current + original) por ns,
    actualizando visualizador y reproductor.
    Si ns es null, no hace nada.
  */
  async function replaceMain(ns) {
    state.current = ns;
    state.original = ns;
    viz.render(ns);
    player.start(ns, { qpm: state.qpm });
  }


  /*
  Recorta un fragmento de la melodía actual entre dos tiempos (startSec y endSec).
  Permite escuchar solo ese fragmento ("audition") o guardar el recorte como una nueva pista.
  */

  function onApplyTrim({ startSec, endSec, audition = false, restore = false }) {
    /*
      - startSec: Segundo inicial del recorte.
      - endSec: Segundo final del recorte.
      - audition: Si es true, solo reproduce el recorte, no lo guarda.
      - restore: Si es true, restaura la melodía original.
    */
    if (restore) {
      if (state.original) replaceMain(state.original);
      return;
    }
    const source = state.current || state.original;
    if (!source) return;
    const trimmedNs = window.__lib.trim(source, startSec, endSec);
    if (audition) {
      const auditionPlayer = new LoopingPlayer({});
      auditionPlayer.start(trimmedNs, { qpm: state.qpm });
    } else {
      // Guardar el recorte como nueva pista
      state.current = trimmedNs;
      viz.render(trimmedNs);
      player.start(trimmedNs, { qpm: state.qpm });

      // Añade como nueva pista recortada
      state.tracks.push({ ns: ensureNsMeta(trimmedNs), name: `Recorte ${startSec}s-${endSec}s`, program: false, isDrum: false, isActive: true });
      onTrackUpdate();
    }
  }

    /* 
    Concatena varias pistas musicales, una detrás de otra (no en paralelo, sino en secuencia temporal).
    Puede hacerlo con dos pistas seleccionadas (A y B) o con todas las pistas activas.
    */
  function onConcatenateTracks() {
    // Usa A+B si están seleccionadas; si no, concatena todas las activas
    const { a, b } = state.concatSelection || {};
    try {
      if (Number.isInteger(a) && Number.isInteger(b) && a !== b) {
        const nameA = state.tracks[a]?.name || `Track ${a + 1}`;
        const nameB = state.tracks[b]?.name || `Track ${b + 1}`;
        // Reutiliza el helper que añade una pista nueva, a,b son índices
        return concatCreateNew([a, b], { label: `Concatenación ${nameA} + ${nameB}` });
      }
      // Fallback: concatenar todas las pistas activas en orden
      const activeIdx = state.tracks
        .map((t, i) => (t.isActive ? i : -1))
        .filter(i => i >= 0);
      if (activeIdx.length >= 2) {
        return concatCreateNew(activeIdx, { label: 'Concatenación (activas)' });
      }
    } catch (err) {
      console.error('Error concatenando:', err);
      alert('No se pudo concatenar: ' + (err?.message || String(err)));
    }
  }

  /*
    Permite seleccionar dos pistas (A y B) para realizar acciones que requieren dos pistas, como concatenar o unir en paralelo.
    Gestiona la lógica de selección y, si corresponde, ejecuta la acción de unión automática.
  */

  function onSelectForConcat(index) {
    // Selecciona primero A, luego B. Si A y B ocupados, reinicia con A=index
    const sel = state.concatSelection || { a: null, b: null };
    if (!Number.isInteger(sel.a)) {
      sel.a = index;
    } else if (!Number.isInteger(sel.b) && index !== sel.a) {
      sel.b = index;
    } else if (index === sel.a) {
      // Toggle A
      sel.a = null;
    } else if (index === sel.b) {
      // Toggle B
      sel.b = null;
    } else {
      // Ambos ocupados y clic en otro -> desplazar: A = B actual, B = nuevo
      sel.a = sel.b;
      sel.b = index;
    }
    state.concatSelection = { ...sel };
    // Si estamos esperando unión y A/B están listos, ejecutar unión inmediata
    if (state.mergeAwaiting && Number.isInteger(sel.a) && Number.isInteger(sel.b) && sel.a !== sel.b) {
      const tA = state.tracks[sel.a];
      const tB = state.tracks[sel.b];
      if (tA?.ns && tB?.ns) {
        const arranged = [tA, tB].map(t => setInstrument(t.ns, t.program ?? 0, t.isDrum ?? false));
        const combined = merge(arranged);
        const nameA = tA.name || `Track ${sel.a + 1}`;
        const nameB = tB.name || `Track ${sel.b + 1}`;
        loadTrack(combined, { name: `Unión ${nameA} + ${nameB}` });
      }
      state.mergeAwaiting = false;
      state.concatSelection = { a: null, b: null };
    }
    onTrackUpdate();
  }

  function onClearConcatSelection() {
    state.concatSelection = { a: null, b: null };
    state.mergeAwaiting = false;
    onTrackUpdate();
  }

  // Helper: concatena en cuadrícula y añade nueva pista
  async function concatCreateNew(indexes, { label } = {}) {
    const seqs = indexes.map(i => state.tracks[i]?.ns).filter(Boolean);
    if (seqs.length < 2) return;

    const first = seqs[0];
    const qpm = first?.tempos?.[0]?.qpm ?? 120;
    const spq = first?.quantizationInfo?.stepsPerQuarter ?? 4;

    const ns = concatOnGrid(seqs, { qpm, spq, mm: window.mm });

    // Reutiliza loadTrack para añadir la nueva pista
    loadTrack(ensureNsMeta(ns), { name: label || 'Concatenación' });

    // loadTrack ya llama a onTrackUpdate()
  }

  // --- Helpers opcionales (si los usas en la UI), actualizados para refrescar correctamente ---
  function labelFromIndex(idx) {
    if (idx == null) return '—';
    return state.tracks[idx]?.name ?? `Pista ${idx + 1}`;
  }

  // is this being used?
  async function concatLastTwo() {
    if (state.tracks.length < 2) return;
    const idxA = state.tracks.length - 2;
    const idxB = state.tracks.length - 1;
    await concatCreateNew([idxA, idxB], { label: 'Concatenación (últimas 2)' });
  }

  async function concatAB() {
    const { a, b } = state.concatSelection;
    if (a == null || b == null) return;
    const label = `Concatenación ${labelFromIndex(a)} + ${labelFromIndex(b)}`;
    await concatCreateNew([a, b], { label });
    state.concatSelection = { a: null, b: null };
    onTrackUpdate(true);
  }

  // Por este bloque correcto (alias a las funciones reales):
  const actions = {
    loadTrack,
    replaceMain,
    selectForConcat: onSelectForConcat,
    clearConcatSelection: onClearConcatSelection,
    concatLastTwo,
    concatAB
  };

  return { mount, loadTrack, replaceMain, getState: () => state };
})();

window.addEventListener('DOMContentLoaded', () => {
  App.mount();
});