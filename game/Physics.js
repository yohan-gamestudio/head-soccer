// Shared physics engine - used by both server and client
import * as C from './Constants.js';

/**
 * Create a fresh game state
 */
export function createGameState() {
  return {
    players: [
      createPlayer(1),
      createPlayer(2),
    ],
    ball: createBall(),
    score: [0, 0],
    timeLeft: C.GAME_DURATION,
    paused: false,
    pauseTimer: 0,
  };
}

export function createPlayer(playerNum) {
  const x = playerNum === 1 ? C.P1_SPAWN_X : C.P2_SPAWN_X;
  return {
    x,
    y: C.PLAYER_SPAWN_Y,
    vx: 0,
    vy: 0,
    facing: playerNum === 1 ? 1 : -1,  // 1 = right, -1 = left
    isKicking: false,
    kickTimer: 0,
    onGround: true,
    knockback: false,
    playerNum,
  };
}

export function createBall() {
  return {
    x: C.BALL_SPAWN_X,
    y: C.BALL_SPAWN_Y,
    vx: 0,
    vy: 0,
  };
}

export function resetPositions(state) {
  const p1 = state.players[0];
  const p2 = state.players[1];
  p1.x = C.P1_SPAWN_X;
  p1.y = C.PLAYER_SPAWN_Y;
  p1.vx = 0;
  p1.vy = 0;
  p1.facing = 1;
  p1.isKicking = false;
  p1.kickTimer = 0;
  p1.onGround = true;
  p1.knockback = false;

  p2.x = C.P2_SPAWN_X;
  p2.y = C.PLAYER_SPAWN_Y;
  p2.vx = 0;
  p2.vy = 0;
  p2.facing = -1;
  p2.isKicking = false;
  p2.kickTimer = 0;
  p2.onGround = true;
  p2.knockback = false;

  state.ball.x = C.BALL_SPAWN_X;
  state.ball.y = C.BALL_SPAWN_Y;
  state.ball.vx = 0;
  state.ball.vy = 0;
}

/**
 * Apply input to a player (does not step physics)
 */
export function applyInput(player, keys, dt) {
  // Skip input during knockback
  if (player.knockback) return;

  // Horizontal movement — acceleration based
  if (keys.left) {
    player.vx -= C.PLAYER_ACCEL * dt;
    player.facing = -1;
  } else if (keys.right) {
    player.vx += C.PLAYER_ACCEL * dt;
    player.facing = 1;
  } else {
    // Friction when no input
    player.vx *= C.PLAYER_FRICTION;
    if (Math.abs(player.vx) < 5) player.vx = 0;
  }

  // Clamp to max speed
  if (player.vx > C.PLAYER_MAX_SPEED) player.vx = C.PLAYER_MAX_SPEED;
  if (player.vx < -C.PLAYER_MAX_SPEED) player.vx = -C.PLAYER_MAX_SPEED;

  // Jump
  if (keys.up && player.onGround) {
    player.vy = C.JUMP_FORCE;
    player.onGround = false;
  }

  // Kick
  if (keys.kick && !player.isKicking) {
    player.isKicking = true;
    player.kickTimer = C.KICK_DURATION;
  }
}

/**
 * Step the full game state forward by dt seconds
 * Returns: 'goal1' | 'goal2' | null
 */
export function stepPhysics(state, dt) {
  if (state.paused) {
    state.pauseTimer -= dt * 1000;
    if (state.pauseTimer <= 0) {
      state.paused = false;
      resetPositions(state);
    }
    return null;
  }

  // Update timer
  state.timeLeft -= dt;
  if (state.timeLeft <= 0) {
    state.timeLeft = 0;
    return 'timeup';
  }

  // Update players
  for (const p of state.players) {
    stepPlayer(p, dt);
  }

  // Update ball
  stepBall(state.ball, dt);

  // Player-player collision
  resolvePlayerPlayerCollision(state.players[0], state.players[1]);

  // Kick-player collision first (kick pushes opponent before ball consumes it)
  for (let i = 0; i < 2; i++) {
    const attacker = state.players[i];
    const target = state.players[1 - i];
    if (attacker.isKicking) {
      resolveKickPlayerCollision(attacker, target);
    }
  }

  // Player-ball collisions
  for (const p of state.players) {
    resolvePlayerBallCollision(p, state.ball);

    // Kick collision
    if (p.isKicking) {
      resolveKickBallCollision(p, state.ball);
    }
  }

  // Check goals
  const goal = checkGoal(state.ball);
  if (goal) {
    if (goal === 'goal1') state.score[0]++;
    if (goal === 'goal2') state.score[1]++;
    state.paused = true;
    state.pauseTimer = C.GOAL_PAUSE_DURATION;
  }

  return goal;
}

