// En: Taller/lib/core/player.js

function getMM() {
  if (typeof window !== 'undefined' && window.mm) return window.mm;
  throw new Error('[player] Magenta no está disponible.');
}

export class LoopingPlayer {
  constructor({ onNote = () => {}, onPosition = () => {} } = {}) {
    const mm = getMM();
    this._mm = mm;
    this.player = new mm.SoundFontPlayer('https://storage.googleapis.com/magentadata/js/soundfonts/sgm_plus');
    this.qpm = 120;
    this.loopA = 0;
    this.loopB = null;
    this.onPosition = onPosition;
    this._ticker = null;
    this._currentNs = null;
    this._isPaused = false;
  }

  isPlaying() {
    return this.player.isPlaying();
  }

  async start(ns, { qpm = this.qpm } = {}) {
    this.stop();
    this.qpm = qpm;
    this._currentNs = ns;
    this._isPaused = false;

    await this.player.loadSamples(ns);

    if (!ns.quantizationInfo) {
      this.player.start(ns);
    } else {
      this.player.start(ns, qpm);
    }
    this._startTicker();
  }

  pause() { 
    if (this.isPlaying()) {
      this.player.pause();
      this._isPaused = true;
      this._stopTicker();
    }
  }

  async resumeOrStart(ns, { qpm = this.qpm } = {}) {
    if (this._isPaused) {
      this.player.resume();
      this._isPaused = false;
      this._startTicker();
    } else {
      await this.start(ns, { qpm });
    }
  }

  stop() {
    if (this.isPlaying() || this._isPaused) {
      this.player.stop();
    }
    this._isPaused = false;
    this._stopTicker();
    this.onPosition(0);
  }

  setQpm(qpm) {
    this.qpm = qpm;
    if (this.isPlaying()) {
      this.start(this._currentNs, { qpm: this.qpm });
    }
  }

  seek(sec) {
    console.log('Seek no está implementado en este reproductor.');
  }

  setLoop(aSec, bSec) {
    this.loopA = aSec;
    this.loopB = bSec;
  }

  _startTicker() {
    this._stopTicker();
    this._ticker = setInterval(() => {
      this.onPosition(0); 
    }, 100);
  }

  _stopTicker() {
    if (this._ticker) clearInterval(this._ticker);
    this._ticker = null;
  }
}