// Client-side game loop with prediction and reconciliation
import * as C from '/game/Constants.js';
import * as Physics from '/game/Physics.js';

export class ClientGame {
  constructor(network, renderer, input) {
    this.network = network;
    this.renderer = renderer;
    this.input = input;

    this.myIndex = 0;         // 0 or 1
    this.state = null;        // current rendered state
    this.serverState = null;  // latest server snapshot
    this.running = false;
    this.seq = 0;
    this.inputBuffer = [];    // { seq, keys } - unacknowledged inputs
    this.lastServerSeq = 0;

    // Interpolation for remote player & ball
    this.snapshotBuffer = []; // last 2 snapshots for interpolation
    this.interpDelay = 80;    // ms to delay rendering (for smooth interp)

    // Loop
    this.animFrameId = null;
    this.lastTime = 0;
    this.accumulator = 0;
    this.inputSendAccumulator = 0;

    // Callbacks
    this.onScoreUpdate = null;
    this.onTimeUpdate = null;
    this.onGoal = null;
    this.onGameOver = null;

    // Bind
    this._gameLoop = this._gameLoop.bind(this);
  }

  start(initialState, myIndex) {
    this.myIndex = myIndex;
    this.state = Physics.deserializeState(initialState);
    this.serverState = null;
    this.running = true;
    this.seq = 0;
    this.inputBuffer = [];
    this.lastServerSeq = 0;
    this.snapshotBuffer = [];
    this.accumulator = 0;
    this.inputSendAccumulator = 0;

    this.input.start();

    // Listen for snapshots
    this._onSnapshot = (msg) => this._handleSnapshot(msg);
    this._onGoal = (msg) => {
      this.renderer.showGoalAnimation(msg.score);
      if (this.onGoal) this.onGoal(msg.scorer, msg.score);
    };
    this._onGameOver = (msg) => {
      this.running = false;
      this.input.stop();
      if (this.onGameOver) this.onGameOver(msg.score, msg.winner);
    };

    this.network.on('snapshot', this._onSnapshot);
    this.network.on('goal', this._onGoal);
    this.network.on('game_over', this._onGameOver);

    this.lastTime = performance.now();
    this.animFrameId = requestAnimationFrame(this._gameLoop);
  }

  stop() {
    this.running = false;
    this.input.stop();
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    this.network.off('snapshot', this._onSnapshot);
    this.network.off('goal', this._onGoal);
    this.network.off('game_over', this._onGameOver);
  }

  _gameLoop(now) {
    if (!this.running) return;

    const dt = Math.min((now - this.lastTime) / 1000, 0.05); // cap at 50ms
    this.lastTime = now;

    // Fixed timestep for prediction
    this.accumulator += dt;
    while (this.accumulator >= C.FIXED_DT) {
      this._tick();
      this.accumulator -= C.FIXED_DT;
    }

    // Render
    this._render();

    this.animFrameId = requestAnimationFrame(this._gameLoop);
  }

  _tick() {
    if (!this.state || this.state.paused) return;

    // Capture and send input
    const keys = this.input.getKeys();
    this.seq++;
    const inputMsg = { type: 'input', seq: this.seq, keys };
    this.network.send(inputMsg);
    this.inputBuffer.push({ seq: this.seq, keys: { ...keys } });

    // Trim buffer (keep last 120 inputs max)
    if (this.inputBuffer.length > 120) {
      this.inputBuffer = this.inputBuffer.slice(-120);
    }

    // Client prediction: apply input to local player
    Physics.applyInput(this.state.players[this.myIndex], keys, C.FIXED_DT);

    // Step physics for local player only (prediction)
    this._stepLocalPlayer(C.FIXED_DT);
  }

  _stepLocalPlayer(dt) {
    const p = this.state.players[this.myIndex];

    // Gravity
    p.vy += C.GRAVITY * dt;

    // Move
    p.x += p.vx * dt;
    p.y += p.vy * dt;

    // Ground
    if (p.y >= C.GROUND_Y) {
      p.y = C.GROUND_Y;
      p.vy = 0;
      p.onGround = true;
    }

    // Walls
    const minX = C.PLAYER_BODY_W / 2;
    const maxX = C.FIELD_WIDTH - C.PLAYER_BODY_W / 2;
    if (p.x < minX) p.x = minX;
    if (p.x > maxX) p.x = maxX;

    // Kick timer
    if (p.isKicking) {
      p.kickTimer -= dt * 1000;
      if (p.kickTimer <= 0) {
        p.isKicking = false;
        p.kickTimer = 0;
      }
    }
  }

  _handleSnapshot(msg) {
    const serverState = Physics.deserializeState(msg.state);
    this.lastServerSeq = msg.lastSeq;

    // Store for interpolation
    this.snapshotBuffer.push({
      time: performance.now(),
      state: serverState,
      tick: msg.tick,
    });
    // Keep last 3 snapshots
    if (this.snapshotBuffer.length > 3) {
      this.snapshotBuffer.shift();
    }

    // Reconcile local player
    this._reconcile(serverState, msg.lastSeq);

    // Update game meta (score, time, pause)
    this.state.score = serverState.score;
    this.state.timeLeft = serverState.timeLeft;
    this.state.paused = serverState.paused;
    this.state.pauseTimer = serverState.pauseTimer;

    // UI callbacks
    if (this.onScoreUpdate) this.onScoreUpdate(this.state.score);
    if (this.onTimeUpdate) this.onTimeUpdate(this.state.timeLeft);
  }

