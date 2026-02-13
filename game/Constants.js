// Shared constants used by both server and client

export const FIELD_WIDTH = 800;
export const FIELD_HEIGHT = 450;
export const GROUND_Y = 400;

// Goals
export const GOAL_WIDTH = 45;
export const GOAL_HEIGHT = 160;
export const GOAL_Y = GROUND_Y - GOAL_HEIGHT;

// Player
export const PLAYER_RADIUS = 26;       // Head (big head style)
export const PLAYER_BODY_W = 13;
export const PLAYER_BODY_H = 5;
export const PLAYER_MAX_SPEED = 280;
export const PLAYER_ACCEL = 1800;       // acceleration per second
export const PLAYER_FRICTION = 0.82;    // ground friction when no input
export const JUMP_FORCE = -416;
export const GRAVITY = 900;
export const PLAYER_KICK_RADIUS = 18;
export const KICK_FORCE = 700;
export const KICK_DURATION = 150;       // ms

// Ball
export const BALL_RADIUS = 18;
export const BALL_BOUNCE = 0.65;
export const BALL_FRICTION = 0.998;
export const BALL_GROUND_FRICTION = 0.97;
export const MAX_BALL_SPEED = 900;

// Game rules
export const GAME_DURATION = 60;        // seconds
export const GOAL_PAUSE_DURATION = 1500; // ms pause after goal
export const COUNTDOWN_DURATION = 3;    // seconds

// Network
export const TICK_RATE = 60;
export const SNAPSHOT_RATE = 40;
export const FIXED_DT = 1 / TICK_RATE;

// Spawn positions
export const P1_SPAWN_X = 130;
export const P2_SPAWN_X = FIELD_WIDTH - 130;
export const PLAYER_SPAWN_Y = GROUND_Y;
export const BALL_SPAWN_X = FIELD_WIDTH / 2;
export const BALL_SPAWN_Y = 200;
