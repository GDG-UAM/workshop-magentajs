
// Parámetros recomendados del taller (usar en sandbox y UI genérica)
export const WORKSHOP = {
  QPM: 90,
  SPQ: 6,
};

// Checkpoints oficiales (TF.js) alojados por Magenta
export const CHECKPOINTS = {
  musicvae: {
    // Melody VAE (4 compases, versión cuantizada pequeña → carga rápida)
    melody: 'https://storage.googleapis.com/magentadata/js/checkpoints/music_vae/mel_4bar_small_q2',
    // ideal para generar música con 3 instrumentos (Guitarra-Batería-Bajo)
    trio: 'https://storage.googleapis.com/magentadata/js/checkpoints/music_vae/trio_4bar',
    // ideal para generar ritmos de Bateria
    groovae: 'https://storage.googleapis.com/magentadata/js/checkpoints/music_vae/groovae_4bar'
  },
  musicrnn: {
    // MelodyRNN básico (muy usado en demos)
    basic: 'https://storage.googleapis.com/magentadata/js/checkpoints/music_rnn/basic_rnn',
    // ideal para generar melodías más complejas
    melody: 'https://storage.googleapis.com/magentadata/js/checkpoints/music_rnn/melody_rnn',
  },
  // Coconet (corales de Bach)
  coconet: 'https://storage.googleapis.com/magentadata/js/checkpoints/coconet/bach'
};

export default {
  WORKSHOP,
  CHECKPOINTS,
};