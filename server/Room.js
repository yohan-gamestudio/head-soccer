import * as Physics from '../game/Physics.js';
import * as C from '../game/Constants.js';

let roomIdCounter = 0;

function generateRoomId() {
  // 4-digit numeric code
  return String(Math.floor(1000 + Math.random() * 9000));
}

export class Room {
  constructor(hostWs, hostNickname) {
    this.id = generateRoomId();
    this.players = [
      { ws: hostWs, nickname: hostNickname, inputQueue: [], lastSeq: 0 },
      null,
    ];
    this.state = null;
    this.tick = 0;
    this.gameRunning = false;
    this.gameOver = false;
    this.tickInterval = null;
    this.snapshotCounter = 0;
    this.countdownTimer = null;
  }

  get isFull() {
    return this.players[0] !== null && this.players[1] !== null;
  }

  addPlayer(ws, nickname) {
    if (this.players[1] !== null) return false;
    this.players[1] = { ws, nickname, inputQueue: [], lastSeq: 0 };
    return true;
  }

  removePlayer(ws) {
    for (let i = 0; i < 2; i++) {
      if (this.players[i] && this.players[i].ws === ws) {
        this.players[i] = null;
        return i;
      }
    }
    return -1;
  }

  getPlayerIndex(ws) {
    for (let i = 0; i < 2; i++) {
      if (this.players[i] && this.players[i].ws === ws) return i;
    }
    return -1;
  }

  getOpponent(ws) {
    const idx = this.getPlayerIndex(ws);
    if (idx === -1) return null;
    return this.players[1 - idx];
  }

  broadcast(msg) {
    const data = JSON.stringify(msg);
    for (const p of this.players) {
      if (p && p.ws.readyState === 1) {
        p.ws.send(data);
      }
    }
  }

  sendTo(playerIndex, msg) {
    const p = this.players[playerIndex];
    if (p && p.ws.readyState === 1) {
      p.ws.send(JSON.stringify(msg));
    }
  }

  startCountdown() {
    let count = C.COUNTDOWN_DURATION;
    this.broadcast({ type: 'countdown', count });

    this.countdownTimer = setInterval(() => {
      count--;
      if (count > 0) {
        this.broadcast({ type: 'countdown', count });
      } else {
        clearInterval(this.countdownTimer);
        this.countdownTimer = null;
        this.startGame();
      }
    }, 1000);
  }

  startGame() {
    this.state = Physics.createGameState();
    this.tick = 0;
    this.gameRunning = true;
    this.gameOver = false;
    this.snapshotCounter = 0;

    // Clear input queues
    for (const p of this.players) {
      if (p) {
        p.inputQueue = [];
        p.lastSeq = 0;
      }
    }

    this.broadcast({
      type: 'game_start',
      state: Physics.serializeState(this.state),
      players: this.players.map(p => p ? p.nickname : null),
    });

    // Start game loop at fixed tick rate
    const tickMs = 1000 / C.TICK_RATE;
    this.tickInterval = setInterval(() => this.gameTick(), tickMs);
  }

  gameTick() {
    if (!this.gameRunning || !this.state) return;

    this.tick++;

    // Process inputs for each player
    for (let i = 0; i < 2; i++) {
      const p = this.players[i];
      if (!p) continue;

      // Get latest input from queue
      let latestInput = null;
      while (p.inputQueue.length > 0) {
        latestInput = p.inputQueue.shift();
        p.lastSeq = latestInput.seq;
      }

      if (latestInput) {
        Physics.applyInput(this.state.players[i], latestInput.keys, C.FIXED_DT);
      } else {
        // No input: apply friction
        Physics.applyInput(this.state.players[i], {}, C.FIXED_DT);
      }
    }

    // Step physics
    const result = Physics.stepPhysics(this.state, C.FIXED_DT);

    // Handle goal
    if (result === 'goal1' || result === 'goal2') {
      const scorer = result === 'goal1' ? 0 : 1;
      this.broadcast({
        type: 'goal',
        scorer,
        score: [...this.state.score],
      });
    }

    // Handle time up
    if (result === 'timeup') {
      this.endGame();
      return;
    }

    // Send snapshots at SNAPSHOT_RATE
    this.snapshotCounter++;
    if (this.snapshotCounter >= C.TICK_RATE / C.SNAPSHOT_RATE) {
      this.snapshotCounter = 0;
      this.sendSnapshots();
    }
  }

  sendSnapshots() {
    const serialized = Physics.serializeState(this.state);
    for (let i = 0; i < 2; i++) {
      const p = this.players[i];
      if (!p || p.ws.readyState !== 1) continue;
      p.ws.send(JSON.stringify({
        type: 'snapshot',
        tick: this.tick,
        lastSeq: p.lastSeq,
        state: serialized,
        you: i,
      }));
    }
  }

  handleInput(ws, msg) {
    const idx = this.getPlayerIndex(ws);
    if (idx === -1 || !this.gameRunning) return;
    this.players[idx].inputQueue.push({
      seq: msg.seq,
      keys: msg.keys,
    });
  }

  endGame() {
    this.gameRunning = false;
    this.gameOver = true;
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }

    const score = this.state.score;
    let winner = -1; // draw
    if (score[0] > score[1]) winner = 0;
    else if (score[1] > score[0]) winner = 1;

    this.broadcast({
      type: 'game_over',
      score: [...score],
      winner,
    });
  }

  destroy() {
    this.gameRunning = false;
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
  }
}

// Room manager
const rooms = new Map();

export function createRoom(ws, nickname) {
  const room = new Room(ws, nickname);
  rooms.set(room.id, room);
  return room;
}

export function getRoom(id) {
  return rooms.get(id) || null;
}

export function removeRoom(id) {
  const room = rooms.get(id);
  if (room) {
    room.destroy();
    rooms.delete(id);
  }
}

export function findRoomByPlayer(ws) {
  for (const room of rooms.values()) {
    if (room.getPlayerIndex(ws) !== -1) return room;
  }
  return null;
}
