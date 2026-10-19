'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#90caf9', // J - pale blue
  '#ffb74d', // L - orange
  '#b0bec5', // N - tuerca (steel gray)
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
  [[8,8,8],[8,0,8],[8,8,8]],                  // N - tuerca (hueco central)
];

const LINE_SCORES = [0, 100, 300, 500, 800];

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const themeToggle = document.getElementById('theme-toggle');

let gridColor;

function savedTheme() {
  try { return localStorage.getItem('theme') === 'light' ? 'light' : 'dark'; } catch (e) { return 'dark'; }
}

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem('theme', theme); } catch (e) {}
  themeToggle.setAttribute('aria-checked', String(theme === 'light'));
  gridColor = getComputedStyle(document.documentElement).getPropertyValue('--grid').trim();
  if (next) drawNext();
}

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let combo = 0, maxCombo = 0, recordPending = false;

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * (PIECES.length - 1)) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    updateHUD();
  }
  return cleared;
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  merge();
  updateCombo(clearLines());
  spawn();
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = gridColor;
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
  showGameOverRecords();
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlay.classList.remove('hidden');
  }
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
      if (gameOver) return;
    }
  }
  draw();
  animId = requestAnimationFrame(loop);
}

function init() {
  resetRecordState(); // antes de poner score a 0: guarda un récord pendiente
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (isTypingTarget(e.target) || !current) return; // escribiendo nombre o partida sin empezar
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);

themeToggle.addEventListener('click', () => {
  setTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light');
  themeToggle.blur(); // evita que Space active el switch durante la partida
});

// ---- Records locales ----
const RECORDS_KEY = 'records';
const MAX_RECORDS = 5;
const NAME_MAX = 12;

const startScreen = document.getElementById('start-screen');
const startRecordsBody = document.getElementById('start-records-body');
const bestComboEl = document.getElementById('best-combo');
const maxLinesEl = document.getElementById('max-lines');
const playBtn = document.getElementById('play-btn');
const resetRecordsBtn = document.getElementById('reset-records-btn');
const recordEntry = document.getElementById('record-entry');
const recordName = document.getElementById('record-name');
const recordSaveBtn = document.getElementById('record-save');
const gameoverRecords = document.getElementById('gameover-records');
const gameoverRecordsBody = document.getElementById('gameover-records-body');

function isTypingTarget(el) {
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
}

function toCount(v) {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0;
}

function sanitizeEntry(e) {
  if (!e || typeof e !== 'object' || typeof e.name !== 'string') return null;
  if (typeof e.score !== 'number' || !Number.isFinite(e.score) || e.score < 0) return null;
  return {
    name: e.name.trim().slice(0, NAME_MAX) || 'Anónimo',
    score: Math.floor(e.score),
    lines: toCount(e.lines),
    combo: toCount(e.combo),
  };
}

function emptyRecords() {
  return { top: [], bestCombo: 0, maxLines: 0 };
}

function loadRecords() {
  let data;
  try { data = JSON.parse(localStorage.getItem(RECORDS_KEY)); } catch (e) { return emptyRecords(); }
  if (Array.isArray(data)) data = { top: data }; // formato simple: solo la lista
  if (!data || typeof data !== 'object') return emptyRecords();
  const top = (Array.isArray(data.top) ? data.top : [])
    .map(sanitizeEntry)
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_RECORDS);
  return {
    top,
    bestCombo: Math.max(toCount(data.bestCombo), ...top.map(r => r.combo), 0),
    maxLines: Math.max(toCount(data.maxLines), ...top.map(r => r.lines), 0),
  };
}

function saveRecords(rec) {
  try { localStorage.setItem(RECORDS_KEY, JSON.stringify(rec)); } catch (e) {}
}

// Posición (0-based) que ocuparía una puntuación en el top, o -1 si no entra.
function recordRank(top, s) {
  if (s <= 0) return -1;
  const idx = top.findIndex(r => s > r.score);
  if (idx !== -1) return idx;
  return top.length < MAX_RECORDS ? top.length : -1;
}

function renderRecords(tbody, top, highlight) {
  tbody.replaceChildren();
  if (!top.length) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 5;
    td.className = 'records-empty';
    td.textContent = 'Sin récords todavía';
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }
  top.forEach((r, i) => {
    const tr = document.createElement('tr');
    if (i === highlight) tr.className = 'highlight';
    for (const v of [i + 1, r.name, r.score.toLocaleString(), r.lines, r.combo]) {
      const td = document.createElement('td');
      td.textContent = String(v);
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  });
}

function updateCombo(cleared) {
  combo = cleared > 0 ? combo + 1 : 0;
  if (combo > maxCombo) maxCombo = combo;
}

function resetRecordState() {
  if (recordPending) saveCurrentRecord(); // reiniciar sin guardar no pierde el récord
  combo = 0;
  maxCombo = 0;
  recordPending = false;
  recordEntry.classList.add('hidden');
  gameoverRecords.classList.add('hidden');
  startScreen.classList.add('hidden');
}

function showStartScreen() {
  const rec = loadRecords();
  renderRecords(startRecordsBody, rec.top, -1);
  bestComboEl.textContent = rec.bestCombo;
  maxLinesEl.textContent = rec.maxLines;
  startScreen.classList.remove('hidden');
}

function showGameOverRecords() {
  const rec = loadRecords();
  // Los mejores históricos se guardan siempre, entre o no la partida en el top
  rec.bestCombo = Math.max(rec.bestCombo, maxCombo);
  rec.maxLines = Math.max(rec.maxLines, lines);
  saveRecords(rec);

  const rank = recordRank(rec.top, score);
  recordPending = rank !== -1;
  let shown = rec.top;
  if (recordPending) {
    shown = rec.top.slice();
    shown.splice(rank, 0, { name: '???', score, lines, combo: maxCombo });
    shown = shown.slice(0, MAX_RECORDS);
    recordName.value = '';
    recordEntry.classList.remove('hidden');
  }
  renderRecords(gameoverRecordsBody, shown, rank);
  gameoverRecords.classList.remove('hidden');
  if (recordPending) recordName.focus();
}

function saveCurrentRecord() {
  if (!recordPending) return;
  recordPending = false;
  const rec = loadRecords();
  const entry = sanitizeEntry({ name: recordName.value, score, lines, combo: maxCombo });
  const rank = recordRank(rec.top, entry.score);
  if (rank !== -1) {
    rec.top.splice(rank, 0, entry);
    rec.top = rec.top.slice(0, MAX_RECORDS);
    saveRecords(rec);
  }
  recordEntry.classList.add('hidden');
  recordName.blur();
  renderRecords(gameoverRecordsBody, rec.top, rank);
}

playBtn.addEventListener('click', () => {
  playBtn.blur();
  init();
});

recordSaveBtn.addEventListener('click', () => {
  saveCurrentRecord();
  recordSaveBtn.blur();
});

recordName.maxLength = NAME_MAX;

recordName.addEventListener('keydown', e => {
  // ignora la autorrepetición de una tecla mantenida desde la partida (Space, ↓, Enter…)
  if (e.repeat) { e.preventDefault(); return; }
  if (e.key === 'Enter') {
    e.preventDefault();
    saveCurrentRecord();
  }
});

resetRecordsBtn.addEventListener('click', () => {
  resetRecordsBtn.blur();
  if (!confirm('¿Borrar todos los récords?')) return;
  try { localStorage.removeItem(RECORDS_KEY); } catch (e) {}
  showStartScreen();
});

setTheme(savedTheme());

showStartScreen();