function stepPlayer(p, dt) {
  // Gravity
  p.vy += C.GRAVITY * dt;

  // Move
  p.x += p.vx * dt;
  p.y += p.vy * dt;

  // Ground collision
  if (p.y >= C.GROUND_Y) {
    p.y = C.GROUND_Y;
    p.vy = 0;
    p.onGround = true;
    if (p.knockback) {
      p.knockback = false;
      p.vx = 0;
    }
  }

  // Wall collision - keep players on field but allow them to be near goals
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

function stepBall(ball, dt) {
  // Gravity
  ball.vy += C.GRAVITY * dt;

  // Move
  ball.x += ball.vx * dt;
  ball.y += ball.vy * dt;

  // Friction
  ball.vx *= C.BALL_FRICTION;

  // Ground
  if (ball.y + C.BALL_RADIUS >= C.GROUND_Y) {
    ball.y = C.GROUND_Y - C.BALL_RADIUS;
    ball.vy = -ball.vy * C.BALL_BOUNCE;
    ball.vx *= C.BALL_GROUND_FRICTION;
    // Stop tiny bounces
    if (Math.abs(ball.vy) < 20) ball.vy = 0;
  }

  // Ceiling
  if (ball.y - C.BALL_RADIUS < 0) {
    ball.y = C.BALL_RADIUS;
    ball.vy = Math.abs(ball.vy) * C.BALL_BOUNCE;
  }

  // Walls (but not goal areas)
  const inGoalYRange = (ball.y + C.BALL_RADIUS) > C.GOAL_Y;

  // Left wall
  if (ball.x - C.BALL_RADIUS < 0) {
    if (!inGoalYRange || ball.x - C.BALL_RADIUS > C.GOAL_WIDTH) {
      // Hit wall above goal or ball not in goal zone
      ball.x = C.BALL_RADIUS;
      ball.vx = Math.abs(ball.vx) * C.BALL_BOUNCE;
    }
  }

  // Right wall
  if (ball.x + C.BALL_RADIUS > C.FIELD_WIDTH) {
    if (!inGoalYRange || ball.x + C.BALL_RADIUS < C.FIELD_WIDTH - C.GOAL_WIDTH) {
      ball.x = C.FIELD_WIDTH - C.BALL_RADIUS;
      ball.vx = -Math.abs(ball.vx) * C.BALL_BOUNCE;
    }
  }

  // Goal post collisions (top bar of goals)
  // Left goal top bar
  if (ball.x - C.BALL_RADIUS < C.GOAL_WIDTH &&
      Math.abs(ball.y - C.GOAL_Y) < C.BALL_RADIUS) {
    ball.vy = -Math.abs(ball.vy) * C.BALL_BOUNCE;
    ball.y = C.GOAL_Y - C.BALL_RADIUS;
  }
  // Right goal top bar
  if (ball.x + C.BALL_RADIUS > C.FIELD_WIDTH - C.GOAL_WIDTH &&
      Math.abs(ball.y - C.GOAL_Y) < C.BALL_RADIUS) {
    ball.vy = -Math.abs(ball.vy) * C.BALL_BOUNCE;
    ball.y = C.GOAL_Y - C.BALL_RADIUS;
  }

  // Clamp speed
  const speed = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);
  if (speed > C.MAX_BALL_SPEED) {
    const scale = C.MAX_BALL_SPEED / speed;
    ball.vx *= scale;
    ball.vy *= scale;
  }
}

