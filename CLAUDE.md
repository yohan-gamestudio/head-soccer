# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm start          # Start server (node server.js) → http://localhost:3000
npm run dev        # Start with auto-reload (node --watch server.js)
```

No build step, test framework, or linter configured. Browser loads ES modules directly.

## Architecture

Real-time 1v1 multiplayer Head Soccer using **Server Authoritative + Client-Side Prediction** synchronization.

### Shared Code (`game/`)

`Constants.js` and `Physics.js` are used by **both server and client** via ES modules. The server imports them with Node.js ESM, the client imports them via `/game/` static route. Any physics change must work identically on both sides.

- `Physics.js` contains all game simulation: player movement, gravity, ball physics, circle/AABB collision, kick mechanics, goal detection
- `stepPhysics(state, dt)` is the single authoritative tick function

### Server (`server.js` + `server/Room.js`)

- Express serves `public/` and `game/` as static files
- WebSocket (ws) handles real-time communication
- `Room` class manages: room lifecycle, input queues per player, 60Hz game loop (`setInterval`), 20Hz snapshot broadcast
- Server processes latest input from each player's queue per tick, runs `stepPhysics`, sends serialized snapshots every 3 ticks

### Client (`public/js/`)

- `main.js` — Screen management (lobby → waiting → game → result), WebSocket event wiring
- `ClientGame.js` — Core game loop: sends inputs with sequence numbers, predicts local player, reconciles against server snapshots, interpolates remote player and ball
- `Renderer.js` — Canvas 2D drawing (field, goals, players with head/body/kick, ball)
- `Network.js` — WebSocket wrapper with event emitter pattern
- `Input.js` — Keyboard capture (Arrow keys/WASD + Space/X for kick)

### Synchronization Flow

1. **Client** sends `{type:"input", seq, keys}` every tick (60Hz)
2. **Server** drains input queue, applies physics, tracks `lastSeq` per player
3. **Server** broadcasts snapshots at 20Hz with `lastSeq` for each client
4. **Client** reconciles: rewinds to server state, replays inputs where `seq > lastSeq`
5. Position correction: snap if error >50px, lerp 30% if 1-50px, ignore <1px
6. Remote player & ball: interpolated between last 2 snapshots with 80ms delay

### WebSocket Protocol

**Client → Server**: `create_room`, `join_room`, `input`, `rematch`, `leave`
**Server → Client**: `room_created`, `room_joined`, `opponent_joined`, `countdown`, `game_start`, `snapshot`, `goal`, `game_over`, `opponent_left`, `rematch_request`, `error`

Snapshot state is compressed (short keys: `p`, `b`, `s`, `t`, `pa`; floats rounded; booleans as 0/1).

### Game Flow

Lobby → Room create/join → 3s countdown → 60s game (goals pause 1.5s, reset positions) → Result → Rematch or lobby

### Key Constants

Physics runs at `TICK_RATE=60`, snapshots at `SNAPSHOT_RATE=20`, field is 800x450, ground at y=400, game lasts 60s.
