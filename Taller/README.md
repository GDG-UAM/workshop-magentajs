<!-- Banner Universidad Autónoma de Madrid (coloca la imagen real en ./public/uam-banner.png) -->
<p align="center">
	<img src="./public/banner2.jpg" alt="Universidad Autónoma de Madrid" width="800" />
</p>

# Taller Magenta.js – Definiciones Clave y Ejemplos

Guía rápida (en español) para entender los términos y argumentos que verás en el código del taller. Incluye definiciones, equivalencias, notas prácticas y ejemplos mínimos con las utilidades y servicios (`constants`, `MusicVAE`, `MusicRNN`, helpers de secuencias y MIDI).

---
## 1. Parámetros Fundamentales

| Término | Significado | En el código | Ejemplo rápido |
|---------|-------------|--------------|----------------|
| QPM (Quarter Notes Per Minute) | Negras por minuto = tempo (≈ BPM). Magenta usa `qpm` como nombre estándar. | `WORKSHOP.QPM`, `player.setQpm(qpm)`, tempos en `ns.tempos[0].qpm` | 60 = lento, 120 = estándar pop, 90 = hip‑hop medio |
| (Confusión habitual) "QPD" | A veces la gente dice “QPD” por error cuando se refiere a QPM o SPQ. No es un parámetro oficial. | No existe en código. | Usa QPM para tempo, SPQ para resolución. |
| SPQ (Steps Per Quarter) | Pasos cuantizados por cada negra. Controla la resolución rítmica de la cuadrícula. | `WORKSHOP.SPQ`, `stepsPerQuarter`, `ns.quantizationInfo.stepsPerQuarter` | 4 = semicorcheas en 4/4 (16 por compás). 8 = más resolución. |
| Quantization / Cuantización | Proceso de alinear notas a la cuadrícula definida por SPQ. | `mm.sequences.quantizeNoteSequence(ns, spq)`; helpers `quantize()` | Convierte tiempos continuos en pasos enteros. |
| Step (quantized step) | Unidad mínima de tiempo tras cuantizar. 1 negra = SPQ steps. | `quantizedStartStep`, `quantizedEndStep`, argumentos `steps` en RNN. | Con SPQ=4: step=1 → 1/4 de negra (una semicorchea). |
| totalTime (segundos) | Duración real de la secuencia en segundos. | `ns.totalTime` | Se asegura en helpers (`ensureMeta`, `_ensureTotals`). |
| totalQuantizedSteps | Duración en pasos cuantizados. | `ns.totalQuantizedSteps` | Con SPQ=4 y 4 compases (4/4): 4 compases * 4 negras * 4 steps = 64. |
| tempo object | Lista de cambios de tempo. Normalmente usamos un único tempo al inicio. | `ns.tempos = [{ time:0, qpm:120 }]` | Los helpers lo fuerzan si falta. |

### Relación Tiempo ↔ Pasos
Si `SPQ = 4` y `QPM = 120`:
- 1 negra dura 0.5 s.
- 1 step (semicorchea) dura 0.5 / 4 = 0.125 s.

Fórmulas:
```
segundosPorNegra = 60 / QPM
segundosPorStep  = (60 / QPM) / SPQ
totalTime ≈ totalQuantizedSteps * segundosPorStep (si la secuencia está cuantizada)
```

---
## 2. Campos Comunes en una NoteSequence

| Campo | Qué es | Comentario práctico |
|-------|-------|---------------------|
| `notes[]` | Array de notas. | Cada nota tiene `pitch`, `startTime`, `endTime`, etc. |
| `pitch` | Número MIDI (0–127). 60 = C4 (Do central). | Ajustamos rango en `MusicRnnService._ensurePitchRange()`. |
| `startTime` / `endTime` | Tiempos en segundos (no cuantizados) | Si cuantizas, también habrá `quantizedStartStep/EndStep`. |
| `velocity` | Intensidad (1–127). | Se normaliza al exportar MIDI (`prepareForExport`). |
| `program` | Instrumento General MIDI (0 = piano). | Cambiable con helper `setInstrument()`. |
| `instrument` | Índice interno (para separar pistas). | `splitIntoTracks()` lo usa si existe. |
| `isDrum` | Boolean; batería canal 10 semántico. | GrooVAE marca drums `true`. |
| `tempos[]` | Cambios de tempo. | Forzamos uno al inicio. |
| `quantizationInfo.stepsPerQuarter` | Resolución SPQ de la cuadrícula. | Clave para `steps` en modelos RNN/VAE. |
| `totalTime` | Duración segundos. | Garantizado por sanitizadores. |
| `totalQuantizedSteps` | Duración en pasos. | Útil para loops / slicing. |

---
## 3. Conceptos de Modelos (MusicVAE / MusicRNN / Coconet)

