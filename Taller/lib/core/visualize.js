// Visualizador PianoRoll SVG sincronizable con el player

function getMM() {
  if (typeof window !== 'undefined' && window.mm) return window.mm;
  throw new Error('[visualize] Magenta no está disponible.');
}

export class Roll {
  constructor(containerEl, opts = {}) {
    this._mm = getMM();
    this.container = containerEl;
    this.viz = null;
    this.opts = Object.assign({ noteHeight: 6, pixelsPerTimeStep: 40 }, opts);
  }

  render(ns) {
    this.container.innerHTML = '';
    this.viz = new this._mm.PianoRollSVGVisualizer(ns, this.container, this.opts);
  }

  updateCursor(sec) {
    if (this.viz) this.viz.redraw(sec);
  }
}
