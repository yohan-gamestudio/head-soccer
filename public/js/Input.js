// Keyboard + Touch input handler

export class Input {
  constructor() {
    this.keys = {
      left: false,
      right: false,
      up: false,
      kick: false,
    };
    this._onKeyDown = this._onKeyDown.bind(this);
    this._onKeyUp = this._onKeyUp.bind(this);
    this._touchBtns = [];
  }

  start() {
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    this._initTouch();
  }

  stop() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    this._cleanupTouch();
    this.keys = { left: false, right: false, up: false, kick: false };
  }

  getKeys() {
    return { ...this.keys };
  }

  _onKeyDown(e) {
    const k = this._mapKey(e.code);
    if (k) {
      this.keys[k] = true;
      e.preventDefault();
    }
  }

  _onKeyUp(e) {
    const k = this._mapKey(e.code);
    if (k) {
      this.keys[k] = false;
      e.preventDefault();
    }
  }

  _mapKey(code) {
    switch (code) {
      case 'ArrowLeft':
      case 'KeyA':
        return 'left';
      case 'ArrowRight':
      case 'KeyD':
        return 'right';
      case 'ArrowUp':
      case 'KeyW':
        return 'up';
      case 'Space':
      case 'KeyX':
      case 'ShiftRight':
        return 'kick';
      default:
        return null;
    }
  }

  _initTouch() {
    const btns = document.querySelectorAll('.touch-btn');
    btns.forEach(btn => {
      const key = btn.dataset.key;
      if (!key) return;

      const onStart = (e) => {
        e.preventDefault();
        this.keys[key] = true;
        btn.classList.add('active');
      };
      const onEnd = (e) => {
        e.preventDefault();
        this.keys[key] = false;
        btn.classList.remove('active');
      };

      btn.addEventListener('touchstart', onStart, { passive: false });
      btn.addEventListener('touchend', onEnd, { passive: false });
      btn.addEventListener('touchcancel', onEnd, { passive: false });

      this._touchBtns.push({ btn, onStart, onEnd });
    });
  }

  _cleanupTouch() {
    this._touchBtns.forEach(({ btn, onStart, onEnd }) => {
      btn.removeEventListener('touchstart', onStart);
      btn.removeEventListener('touchend', onEnd);
      btn.removeEventListener('touchcancel', onEnd);
      btn.classList.remove('active');
    });
    this._touchBtns = [];
  }
}