| Concepto | Definición | Uso en código |
|----------|------------|---------------|
| MusicVAE | Autoencoder variacional musical (melodías / tríos / grooves). Permite samplear, interpolar, encode/decode, similitudes. | `MusicVaeService` y variantes (`MelodyVaeService`, `TrioVaeService`, `GrooveVaeService`). |
| Latent Space (z) | Vector continuo donde cada punto representa una “versión” musical. | Métodos `encode()` → tensor z; `decode(z)` → NoteSequence. |
| sample(temperature) | Genera nuevas secuencias desde la distribución aprendida. | `await vae.melody.sample(4, 0.8)` |
| interpolate(A,B,n) | Crea pasos intermedios entre semillas. | `vae.melody.interpolate([ns1, ns2], 8)` |
| similar(seq) | Variaciones de una entrada manteniendo identidad parcial. | `vae.melody.similar(seed, 4, 0.7)` |
| temperature | Control de aleatoriedad (≈ entropía). Más alto = más diversidad / riesgo. | 0.4–0.8 estable; 1.0–1.4 creativo. |
| Trio VAE | Modelo que produce 3 partes (bajo, batería, melodía). | `CHECKPOINTS.musicvae.trio` |
| GrooVAE | Modelo de patrones de batería (groove). | `CHECKPOINTS.musicvae.groovae` |
| MusicRNN (MelodyRNN) | RNN que extiende una melodía existente. | `MusicRnnService.continue()` |
| continue(seed, steps) | Genera continuación de `seed` en pasos cuantizados. | `rnn.continue(seed, { steps: 64 })` |
| chordProgression | Lista de acordes usada para condicionar modelos soportados. | `['C', 'G', 'Am', 'F']` |
| monophonic | Una sola nota a la vez (sin solaparse). MelodyRNN lo asume. | Forzado en `_toMonophonic()`. |
| Coconet | Modelo para armonizar corales tipo Bach. (Wrapper no incluido aquí, pero checkpoint disponible). | `CHECKPOINTS.coconet.bach` |

---
## 4. Archivo `lib/config/constants.js`

```js
export const WORKSHOP = {
	QPM: 60,   // tempo base sugerido para ejercicios (más fácil de seguir)
	SPQ: 4,    // semicorchea = 1 step → 1 compás (4/4) = 16 steps
};

export const CHECKPOINTS = {
	musicvae: { melody, trio, groovae },
	musicrnn: { basic, melody },
	coconet: { bach }
};
```

Recomendación: parte del taller usa siempre `WORKSHOP.QPM` y `WORKSHOP.SPQ` para mantener consistencia cuando mezclas salidas de diferentes modelos.

---
## 5. Ejemplos Prácticos

### 5.1 Cargar constantes y crear suite VAE
```js
import { WORKSHOP, CHECKPOINTS } from './lib/config/constants.js';
import { makeVaeSuite } from './lib/models/musicvae.js';

const vae = makeVaeSuite(CHECKPOINTS.musicvae, {
	qpm: WORKSHOP.QPM,
	stepsPerQuarter: WORKSHOP.SPQ,
});

await vae.melody.initialize();
const [melody] = await vae.melody.sample(1, 0.7);
// Cargar en UI:
App.loadTrack(melody, { name: 'VAE Melody', program: 0 });
```

### 5.2 Interpolación entre dos melodías
```js
const [a] = await vae.melody.sample(1, 0.6);
const [b] = await vae.melody.sample(1, 1.0);
const mids = await vae.melody.interpolate([a, b], 6); // 6 puntos intermedios
mids.forEach((ns, i) => App.loadTrack(ns, { name: 'Interp ' + i, program: 0 }));
```

### 5.3 MusicRNN – Continuar una semilla
```js
import { MusicRnnService } from './lib/models/musicrnn.js';
import { CHECKPOINTS, WORKSHOP } from './lib/config/constants.js';

const rnn = new MusicRnnService({
	checkpointURL: CHECKPOINTS.musicrnn.melody,
	stepsPerQuarter: WORKSHOP.SPQ,
	qpm: WORKSHOP.QPM,
});
await rnn.initialize();

// Crear semilla simple de escala de Do
const seed = rnn.makeSeedFromPitches([60,62,64,65,67,69,71,72], 0.5);
const continuation = await rnn.continue(seed, { steps: 64, temperature: 1.1 });
App.loadTrack(seed, { name: 'Seed', program: 0 });
App.loadTrack(continuation, { name: 'RNN cont.', program: 0 });
```

### 5.4 Ajustar SPQ/QPM en runtime
```js
vae.melody.setQpm(90);             // Cambia tempo futuro
vae.melody.setStepsPerQuarter(8);  // Más resolución (ojo: re‑cuantiza internamente)
```

### 5.5 Exportar a MIDI
```js
import { downloadMidi } from './lib/core/midi.js';
downloadMidi(continuation, 'rnn_cont.mid', WORKSHOP.QPM);
```

### 5.6 Unir pistas (merge) antes de exportar
```js
import { merge } from './lib/core/sequences.js';
const full = merge([melody, continuation]);
downloadMidi(full, 'mix.mid', WORKSHOP.QPM);
```

