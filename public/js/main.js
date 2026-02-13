// Main entry point - screen management and game orchestration
import { Network } from './Network.js';
import { Renderer } from './Renderer.js';
import { Input } from './Input.js';
import { ClientGame } from './ClientGame.js';

// DOM elements
const screens = {
  nickname: document.getElementById('screen-nickname'),
  lobby: document.getElementById('screen-lobby'),
  join: document.getElementById('screen-join'),
  waiting: document.getElementById('screen-waiting'),
  game: document.getElementById('screen-game'),
  result: document.getElementById('screen-result'),
};

const dom = {
  nicknameInput: document.getElementById('nickname'),
  btnNext: document.getElementById('btn-next'),
  lobbyNickname: document.getElementById('lobby-nickname'),
  btnCreate: document.getElementById('btn-create'),
  btnJoinToggle: document.getElementById('btn-join-toggle'),
  roomCodeInput: document.getElementById('room-code-input'),
  btnJoin: document.getElementById('btn-join'),
  btnJoinBack: document.getElementById('btn-join-back'),
  btnLobbyBack: document.getElementById('btn-lobby-back'),
  lobbyError: document.getElementById('lobby-error'),
  joinError: document.getElementById('join-error'),
  roomCode: document.getElementById('room-code'),
  btnCancel: document.getElementById('btn-cancel'),
  canvas: document.getElementById('game-canvas'),
  hudNameP1: document.getElementById('hud-name-p1'),
  hudNameP2: document.getElementById('hud-name-p2'),
  hudScoreP1: document.getElementById('hud-score-p1'),
  hudScoreP2: document.getElementById('hud-score-p2'),
  hudTimer: document.getElementById('hud-timer'),
  countdownOverlay: document.getElementById('countdown-overlay'),
  countdownNumber: document.getElementById('countdown-number'),
  goalOverlay: document.getElementById('goal-overlay'),
  resultTitle: document.getElementById('result-title'),
  resultNameP1: document.getElementById('result-name-p1'),
  resultNameP2: document.getElementById('result-name-p2'),
  resultScoreP1: document.getElementById('result-score-p1'),
  resultScoreP2: document.getElementById('result-score-p2'),
  resultWinner: document.getElementById('result-winner'),
  btnRematch: document.getElementById('btn-rematch'),
  btnLobby: document.getElementById('btn-lobby'),
  rematchStatus: document.getElementById('rematch-status'),
  disconnectOverlay: document.getElementById('disconnect-overlay'),
  btnDisconnectLobby: document.getElementById('btn-disconnect-lobby'),
};

// State
let network = null;
let renderer = null;
let input = null;
let clientGame = null;
let currentRoomId = null;
let myIndex = 0;
let playerNames = ['P1', 'P2'];

// Screen management
function showScreen(name) {
  for (const [key, el] of Object.entries(screens)) {
    el.classList.toggle('active', key === name);
  }
  // Hide overlays when switching screens
  dom.countdownOverlay.classList.add('hidden');
  dom.goalOverlay.classList.add('hidden');
  dom.disconnectOverlay.classList.add('hidden');
  // Resize canvas when game screen becomes active
  if (name === 'game') setTimeout(resizeCanvasForMobile, 100);
}

function showError(msg) {
  const errorEl = screens.join.classList.contains('active') ? dom.joinError : dom.lobbyError;
  errorEl.textContent = msg;
  errorEl.classList.remove('hidden');
  setTimeout(() => errorEl.classList.add('hidden'), 3000);
}

// Initialize
async function init() {
  renderer = new Renderer(dom.canvas);
  input = new Input();

  // Load saved nickname
  const savedName = localStorage.getItem('hs_nickname');
  if (savedName) dom.nicknameInput.value = savedName;

  setupEvents();
  showScreen('nickname');
}

let myNickname = '';

function setupEvents() {
  // Nickname screen
  dom.btnNext.addEventListener('click', () => goToLobby());
  dom.nicknameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') goToLobby();
  });

  // Lobby screen
  dom.btnCreate.addEventListener('click', () => createRoom());
  dom.btnJoinToggle.addEventListener('click', () => {
    showScreen('join');
    dom.roomCodeInput.focus();
  });
  dom.btnJoin.addEventListener('click', () => joinRoom());
  dom.btnJoinBack.addEventListener('click', () => {
    showScreen('lobby');
  });
  dom.btnLobbyBack.addEventListener('click', () => {
    showScreen('nickname');
  });
  dom.roomCodeInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') joinRoom();
  });
  dom.btnCancel.addEventListener('click', () => leaveRoom());
  dom.btnRematch.addEventListener('click', () => requestRematch());
  dom.btnLobby.addEventListener('click', () => leaveRoom());
  dom.btnDisconnectLobby.addEventListener('click', () => {
    dom.disconnectOverlay.classList.add('hidden');
    leaveRoom();
  });
}

