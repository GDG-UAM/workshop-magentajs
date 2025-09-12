// --- utilidades de espera ---
function domReady() {
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    return Promise.resolve();
  }
  return new Promise(res => window.addEventListener('DOMContentLoaded', res, { once: true }));
}

function waitFor(condFn, { timeout = 10000, interval = 30 } = {}) {
  const t0 = performance.now();
  return new Promise(resolve => {
    const id = setInterval(() => {
      if (condFn()) { clearInterval(id); resolve(true); return; }
      if (performance.now() - t0 > timeout) { clearInterval(id); resolve(false); }
    }, interval);
  });
}

// --- tabla de rutas de demos ---
const map = {
  baseline: () => import('./baseline/baseline.js'),
  rnn:      () => import('./rnn/rnn.js'),
  vae:      () => import('./vae/vae.js'),
  coconet:  () => import('./coconet/coconet.js'),
  all:      () => import('./all/all.js'),  
};

const which = new URLSearchParams(location.search).get('demo') || 'baseline';
console.log('[loader] demo seleccionada =', which);

await domReady();

// Espera a que generic.js haya montado y expuesto window.App
await waitFor(() =>
  !!(window.App && typeof window.App.getState === 'function') &&
  !!document.getElementById('modelsPanel')
);

// 1) Elige la función importadora
const importFn = map[which] || map.baseline;

// 2) Importa el módulo de la demo
const mod = await importFn();

// 3) Llama a setup pasando la App y el panel
if (typeof mod.setup === 'function') {
  mod.setup({ app: window.App, panel: document.getElementById('modelsPanel') });
} else {
  console.error(`[loader] La demo "${which}" no exporta setup().`);
}