function resolvePlayerPlayerCollision(p1, p2) {
  // Head-to-head collision (circle vs circle)
  const head1Y = p1.y - C.PLAYER_BODY_H - C.PLAYER_RADIUS;
  const head2Y = p2.y - C.PLAYER_BODY_H - C.PLAYER_RADIUS;
  const dx = p2.x - p1.x;
  const dy = head2Y - head1Y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const minDist = C.PLAYER_RADIUS * 2;

  if (dist < minDist && dist > 0) {
    const nx = dx / dist;
    const ny = dy / dist;
    const overlap = minDist - dist;

    // Push both players apart equally
    p1.x -= nx * overlap * 0.5;
    p2.x += nx * overlap * 0.5;

    // Bounce velocities
    const relVx = p1.vx - p2.vx;
    const dot = relVx * nx;
    if (dot > 0) {
      p1.vx -= dot * nx * 0.5;
      p2.vx += dot * nx * 0.5;
    }
  }

  // Body-to-body collision (simple x-axis push)
  const bodyDx = p2.x - p1.x;
  const bodyDist = Math.abs(bodyDx);
  const bodyMinDist = C.PLAYER_BODY_W;

  // Only if vertically overlapping (bodies at same height)
  const body1Top = p1.y - C.PLAYER_BODY_H;
  const body2Top = p2.y - C.PLAYER_BODY_H;
  const verticalOverlap = Math.min(p1.y, p2.y) - Math.max(body1Top, body2Top);

  if (bodyDist < bodyMinDist && verticalOverlap > 0) {
    const pushDir = bodyDx > 0 ? 1 : -1;
    const bodyOverlap = bodyMinDist - bodyDist;
    p1.x -= pushDir * bodyOverlap * 0.5;
    p2.x += pushDir * bodyOverlap * 0.5;
  }
}

function resolvePlayerBallCollision(player, ball) {
  // Head collision (circle vs circle)
  const headX = player.x;
  const headY = player.y - C.PLAYER_BODY_H - C.PLAYER_RADIUS;
  const dx = ball.x - headX;
  const dy = ball.y - headY;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const minDist = C.PLAYER_RADIUS + C.BALL_RADIUS;

  if (dist < minDist && dist > 0) {
    // Push ball out
    const nx = dx / dist;
    const ny = dy / dist;
    const overlap = minDist - dist;
    ball.x += nx * overlap;
    ball.y += ny * overlap;

    // Bounce - add player velocity influence
    const relVx = ball.vx - player.vx;
    const relVy = ball.vy - player.vy;
    const dot = relVx * nx + relVy * ny;

    if (dot < 0) {
      ball.vx -= 2 * dot * nx;
      ball.vy -= 2 * dot * ny;

      // Add some force based on player movement
      ball.vx += player.vx * 0.5;
      ball.vy += player.vy * 0.3;

      // Minimum upward bounce when heading
      if (ny < -0.3 && ball.vy > -100) {
        ball.vy = -200;
      }
    }
  }

  // Body collision (simple AABB vs circle)
  const bodyLeft = player.x - C.PLAYER_BODY_W / 2;
  const bodyRight = player.x + C.PLAYER_BODY_W / 2;
  const bodyTop = player.y - C.PLAYER_BODY_H;
  const bodyBottom = player.y;

  const closestX = Math.max(bodyLeft, Math.min(ball.x, bodyRight));
  const closestY = Math.max(bodyTop, Math.min(ball.y, bodyBottom));
  const bDx = ball.x - closestX;
  const bDy = ball.y - closestY;
  const bDist = Math.sqrt(bDx * bDx + bDy * bDy);

  if (bDist < C.BALL_RADIUS && bDist > 0) {
    const bnx = bDx / bDist;
    const bny = bDy / bDist;
    ball.x = closestX + bnx * C.BALL_RADIUS;
    ball.y = closestY + bny * C.BALL_RADIUS;

    const bDot = ball.vx * bnx + ball.vy * bny;
    if (bDot < 0) {
      ball.vx -= 2 * bDot * bnx;
      ball.vy -= 2 * bDot * bny;
      ball.vx += player.vx * 0.3;
    }
  }
}

function resolveKickBallCollision(player, ball) {
  // Kick hitbox: a circle in front of the player at foot level
  const kickX = player.x + player.facing * (C.PLAYER_BODY_W / 2 + C.PLAYER_KICK_RADIUS);
  const kickY = player.y - C.PLAYER_BODY_H * 0.3;

  const dx = ball.x - kickX;
  const dy = ball.y - kickY;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const minDist = C.PLAYER_KICK_RADIUS + C.BALL_RADIUS;

  if (dist < minDist && dist > 0) {
    // Strong kick force in facing direction and slightly upward
    const angle = Math.atan2(-0.4, player.facing);  // Slightly upward
    ball.vx = Math.cos(angle) * C.KICK_FORCE;
    ball.vy = Math.sin(angle) * C.KICK_FORCE;

    // Push ball out of kick zone
    const nx = dx / dist;
    const ny = dy / dist;
    ball.x = kickX + nx * minDist;
    ball.y = kickY + ny * minDist;

    // Consume kick
    player.isKicking = false;
    player.kickTimer = 0;
  }
}