function goToLobby() {
  myNickname = dom.nicknameInput.value.trim() || 'Player';
  localStorage.setItem('hs_nickname', myNickname);
  dom.lobbyNickname.textContent = myNickname;
  showScreen('lobby');
}

async function ensureConnected() {
  if (network && network.connected) return;

  network = new Network();
  await network.connect();

  // Global handlers
  network.on('error', (msg) => {
    showError(msg.message);
    // If we're in waiting screen, go back to lobby
    if (screens.waiting.classList.contains('active')) {
      showScreen('lobby');
    }
    // If we're in join screen, stay on join screen (error shown there)
  });

  network.on('opponent_left', () => {
    if (clientGame) clientGame.stop();
    dom.disconnectOverlay.classList.remove('hidden');
  });

  network.on('disconnected', () => {
    if (clientGame) clientGame.stop();
    showScreen('lobby');
    showError('서버와의 연결이 끊어졌습니다.');
  });

  network.on('room_created', (msg) => {
    currentRoomId = msg.roomId;
    dom.roomCode.textContent = msg.roomId;
    showScreen('waiting');
  });

  network.on('room_joined', (msg) => {
    currentRoomId = msg.roomId;
    myIndex = msg.playerIndex;
    playerNames = msg.players;
    // Will receive countdown soon
    showScreen('game');
  });

  network.on('opponent_joined', (msg) => {
    playerNames = msg.players;
    showScreen('game');
  });

  network.on('countdown', (msg) => {
    showScreen('game');
    dom.countdownOverlay.classList.remove('hidden');
    dom.countdownNumber.textContent = msg.count;
    // Re-trigger animation
    dom.countdownNumber.style.animation = 'none';
    dom.countdownNumber.offsetHeight; // force reflow
    dom.countdownNumber.style.animation = 'pulse 0.5s ease-out';
  });

  network.on('game_start', (msg) => {
    dom.countdownOverlay.classList.add('hidden');
    myIndex = msg.state.p.length > 0 ? myIndex : 0; // keep assigned index
    playerNames = msg.players;

    // Update HUD names
    dom.hudNameP1.textContent = playerNames[0] || 'P1';
    dom.hudNameP2.textContent = playerNames[1] || 'P2';
    dom.hudScoreP1.textContent = '0';
    dom.hudScoreP2.textContent = '0';
    dom.hudTimer.textContent = '60';

    // Detect which player we are from server
    // myIndex is set in room_joined for joiner, default 0 for creator
    startGame(msg.state);
  });

  network.on('rematch_request', () => {
    dom.rematchStatus.textContent = '상대가 다시 하기를 원합니다!';
    dom.rematchStatus.classList.remove('hidden');
  });
}

function startGame(initialState) {
  if (clientGame) clientGame.stop();

  clientGame = new ClientGame(network, renderer, input);

  clientGame.onScoreUpdate = (score) => {
    dom.hudScoreP1.textContent = score[0];
    dom.hudScoreP2.textContent = score[1];
  };

  clientGame.onTimeUpdate = (timeLeft) => {
    dom.hudTimer.textContent = Math.ceil(timeLeft);
  };

  clientGame.onGoal = (scorer, score) => {
    dom.hudScoreP1.textContent = score[0];
    dom.hudScoreP2.textContent = score[1];
    // Show goal overlay briefly
    dom.goalOverlay.classList.remove('hidden');
    setTimeout(() => dom.goalOverlay.classList.add('hidden'), 1200);
  };

  clientGame.onGameOver = (score, winner) => {
    showGameOver(score, winner);
  };

  clientGame.start(initialState, myIndex);
}

function showGameOver(score, winner) {
  dom.resultNameP1.textContent = playerNames[0] || 'P1';
  dom.resultNameP2.textContent = playerNames[1] || 'P2';
  dom.resultScoreP1.textContent = score[0];
  dom.resultScoreP2.textContent = score[1];

  if (winner === -1) {
    dom.resultTitle.textContent = 'DRAW!';
    dom.resultWinner.textContent = '무승부';
    dom.resultWinner.style.color = '#f5af19';
  } else if (winner === myIndex) {
    dom.resultTitle.textContent = 'YOU WIN!';
    dom.resultWinner.textContent = '승리!';
    dom.resultWinner.style.color = '#4caf50';
  } else {
    dom.resultTitle.textContent = 'YOU LOSE';
    dom.resultWinner.textContent = '패배...';
    dom.resultWinner.style.color = '#f44336';
  }

  dom.rematchStatus.classList.add('hidden');
  showScreen('result');
}

