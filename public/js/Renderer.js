// Canvas renderer for the game
import * as C from '/game/Constants.js';

const COLORS = {
  sky: '#87CEEB',
  skyBottom: '#c9e8f7',
  standUpper: '#5a3e28',
  standLower: '#6b4c30',
  standSeat1: '#cc3333',
  standSeat2: '#3366cc',
  standSeat3: '#33aa55',
  standSeat4: '#ddaa22',
  grass: '#4CAF50',
  grassDark: '#388E3C',
  grassLight: '#66BB6A',
  fieldLine: 'rgba(255,255,255,0.35)',
  goalPost: '#ffffff',
  goalNet: 'rgba(255,255,255,0.15)',
  goalNetLine: 'rgba(255,255,255,0.12)',
  ball: '#fff',
  ballOutline: '#999',
  ballPattern: '#333',
  skin: '#F0C8A0',
  skinShadow: '#D4A574',
  p1Hair: '#3B2314',
  p1Body: '#cc2233',
  p1BodyDark: '#991122',
  p2Hair: '#C8A04B',
  p2Body: '#2244aa',
  p2BodyDark: '#112266',
  kickEffect: 'rgba(255, 235, 59, 0.4)',
};

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.canvas.width = C.FIELD_WIDTH;
    this.canvas.height = C.FIELD_HEIGHT;
    this._crowdCache = null;
    this._goalAnim = { active: false, timer: 0, score: '' };
  }

  clear() {
    const ctx = this.ctx;

    // Sky gradient
    const skyGrad = ctx.createLinearGradient(0, 0, 0, C.GROUND_Y * 0.4);
    skyGrad.addColorStop(0, COLORS.sky);
    skyGrad.addColorStop(1, COLORS.skyBottom);
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, C.FIELD_WIDTH, C.GROUND_Y * 0.4);

    // Stadium stands
    this._drawStadium();

    // Ground with grass stripes
    this._drawGrass();

    // Field markings
    this._drawFieldMarkings();
  }

  _drawStadium() {
    const ctx = this.ctx;
    const standTop = C.GROUND_Y * 0.15;
    const standBottom = C.GROUND_Y;
    const standHeight = standBottom - standTop;

    // Stadium back wall
    const wallGrad = ctx.createLinearGradient(0, standTop, 0, standBottom);
    wallGrad.addColorStop(0, '#3a2818');
    wallGrad.addColorStop(1, '#2a1e12');
    ctx.fillStyle = wallGrad;
    ctx.fillRect(0, standTop, C.FIELD_WIDTH, standHeight);

    // Draw crowd rows
    if (!this._crowdCache) {
      this._crowdCache = this._generateCrowd();
    }

    const rows = 12;
    const rowHeight = standHeight / rows;

    for (let r = 0; r < rows; r++) {
      const rowY = standTop + r * rowHeight;
      const perspective = 0.3 + (r / rows) * 0.7;

      // Seat row background
      ctx.fillStyle = r % 2 === 0 ? 'rgba(60,40,25,0.6)' : 'rgba(50,35,20,0.6)';
      ctx.fillRect(0, rowY, C.FIELD_WIDTH, rowHeight);

      // Crowd dots
      const dotSize = 2 + perspective * 3;
      const spacing = 8 + (1 - perspective) * 4;

      for (let cx = spacing / 2; cx < C.FIELD_WIDTH; cx += spacing) {
        const crowdIdx = Math.floor(r * 100 + cx) % this._crowdCache.length;
        const color = this._crowdCache[crowdIdx];
        ctx.fillStyle = color;
        ctx.fillRect(cx - dotSize / 2, rowY + rowHeight * 0.2, dotSize, dotSize * 1.3);
      }
    }

    // Stadium roof shadow
    const roofGrad = ctx.createLinearGradient(0, 0, 0, standTop + 30);
    roofGrad.addColorStop(0, 'rgba(0,0,0,0.5)');
    roofGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = roofGrad;
    ctx.fillRect(0, 0, C.FIELD_WIDTH, standTop + 30);

    // Horizontal rail/barrier before the pitch
    ctx.fillStyle = '#555';
    ctx.fillRect(0, C.GROUND_Y - 3, C.FIELD_WIDTH, 3);
  }

  _generateCrowd() {
    const colors = [];
    const palette = [
      '#cc3333', '#dd4444', '#3366cc', '#4477dd',
      '#33aa55', '#ddaa22', '#ffffff', '#eeeeee',
      '#ff6600', '#9933cc', '#ff3399', '#00aacc',
      '#ffcc00', '#336633', '#663333', '#333366',
    ];
    for (let i = 0; i < 500; i++) {
      colors.push(palette[Math.floor(Math.random() * palette.length)]);
    }
    return colors;
  }

  _drawGrass() {
    const ctx = this.ctx;
    const grassHeight = C.FIELD_HEIGHT - C.GROUND_Y;

    // Base grass
    ctx.fillStyle = COLORS.grass;
    ctx.fillRect(0, C.GROUND_Y, C.FIELD_WIDTH, grassHeight);

    // Grass stripes
    const stripeWidth = 60;
    for (let sx = 0; sx < C.FIELD_WIDTH; sx += stripeWidth * 2) {
      ctx.fillStyle = COLORS.grassDark;
      ctx.fillRect(sx, C.GROUND_Y, stripeWidth, grassHeight);
    }

    // Grass top edge highlight
    ctx.fillStyle = COLORS.grassLight;
    ctx.fillRect(0, C.GROUND_Y, C.FIELD_WIDTH, 2);
  }

  _drawFieldMarkings() {
    const ctx = this.ctx;

    // Center line
    ctx.strokeStyle = COLORS.fieldLine;
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 6]);
    ctx.beginPath();
    ctx.moveTo(C.FIELD_WIDTH / 2, C.GROUND_Y * 0.5);
    ctx.lineTo(C.FIELD_WIDTH / 2, C.GROUND_Y);
    ctx.stroke();
    ctx.setLineDash([]);

    // Center circle
    ctx.beginPath();
    ctx.arc(C.FIELD_WIDTH / 2, C.GROUND_Y, 55, Math.PI, 2 * Math.PI);
    ctx.stroke();

    // Center dot
    ctx.fillStyle = COLORS.fieldLine;
    ctx.beginPath();
    ctx.arc(C.FIELD_WIDTH / 2, C.GROUND_Y, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  drawGoals() {
    const ctx = this.ctx;
    // Left goal
    this._drawGoal(0, C.GOAL_Y, C.GOAL_WIDTH, C.GOAL_HEIGHT, 'left');
    // Right goal
    this._drawGoal(C.FIELD_WIDTH - C.GOAL_WIDTH, C.GOAL_Y, C.GOAL_WIDTH, C.GOAL_HEIGHT, 'right');
  }

  _drawGoal(x, y, w, h, side) {
    const ctx = this.ctx;

    // Goal depth background
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(x, y, w, h);

    // Net pattern
    ctx.strokeStyle = COLORS.goalNetLine;
    ctx.lineWidth = 0.8;
    const step = 8;

    // Horizontal net lines
    for (let i = 0; i <= h; i += step) {
      ctx.beginPath();
      ctx.moveTo(x, y + i);
      ctx.lineTo(x + w, y + i);
      ctx.stroke();
    }
    // Vertical net lines
    for (let i = 0; i <= w; i += step) {
      ctx.beginPath();
      ctx.moveTo(x + i, y);
      ctx.lineTo(x + i, y + h);
      ctx.stroke();
    }

    // Goal posts (thick white)
    ctx.strokeStyle = COLORS.goalPost;
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();

    if (side === 'left') {
      // Top bar
      ctx.moveTo(x, y);
      ctx.lineTo(x + w, y);
      // Front post
      ctx.moveTo(x + w, y);
      ctx.lineTo(x + w, y + h);
      // Back post
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + h);
    } else {
      // Top bar
      ctx.moveTo(x, y);
      ctx.lineTo(x + w, y);
      // Front post
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + h);
      // Back post
      ctx.moveTo(x + w, y);
      ctx.lineTo(x + w, y + h);
    }
    ctx.stroke();
    ctx.lineCap = 'butt';
  }

  drawPlayer(player, isLocal) {
    const ctx = this.ctx;
    const { x, y, facing, isKicking, playerNum } = player;

    const bodyColor = playerNum === 1 ? COLORS.p1Body : COLORS.p2Body;
    const bodyDark = playerNum === 1 ? COLORS.p1BodyDark : COLORS.p2BodyDark;
    const hairColor = playerNum === 1 ? COLORS.p1Hair : COLORS.p2Hair;
    const headR = C.PLAYER_RADIUS;

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.ellipse(x, C.GROUND_Y + 2, headR * 0.5, 3, 0, 0, Math.PI * 2);
    ctx.fill();

    // Shoes/feet (big, visible under head)
    ctx.fillStyle = bodyColor;
    // Left shoe
    ctx.beginPath();
    ctx.ellipse(x - 10, y + 4, 10, 5, -0.15, 0, Math.PI * 2);
    ctx.fill();
    // Right shoe
    ctx.beginPath();
    ctx.ellipse(x + 10, y + 4, 10, 5, 0.15, 0, Math.PI * 2);
    ctx.fill();
    // Shoe outlines
    ctx.strokeStyle = bodyDark;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(x - 10, y + 4, 10, 5, -0.15, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(x + 10, y + 4, 10, 5, 0.15, 0, Math.PI * 2);
    ctx.stroke();

    // Head
    const headY = y - C.PLAYER_BODY_H - headR;

    // Head shadow
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    ctx.beginPath();
    ctx.arc(x + 1, headY + 1, headR, 0, Math.PI * 2);
    ctx.fill();

    // Skin
    ctx.fillStyle = COLORS.skin;
    ctx.beginPath();
    ctx.arc(x, headY, headR, 0, Math.PI * 2);
    ctx.fill();

    // Skin shadow (lower half)
    ctx.fillStyle = COLORS.skinShadow;
    ctx.beginPath();
    ctx.arc(x, headY, headR, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.fill();

    // Head outline
    ctx.strokeStyle = 'rgba(100,60,30,0.3)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, headY, headR, 0, Math.PI * 2);
    ctx.stroke();

    // Hair
    ctx.fillStyle = hairColor;
    if (playerNum === 1) {
      // Short buzz cut
      ctx.beginPath();
      ctx.arc(x, headY, headR, Math.PI * 1.05, Math.PI * 1.95);
      ctx.fill();
      // Slight top volume
      ctx.beginPath();
      ctx.ellipse(x, headY - headR * 0.85, headR * 0.7, headR * 0.2, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Longer side-swept hair
      ctx.beginPath();
      ctx.arc(x, headY, headR, Math.PI * 1.0, Math.PI * 2.0);
      ctx.fill();
      // Hair volume on top
      ctx.beginPath();
      ctx.ellipse(x + facing * 5, headY - headR * 0.8, headR * 0.8, headR * 0.3, facing * 0.2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Ears
    ctx.fillStyle = COLORS.skinShadow;
    ctx.beginPath();
    ctx.ellipse(x - headR * 0.92, headY + 2, 4, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(x + headR * 0.92, headY + 2, 4, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    // Eyes (small, realistic)
    const eyeOffsetX = facing * 8;
    const eyeY = headY - 2;

    // Eyebrows
    ctx.strokeStyle = hairColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + eyeOffsetX - 10, eyeY - 7);
    ctx.lineTo(x + eyeOffsetX - 3, eyeY - 8);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + eyeOffsetX + 3, eyeY - 8);
    ctx.lineTo(x + eyeOffsetX + 10, eyeY - 7);
    ctx.stroke();

    // Eye whites (small)
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.ellipse(x + eyeOffsetX - 6, eyeY, 4, 3.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(x + eyeOffsetX + 6, eyeY, 4, 3.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Pupils (dark, small)
    ctx.fillStyle = '#1a1a1a';
    ctx.beginPath();
    ctx.arc(x + eyeOffsetX - 6 + facing * 1.5, eyeY, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x + eyeOffsetX + 6 + facing * 1.5, eyeY, 2, 0, Math.PI * 2);
    ctx.fill();

    // Nose (subtle line)
    ctx.strokeStyle = 'rgba(150,100,60,0.4)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x + facing * 4, headY + 2);
    ctx.lineTo(x + facing * 6, headY + 7);
    ctx.lineTo(x + facing * 3, headY + 8);
    ctx.stroke();

    // Mouth
    ctx.strokeStyle = 'rgba(120,60,40,0.6)';
    ctx.lineWidth = 1.5;
    if (isKicking) {
      // Open mouth (effort)
      ctx.fillStyle = 'rgba(80,20,10,0.8)';
      ctx.beginPath();
      ctx.ellipse(x + facing * 5, headY + 14, 4, 3, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Neutral/slight expression
      ctx.beginPath();
      ctx.moveTo(x + facing * 2, headY + 13);
      ctx.quadraticCurveTo(x + facing * 5, headY + 15, x + facing * 8, headY + 13);
      ctx.stroke();
    }

    // Kick effect
    if (isKicking) {
      const kickX = x + facing * (C.PLAYER_BODY_W / 2 + C.PLAYER_KICK_RADIUS);
      const kickY = y - C.PLAYER_BODY_H * 0.3;
      ctx.fillStyle = COLORS.kickEffect;
      ctx.beginPath();
      ctx.arc(kickX, kickY, C.PLAYER_KICK_RADIUS, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#222';
      ctx.beginPath();
      ctx.arc(kickX, kickY, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    // Local player indicator
    if (isLocal) {
      ctx.fillStyle = '#FFD700';
      ctx.beginPath();
      ctx.moveTo(x, headY - headR - 12);
      ctx.lineTo(x - 5, headY - headR - 4);
      ctx.lineTo(x + 5, headY - headR - 4);
      ctx.closePath();
      ctx.fill();
    }
  }

  drawBall(ball) {
    const ctx = this.ctx;
    const { x, y } = ball;
    const r = C.BALL_RADIUS;

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(x, C.GROUND_Y + 2, r * 0.8, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    // Ball body
    ctx.fillStyle = COLORS.ball;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();

    // Soccer ball pattern - pentagons
    ctx.fillStyle = COLORS.ballPattern;
    // Center pentagon
    this._drawPentagon(ctx, x, y, r * 0.35);
    // Surrounding pentagons
    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * Math.PI * 2 - Math.PI / 2;
      const px = x + Math.cos(angle) * r * 0.6;
      const py = y + Math.sin(angle) * r * 0.6;
      this._drawPentagon(ctx, px, py, r * 0.2);
    }

    // Ball outline
    ctx.strokeStyle = COLORS.ballOutline;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();

    // Highlight
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.beginPath();
    ctx.arc(x - r * 0.25, y - r * 0.3, r * 0.3, 0, Math.PI * 2);
    ctx.fill();
  }

  _drawPentagon(ctx, cx, cy, r) {
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * Math.PI * 2 - Math.PI / 2;
      const px = cx + Math.cos(angle) * r;
      const py = cy + Math.sin(angle) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  }

  showGoalAnimation(score) {
    this._goalAnim = {
      active: true,
      timer: 1500,
      score: `${score[0]} - ${score[1]}`,
    };
  }

  _drawGoalAnimation(dt) {
    if (!this._goalAnim.active) return;
    this._goalAnim.timer -= dt;
    if (this._goalAnim.timer <= 0) {
      this._goalAnim.active = false;
      return;
    }

    const ctx = this.ctx;
    const progress = 1 - (this._goalAnim.timer / 1500);
    const alpha = progress < 0.8 ? 1 : 1 - ((progress - 0.8) / 0.2);
    const scale = 0.5 + Math.min(progress * 3, 1) * 0.5;

    // Overlay
    ctx.fillStyle = `rgba(0,0,0,${0.3 * alpha})`;
    ctx.fillRect(0, 0, C.FIELD_WIDTH, C.FIELD_HEIGHT);

    ctx.save();
    ctx.translate(C.FIELD_WIDTH / 2, C.FIELD_HEIGHT / 2 - 20);
    ctx.scale(scale, scale);
    ctx.globalAlpha = alpha;

    // GOAL! text
    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 48px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('GOAL!', 0, -30);

    // Score
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 64px sans-serif';
    ctx.fillText(this._goalAnim.score, 0, 30);

    ctx.globalAlpha = 1;
    ctx.restore();
  }

  drawPauseInfo(text) {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(0, 0, C.FIELD_WIDTH, C.FIELD_HEIGHT);

    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 40px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, C.FIELD_WIDTH / 2, C.FIELD_HEIGHT / 2);
  }

  render(state, localPlayerIndex, dt) {
    this.clear();
    this.drawGoals();

    // Draw remote player first (behind), then local
    const remoteIdx = 1 - localPlayerIndex;
    this.drawPlayer(state.players[remoteIdx], false);
    this.drawPlayer(state.players[localPlayerIndex], true);

    this.drawBall(state.ball);

    if (state.paused) {
      this._drawGoalAnimation(dt || 16);
    }
  }
}
