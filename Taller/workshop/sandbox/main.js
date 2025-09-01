// --- 1. Inicialización de Elementos y Modelos ---

// Usamos 'const' para guardar referencias a los elementos del HTML.
// Esto se hace una sola vez al cargar el script.
const generateButton = document.getElementById('btn-generate');
const playPauseButton = document.getElementById('btn-play-pause');
const downloadButton = document.getElementById('btn-download');
const canvas = document.getElementById('visualizer');

// Inicializamos nuestros modelos de Magenta.js
// Por ejemplo, un MusicRNN para continuar melodías.
const music_rnn = new mm.MusicRNN('https://storage.googleapis.com/magentadata/js/checkpoints/music_rnn/basic_rnn');
const player = new mm.Player(); // Un reproductor para escuchar el resultado

// Una variable global para guardar la última melodía generada
let currentSequence;

// --- 2. Lógica Principal: Funciones ---

/**
 * Función principal que genera la música. Es asíncrona porque los modelos de IA tardan en responder.
 */
async function generateMusic() {
    console.log('Generando música...');
    // Deshabilitamos los botones para que el usuario no haga clic mientras se genera.
    generateButton.disabled = true;
    generateButton.textContent = 'Pensando... 🧠';

    // La melodía inicial que le damos a la IA (¡el participante puede cambiar esto!)
    const seed_sequence = {
        notes: [
            { pitch: 60, quantizedStartStep: 0, quantizedEndStep: 4 }, // Do central
        ],
        quantizationInfo: { stepsPerQuarter: 4 },
        totalQuantizedSteps: 4,
    };

    // Parámetros para la generación
    const steps = 80;       // ¿Qué tan larga será la continuación?
    const temperature = 1.1; // ¿Qué tan "creativa" o "loca" será la IA?

    // ¡La llamada a la IA! Esperamos a que el modelo termine.
    const resultSequence = await music_rnn.continueSequence(seed_sequence, steps, temperature);

    // Guardamos la secuencia resultante en nuestra variable global
    currentSequence = resultSequence;
    console.log('¡Música generada!', currentSequence);

    // Actualizamos la interfaz
    generateButton.disabled = false;
    generateButton.textContent = 'Generar de nuevo';
    playPauseButton.disabled = false;
    downloadButton.disabled = false;

    // Dibujamos la melodía en el canvas
    new mm.PianoRollCanvasVisualizer(currentSequence, canvas);
}

/**
 * Función para tocar o pausar la música.
 */
function playPauseMusic() {
    if (player.isPlaying()) {
        player.stop();
        playPauseButton.textContent = '▶️ Tocar';
    } else {
        // Le decimos al player que toque nuestra secuencia y que nos avise cuando termine.
        player.start(currentSequence).then(() => {
            playPauseButton.textContent = '▶️ Tocar'; // Restaura el botón al terminar
        });
        playPauseButton.textContent = '⏸️ Pausar';
    }
}

/**
 * Función para descargar la melodía como un archivo MIDI.
 */
function downloadMusic() {
    // Magenta.js tiene una utilidad para convertir la secuencia a MIDI
    const midiBytes = mm.sequenceProtoToMidi(currentSequence);
    // Creamos un archivo "virtual" para que el navegador lo descargue
    const blob = new Blob([midiBytes], { type: 'audio/midi' });
    
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'mi-melodia.mid';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

// --- 3. Conexión: Asignar Funciones a los Botones ---

// ¡Este es el pegamento!
// Le decimos al navegador: "Cuando alguien haga clic en `generateButton`, ejecuta la función `generateMusic`".
generateButton.onclick = generateMusic;
playPauseButton.onclick = playPauseMusic;
downloadButton.onclick = downloadMusic;

// Mensaje final para asegurarnos de que el modelo esté listo.
music_rnn.initialize().then(() => {
    console.log('¡Modelo de IA cargado y listo!');
    generateButton.disabled = false; // Habilitamos el botón de generar por primera vez
});