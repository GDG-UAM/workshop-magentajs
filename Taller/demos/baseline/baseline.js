// En: Taller/workshop/sandbox/my-model.js

// Importamos una función simple para crear música desde la librería.
// No usaremos una IA para mantener el ejemplo rápido y claro.
import { makeScale } from '../../lib/models/baseline.js';

// 1. Buscamos el panel donde irán nuestros botones en el HTML.
const modelsPanel = document.getElementById('modelsPanel');

// 2. Creamos un nuevo botón.
const myButton = document.createElement('button');
myButton.textContent = 'Crear Escala Musical';

// 3. Añadimos el botón a la interfaz.
modelsPanel.appendChild(myButton);

// 4. Definimos qué pasa cuando el usuario hace clic en nuestro botón.
myButton.onclick = () => {
  // Usamos la función que importamos para generar una escala de Do mayor.
  const miEscala = makeScale({ tonic: 60, length: 8, step: 2, dur: 0.5 });
  
  // 5. ¡LA CONEXIÓN! Entregamos nuestra música a la App genérica.
  // Le damos un nombre para que aparezca en la lista de pistas.
  App.loadTrack(miEscala, { name: 'Mi Escala' });

  console.log('¡Escala enviada a la App!');
};

console.log('¡Mi modelo personal (`my-model.js`) se ha cargado!');