function resolveKickPlayerCollision(attacker, target) {
  const kickX = attacker.x + attacker.facing * (C.PLAYER_BODY_W / 2 + C.PLAYER_KICK_RADIUS);
  const kickY = attacker.y - C.PLAYER_BODY_H * 0.3;

  // Check against target head (circle vs circle)
  const targetHeadY = target.y - C.PLAYER_BODY_H - C.PLAYER_RADIUS;
  const hdx = target.x - kickX;
  const hdy = targetHeadY - kickY;
  const headDist = Math.sqrt(hdx * hdx + hdy * hdy);
  const headMinDist = C.PLAYER_KICK_RADIUS + C.PLAYER_RADIUS;

  // Check against target body (circle vs AABB)
  const bodyLeft = target.x - C.PLAYER_BODY_W / 2;
  const bodyRight = target.x + C.PLAYER_BODY_W / 2;
  const bodyTop = target.y - C.PLAYER_BODY_H;
  const bodyBottom = target.y;
  const closestX = Math.max(bodyLeft, Math.min(kickX, bodyRight));
  const closestY = Math.max(bodyTop, Math.min(kickY, bodyBottom));
  const bdx = kickX - closestX;
  const bdy = kickY - closestY;
  const bodyDist = Math.sqrt(bdx * bdx + bdy * bdy);

  if ((headDist < headMinDist && headDist > 0) || bodyDist < C.PLAYER_KICK_RADIUS) {
    // Launch target with force
    target.vx = attacker.facing * 350;
    target.vy = -250;
    target.onGround = false;
    target.knockback = true;

    // Consume kick
    attacker.isKicking = false;
    attacker.kickTimer = 0;
  }
}

function checkGoal(ball) {
  // Left goal (P2 scores)
  if (ball.x - C.BALL_RADIUS <= 0 && ball.y > C.GOAL_Y && ball.y < C.GROUND_Y) {
    return 'goal2';  // Player 2 scored
  }
  // Right goal (P1 scores)
  if (ball.x + C.BALL_RADIUS >= C.FIELD_WIDTH && ball.y > C.GOAL_Y && ball.y < C.GROUND_Y) {
    return 'goal1';  // Player 1 scored
  }
  return null;
}

/**
 * Serialize game state for network (minimal data)
 */
export function serializeState(state) {
  return {
    p: state.players.map(p => ({
      x: Math.round(p.x * 10) / 10,
      y: Math.round(p.y * 10) / 10,
      vx: Math.round(p.vx * 10) / 10,
      vy: Math.round(p.vy * 10) / 10,
      f: p.facing,
      k: p.isKicking ? 1 : 0,
      g: p.onGround ? 1 : 0,
      kb: p.knockback ? 1 : 0,
    })),
    b: {
      x: Math.round(state.ball.x * 10) / 10,
      y: Math.round(state.ball.y * 10) / 10,
      vx: Math.round(state.ball.vx),
      vy: Math.round(state.ball.vy),
    },
    s: state.score,
    t: Math.round(state.timeLeft * 10) / 10,
    pa: state.paused ? 1 : 0,
  };
}

/**
 * Deserialize network state back into game state format
 */
export function deserializeState(data) {
  return {
    players: data.p.map((p, i) => ({
      x: p.x,
      y: p.y,
      vx: p.vx,
      vy: p.vy,
      facing: p.f,
      isKicking: p.k === 1,
      kickTimer: p.k === 1 ? C.KICK_DURATION : 0,
      onGround: p.g === 1,
      knockback: p.kb === 1,
      playerNum: i + 1,
    })),
    ball: { x: data.b.x, y: data.b.y, vx: data.b.vx, vy: data.b.vy },
    score: data.s,
    timeLeft: data.t,
    paused: data.pa === 1,
    pauseTimer: data.pa === 1 ? C.GOAL_PAUSE_DURATION : 0,
  };
}

/**
 * Clone state (deep enough for our purposes)
 */
export function cloneState(state) {
  return {
    players: state.players.map(p => ({ ...p })),
    ball: { ...state.ball },
    score: [...state.score],
    timeLeft: state.timeLeft,
    paused: state.paused,
    pauseTimer: state.pauseTimer,
  };
}
