// Parámetros por defecto del taller
export const DEFAULT_QPM = 120;
export const DEFAULT_SPQ = 4;

// Checkpoints oficiales (TF.js) alojados por Magenta
export const CHECKPOINTS = {
  musicvae: {
    // Melody VAE (4 compases, versión cuantizada pequeña → carga rápida)
    melody: 'https://storage.googleapis.com/magentadata/js/checkpoints/music_vae/mel_4bar_small_q2',
  },
  musicrnn: {
    // MelodyRNN básico (muy usado en demos)
    melody: 'https://storage.googleapis.com/magentadata/js/checkpoints/music_rnn/basic_rnn',
  },
  // Coconet (corales de Bach)
  coconet: 'https://storage.googleapis.com/magentadata/js/checkpoints/coconet/bach'
};
