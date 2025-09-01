// Envoltorio de mm.Player con loop A/B, QPM, seek y notificador de posición.

function getMM() {
  if (typeof window !== 'undefined' && window.mm) return window.mm;
  throw new Error('[player] Magenta no está disponible.');
}

export class LoopingPlayer {
  constructor({ onNote = () => {}, onPosition = () => {} } = {}) {
    const mm = getMM();
    this._mm = mm;
    this.player = new mm.Player(false, { run: onNote });
    this.qpm = 120;
    this.loopA = 0;       // sec
    this.loopB = null;    // sec | null
    this.onPosition = onPosition;
    this._ticker = null;
  }

  start(ns, { qpm = this.qpm } = {}) {
    this.stop();
    this.qpm = qpm;
    this.player.start(ns, qpm);
    this._startTicker();
  }
  pause() { this.player.pause(); }
  resume() { this.player.resume(); }
  stop() { this.player.stop(); this._stopTicker(); }
  setQpm(qpm) { this.qpm = qpm; this.player.setTempo(qpm); }
  seek(sec) { this.player.seekTo(sec); }
  setLoop(aSec, bSec) { this.loopA = aSec; this.loopB = bSec; }

  _startTicker() {
    this._ticker = setInterval(() => {
      const st = this.player.getPlayState?.();
      const pos = st?.currentTime ?? 0;
      this.onPosition(pos);
      if (this.loopB != null && pos >= this.loopB) this.seek(this.loopA);
    }, 50);
  }
  _stopTicker() { if (this._ticker) clearInterval(this._ticker); this._ticker = null; }
}