  _reconcile(serverState, lastSeq) {
    const serverPlayer = serverState.players[this.myIndex];

    // Start from server position
    let reconX = serverPlayer.x;
    let reconY = serverPlayer.y;
    let reconVx = serverPlayer.vx;
    let reconVy = serverPlayer.vy;
    let reconOnGround = serverPlayer.onGround;

    // Replay unacknowledged inputs
    const unprocessed = this.inputBuffer.filter(i => i.seq > lastSeq);
    this.inputBuffer = unprocessed; // trim acknowledged inputs

    for (const input of unprocessed) {
      // Apply input (acceleration based)
      if (input.keys.left) {
        reconVx -= C.PLAYER_ACCEL * C.FIXED_DT;
      } else if (input.keys.right) {
        reconVx += C.PLAYER_ACCEL * C.FIXED_DT;
      } else {
        reconVx *= C.PLAYER_FRICTION;
        if (Math.abs(reconVx) < 5) reconVx = 0;
      }
      if (reconVx > C.PLAYER_MAX_SPEED) reconVx = C.PLAYER_MAX_SPEED;
      if (reconVx < -C.PLAYER_MAX_SPEED) reconVx = -C.PLAYER_MAX_SPEED;

      if (input.keys.up && reconOnGround) {
        reconVy = C.JUMP_FORCE;
        reconOnGround = false;
      }

      // Step
      reconVy += C.GRAVITY * C.FIXED_DT;
      reconX += reconVx * C.FIXED_DT;
      reconY += reconVy * C.FIXED_DT;

      if (reconY >= C.GROUND_Y) {
        reconY = C.GROUND_Y;
        reconVy = 0;
        reconOnGround = true;
      }
      const minX = C.PLAYER_BODY_W / 2;
      const maxX = C.FIELD_WIDTH - C.PLAYER_BODY_W / 2;
      if (reconX < minX) reconX = minX;
      if (reconX > maxX) reconX = maxX;
    }

    // Smoothly correct position
    const p = this.state.players[this.myIndex];
    const dx = reconX - p.x;
    const dy = reconY - p.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > 100) {
      // Large difference: snap
      p.x = reconX;
      p.y = reconY;
    } else if (dist > 8) {
      // Small difference: very gentle lerp to avoid jitter
      p.x += dx * 0.1;
      p.y += dy * 0.1;
    }
    // Under 8px: ignore (prediction is close enough)

    p.vx = reconVx;
    p.vy = reconVy;
    p.onGround = reconOnGround;
    p.facing = serverPlayer.facing;
    p.isKicking = serverPlayer.isKicking;
    p.kickTimer = serverPlayer.kickTimer;
  }

  _render() {
    if (!this.state) return;

    // Interpolate remote player and ball from snapshots
    this._interpolateRemote();

    const now = performance.now();
    const frameDt = now - (this._lastRenderTime || now);
    this._lastRenderTime = now;
    this.renderer.render(this.state, this.myIndex, frameDt);
  }

  _interpolateRemote() {
    if (this.snapshotBuffer.length < 2) {
      // Not enough snapshots; use latest if available
      if (this.snapshotBuffer.length === 1) {
        const snap = this.snapshotBuffer[0].state;
        const remoteIdx = 1 - this.myIndex;
        this._lerpEntity(this.state.players[remoteIdx], snap.players[remoteIdx], 0.3);
        this._lerpEntity(this.state.ball, snap.ball, 0.3);
      }
      return;
    }

    const now = performance.now();
    const renderTime = now - this.interpDelay;

    // Find two snapshots to interpolate between
    let from = this.snapshotBuffer[this.snapshotBuffer.length - 2];
    let to = this.snapshotBuffer[this.snapshotBuffer.length - 1];

    const duration = to.time - from.time;
    if (duration <= 0) return;

    let t = (renderTime - from.time) / duration;
    t = Math.max(0, Math.min(1.2, t)); // allow slight extrapolation

    const remoteIdx = 1 - this.myIndex;
    const fromP = from.state.players[remoteIdx];
    const toP = to.state.players[remoteIdx];
    const fromB = from.state.ball;
    const toB = to.state.ball;

    // Interpolate remote player
    const rp = this.state.players[remoteIdx];
    rp.x = fromP.x + (toP.x - fromP.x) * t;
    rp.y = fromP.y + (toP.y - fromP.y) * t;
    rp.vx = toP.vx;
    rp.vy = toP.vy;
    rp.facing = toP.facing;
    rp.isKicking = toP.isKicking;
    rp.onGround = toP.onGround;

    // Interpolate ball
    this.state.ball.x = fromB.x + (toB.x - fromB.x) * t;
    this.state.ball.y = fromB.y + (toB.y - fromB.y) * t;
    this.state.ball.vx = toB.vx;
    this.state.ball.vy = toB.vy;
  }

  _lerpEntity(target, source, factor) {
    target.x += (source.x - target.x) * factor;
    target.y += (source.y - target.y) * factor;
    target.vx = source.vx;
    target.vy = source.vy;
    if ('facing' in source) target.facing = source.facing;
    if ('isKicking' in source) target.isKicking = source.isKicking;
    if ('onGround' in source) target.onGround = source.onGround;
  }
}