---
## 6. Helpers Útiles de `lib/core/sequences.js`

| Función | Para qué sirve | Ejemplo |
|---------|----------------|---------|
| `trim(ns, a, b)` | Recorta entre segundos `[a,b)` | `const corto = trim(ns, 0, 4);` |
| `setInstrument(ns, program, isDrum)` | Fuerza instrumento/percusión | `setInstrument(ns, 33)` (bajo) |
| `merge(seqs[])` | Combina notas en paralelo | `merge([bajo, melodia])` |
| `concatenate(seqs, { qpm, spq })` | Une secuencias en serie | `concatenate([a,b,c])` |
| `quantize(ns, spq)` | Cuantiza a SPQ | `quantize(ns, 4)` |
| `mergeFromState(state)` | Reúne tracks activos (UI genérica) | `mergeFromState(appState)` |

Cada helper asegura (vía `ensureMeta`) que la salida tenga `totalTime` / `totalQuantizedSteps` válidos.

---
## 7. Temperatura, Aleatoriedad y Control

| Rango temperatura | Efecto | Uso típico |
|-------------------|--------|-----------|
| 0.2 – 0.5 | Conservador, repetitivo | Variaciones suaves |
| 0.6 – 0.9 | Equilibrado | Valor por defecto recomendable |
| 1.0 – 1.3 | Creativo, más sorpresas | Exploración / brainstorming |
| >1.4 | Caótico | Experimentos puntuales |

Recuerda: La temperatura afecta sampling VAE y continuación RNN (donde se exponga).

---
## 8. Errores y Confusiones Frecuentes

| Situación | Causa | Solución |
|-----------|-------|----------|
| “Magenta no está disponible” | No se cargó `@magenta/music`. | Añade script CDN o instala el paquete. |
| Notas sin sonar al exportar | `velocity` muy baja o duración 0. | Usa helpers; export normaliza. |
| Modelo ignora tu SPQ | El checkpoint fuerza su propio SPQ (trio / groovae). | Ver flag `spqFromModel` en `MusicVaeService.getConfig()`. |
| Continuación RNN rara (saltos enormes) | Seeds fuera de rango de pitch | `_ensurePitchRange` los ajusta; revisa tu semilla. |
| “QPD” en apuntes | Término informal/erróneo. | Sustituir por QPM (tempo) o SPQ (resolución). |

---
## 9. Flujo Básico del Taller
1. Elegir modelo (VAE, RNN, GrooVAE, Trio...).
2. Definir parámetros base: `qpm = WORKSHOP.QPM`, `spq = WORKSHOP.SPQ`.
3. Obtener una semilla (cargar MIDI, crear a mano, sample inicial VAE, pitches manuales).
4. Generar (sample / interpolate / continue / similar).
5. Editar / combinar (`trim`, `merge`, `concatenate`, cambiar instrumentos).
6. Escuchar / ajustar tempo o temperatura.
7. Exportar a MIDI (`downloadMidi`).

---
## 10. Snippet Resumen “Hello Magenta”
```js
import { WORKSHOP, CHECKPOINTS } from './lib/config/constants.js';
import { makeVaeSuite } from './lib/models/musicvae.js';
import { downloadMidi } from './lib/core/midi.js';

async function main() {
	const vae = makeVaeSuite(CHECKPOINTS.musicvae, {
		qpm: WORKSHOP.QPM,
		stepsPerQuarter: WORKSHOP.SPQ,
	});
	await vae.melody.initialize();
	const [ns] = await vae.melody.sample(1, 0.8);
	App.loadTrack(ns, { name: 'Hello VAE', program: 0 });
	downloadMidi(ns, 'hello.mid', WORKSHOP.QPM);
}
main();
```

---
## 11. Próximas Extensiones (Ideas)
* Añadir wrapper simple para Coconet (armonizar soprano → voces completas).
* UI para comparar interpolaciones lado a lado.
* Panel de “latente” con `encode()` → mover slider → `decode()`.
* Historial de generaciones con etiquetas (seed, params usados).

---
## 12. Glosario Rápido
| Termino | Definición corta |
|---------|------------------|
| QPM | Tempo en negras por minuto |
| SPQ | Pasos por negra (resolución) |
| Seed | Secuencia inicial (entrada del modelo) |
| Sample | Generación desde ruido/priors |
| Interpolate | Transición suave entre secuencias |
| Encode / Decode | Ir y volver del espacio latente VAE |
| Similar | Variaciones cercanas a una semilla |
| Temperature | Parámetro de aleatoriedad |
| Monophonic | Una nota a la vez |
| Drum Track | Pista marcada con `isDrum=true` |

---
## 13. Créditos
Basado en [Magenta.js](https://github.com/magenta/magenta-js). Adaptado para fines educativos en el taller.

---
¿Algo que falte? Puedes ampliar este README añadiendo más ejemplos específicos del taller.

