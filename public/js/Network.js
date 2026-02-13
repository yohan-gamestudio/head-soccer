// WebSocket network layer

export class Network {
  constructor() {
    this.ws = null;
    this.handlers = {};
    this.connected = false;
    this.token = null;
    this._reconnecting = false;
    this._intentionalClose = false;
    this._reconnectAttempts = 0;
    this._maxReconnectAttempts = 5;
  }

  connect() {
    return new Promise((resolve, reject) => {
      const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
      this.ws = new WebSocket(`${protocol}//${location.host}`);
      this._intentionalClose = false;

      this.ws.onopen = () => {
        this.connected = true;
        this._reconnectAttempts = 0;

        // If we have a token, try to reconnect to previous room
        if (this._reconnecting && this.token) {
          this.send({ type: 'reconnect', token: this.token });
          this._reconnecting = false;
        }

        resolve();
      };

      this.ws.onclose = () => {
        this.connected = false;
        if (this._intentionalClose) return;

        // Auto-reconnect if we have a token
        if (this.token && this._reconnectAttempts < this._maxReconnectAttempts) {
          this._reconnecting = true;
          this._reconnectAttempts++;
          this._emit('reconnecting', { attempt: this._reconnectAttempts });
          const delay = Math.min(1000 * this._reconnectAttempts, 5000);
          setTimeout(() => this._doReconnect(), delay);
        } else {
          this._emit('disconnected');
        }
      };

      this.ws.onerror = (err) => {
        if (!this.connected) reject(err);
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          this._emit(msg.type, msg);
        } catch {}
      };
    });
  }

  _doReconnect() {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    this.ws = new WebSocket(`${protocol}//${location.host}`);

    this.ws.onopen = () => {
      this.connected = true;
      this._reconnectAttempts = 0;
      if (this.token) {
        this.send({ type: 'reconnect', token: this.token });
      }
    };

    this.ws.onclose = () => {
      this.connected = false;
      if (this._intentionalClose) return;

      if (this.token && this._reconnectAttempts < this._maxReconnectAttempts) {
        this._reconnectAttempts++;
        this._emit('reconnecting', { attempt: this._reconnectAttempts });
        const delay = Math.min(1000 * this._reconnectAttempts, 5000);
        setTimeout(() => this._doReconnect(), delay);
      } else {
        this._emit('disconnected');
      }
    };

    this.ws.onerror = () => {};

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        this._emit(msg.type, msg);
      } catch {}
    };
  }

  setToken(token) {
    this.token = token;
  }

  clearToken() {
    this.token = null;
  }

  send(msg) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  on(type, handler) {
    if (!this.handlers[type]) this.handlers[type] = [];
    this.handlers[type].push(handler);
  }

  off(type, handler) {
    if (!this.handlers[type]) return;
    this.handlers[type] = this.handlers[type].filter(h => h !== handler);
  }

  _emit(type, data) {
    const handlers = this.handlers[type];
    if (handlers) {
      for (const h of handlers) h(data);
    }
  }

  disconnect() {
    this._intentionalClose = true;
    this.clearToken();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
