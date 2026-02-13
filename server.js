import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';
import * as RoomManager from './server/Room.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));
app.use('/game', express.static(path.join(__dirname, 'game')));

// WebSocket handling
wss.on('connection', (ws) => {
  console.log('Player connected');

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    switch (msg.type) {
      case 'create_room':
        handleCreateRoom(ws, msg);
        break;
      case 'join_room':
        handleJoinRoom(ws, msg);
        break;
      case 'input':
        handleInput(ws, msg);
        break;
      case 'rematch':
        handleRematch(ws);
        break;
      case 'leave':
        handleLeave(ws);
        break;
    }
  });

  ws.on('close', () => {
    handleDisconnect(ws);
  });
});

function handleCreateRoom(ws, msg) {
  // Leave any existing room
  handleLeave(ws);

  const nickname = (msg.nickname || 'Player').substring(0, 12);
  const room = RoomManager.createRoom(ws, nickname);

  ws.send(JSON.stringify({
    type: 'room_created',
    roomId: room.id,
    nickname,
  }));

  console.log(`Room ${room.id} created by ${nickname}`);
}

function handleJoinRoom(ws, msg) {
  const roomId = (msg.roomId || '').toUpperCase().trim();
  const nickname = (msg.nickname || 'Player').substring(0, 12);
  const room = RoomManager.getRoom(roomId);

  if (!room) {
    ws.send(JSON.stringify({ type: 'error', message: '방을 찾을 수 없습니다.' }));
    return;
  }

  if (room.isFull) {
    ws.send(JSON.stringify({ type: 'error', message: '방이 가득 찼습니다.' }));
    return;
  }

  if (room.gameRunning) {
    ws.send(JSON.stringify({ type: 'error', message: '이미 게임이 진행 중입니다.' }));
    return;
  }

  room.addPlayer(ws, nickname);

  // Notify joiner
  ws.send(JSON.stringify({
    type: 'room_joined',
    roomId: room.id,
    playerIndex: 1,
    players: room.players.map(p => p ? p.nickname : null),
  }));

  // Notify host
  room.sendTo(0, {
    type: 'opponent_joined',
    nickname,
    players: room.players.map(p => p ? p.nickname : null),
  });

  console.log(`${nickname} joined room ${room.id}`);

  // Start countdown
  room.startCountdown();
}

function handleInput(ws, msg) {
  const room = RoomManager.findRoomByPlayer(ws);
  if (room) {
    room.handleInput(ws, msg);
  }
}

function handleRematch(ws) {
  const room = RoomManager.findRoomByPlayer(ws);
  if (!room || !room.gameOver) return;

  const idx = room.getPlayerIndex(ws);
  if (idx === -1) return;

  // Mark this player as wanting rematch
  room.players[idx].wantsRematch = true;

  const opponent = room.players[1 - idx];
  if (opponent) {
    // Notify opponent
    room.sendTo(1 - idx, { type: 'rematch_request', from: idx });

    // If both want rematch, restart
    if (opponent.wantsRematch) {
      room.players[0].wantsRematch = false;
      room.players[1].wantsRematch = false;
      room.startCountdown();
    }
  }
}

function handleLeave(ws) {
  const room = RoomManager.findRoomByPlayer(ws);
  if (!room) return;

  const idx = room.removePlayer(ws);
  if (idx === -1) return;

  // Notify remaining player
  const remaining = room.players[0] || room.players[1];
  if (remaining) {
    remaining.ws.send(JSON.stringify({ type: 'opponent_left' }));
  }

  // If room empty, remove it
  if (!room.players[0] && !room.players[1]) {
    RoomManager.removeRoom(room.id);
    console.log(`Room ${room.id} destroyed (empty)`);
  } else {
    // Stop running game
    room.destroy();
    room.gameOver = false;
    room.gameRunning = false;
  }
}

function handleDisconnect(ws) {
  handleLeave(ws);
  console.log('Player disconnected');
}

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Head Soccer server running on http://localhost:${PORT}`);
});