async function createRoom() {
  try {
    await ensureConnected();
    myIndex = 0; // creator is always player 0
    network.send({ type: 'create_room', nickname: myNickname });
  } catch (err) {
    showError('서버에 연결할 수 없습니다.');
  }
}

async function joinRoom() {
  const roomId = dom.roomCodeInput.value.trim();
  if (!roomId || roomId.length < 4) {
    showError('방 코드를 입력해주세요.');
    return;
  }

  try {
    await ensureConnected();
    network.send({ type: 'join_room', roomId, nickname: myNickname });
  } catch (err) {
    showError('서버에 연결할 수 없습니다.');
  }
}

function leaveRoom() {
  if (clientGame) {
    clientGame.stop();
    clientGame = null;
  }
  if (network && network.connected) {
    network.send({ type: 'leave' });
  }
  currentRoomId = null;
  showScreen('lobby');
}

function requestRematch() {
  if (network && network.connected) {
    network.send({ type: 'rematch' });
    dom.rematchStatus.textContent = '상대의 응답을 기다리는 중...';
    dom.rematchStatus.classList.remove('hidden');
  }
}

// Mobile detection — add class to body for CSS
const isMobile = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

if (isMobile) {
  document.body.classList.add('is-mobile');
}

function isFullscreen() {
  return !!(document.fullscreenElement || document.webkitFullscreenElement);
}

function enterFullscreen() {
  const el = document.documentElement;
  const req = el.requestFullscreen || el.webkitRequestFullscreen;
  if (req) {
    req.call(el).then(() => {
      if (screen.orientation && screen.orientation.lock) {
        screen.orientation.lock('landscape').catch(() => {});
      }
    }).catch(() => {});
  }
}

function exitFullscreen() {
  const exit = document.exitFullscreen || document.webkitExitFullscreen;
  if (exit && isFullscreen()) exit.call(document);
}

function onFullscreenChange() {
  resizeCanvasForMobile();
}

document.addEventListener('fullscreenchange', onFullscreenChange);
document.addEventListener('webkitfullscreenchange', onFullscreenChange);

// Mobile canvas resize — fit canvas into available space keeping 800:450 ratio
function resizeCanvasForMobile() {
  if (!isMobile) return;
  const canvas = dom.canvas;
  if (!screens.game.classList.contains('active')) return;

  requestAnimationFrame(() => {
    const hud = document.querySelector('.game-hud');
    const hudH = hud ? hud.offsetHeight : 0;
    const screenW = window.innerWidth;
    const screenH = (window.visualViewport ? window.visualViewport.height : window.innerHeight) - hudH;

    if (screenW === 0 || screenH <= 0) return;

    const gameRatio = 800 / 450;
    const availRatio = screenW / screenH;

    let cssW, cssH;
    if (availRatio > gameRatio) {
      cssH = screenH;
      cssW = screenH * gameRatio;
    } else {
      cssW = screenW;
      cssH = screenW / gameRatio;
    }

    canvas.style.width = Math.floor(cssW) + 'px';
    canvas.style.height = Math.floor(cssH) + 'px';

    // Match touch controls width to canvas
    const touchControls = document.getElementById('touch-controls');
    if (touchControls) {
      touchControls.style.width = Math.floor(cssW) + 'px';
    }
  });
}

window.addEventListener('resize', resizeCanvasForMobile);
window.addEventListener('orientationchange', () => {
  setTimeout(resizeCanvasForMobile, 200);
});

// Auto-fullscreen on first tap (mobile only)
if (isMobile) {
  let autoFsTriggered = false;
  const triggerAutoFs = () => {
    if (autoFsTriggered) return;
    autoFsTriggered = true;
    if (!isFullscreen()) enterFullscreen();
    document.removeEventListener('click', triggerAutoFs);
    document.removeEventListener('touchstart', triggerAutoFs);
  };
  document.addEventListener('click', triggerAutoFs, { once: true });
  document.addEventListener('touchstart', triggerAutoFs, { once: true });
}

// Mobile gate — fullscreen for Android, PWA hint for iOS
const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
  window.navigator.standalone === true;

if (isMobile && !isStandalone) {
  const gate = document.getElementById('pwa-gate');
  const btnFullscreen = document.getElementById('btn-fullscreen-enter');
  const iosHint = document.getElementById('pwa-gate-ios');

  gate.classList.remove('hidden');

  if (isIOS) {
    // iOS: PWA 유도
    btnFullscreen.style.display = 'none';
    iosHint.classList.remove('hidden');
  } else {
    // Android: 전체화면 버튼
    btnFullscreen.addEventListener('click', () => {
      enterFullscreen();
      gate.classList.add('hidden');
    });
  }
}

// Register service worker for PWA
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}

// Start
init();
