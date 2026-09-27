'use strict';
/* ============================================================
   Emma's Game Portal
   A safe, consolidated game hub for a 6-7 year old.
   All state lives in localStorage. No tracking, no network
   calls except Google Fonts.
   ============================================================ */

const STORE_KEY = 'emmaGracePortal.v1';

/* ---------------- utils ---------------- */
function $(sel) { return document.querySelector(sel); }
function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}
function todayKey(d = new Date()) {
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
// Simple obfuscation for the PIN. This is a soft lock for a kid,
// not real security.
function hashPin(pin) {
  let s = '';
  for (let i = 0; i < pin.length; i++) {
    s += String.fromCharCode(pin.charCodeAt(i) ^ 7);
  }
  return btoa(s);
}

/* ---------------- state ---------------- */
function defaultShelf() {
  return [
    { id: 'minecraft', name: 'Minecraft', emoji: '⛏️', url: '', hidden: false, builtin: true },
    { id: 'toca', name: 'Toca Life World', emoji: '🌍', url: '', hidden: false, builtin: true },
    { id: 'khan', name: 'Khan Academy Kids', emoji: '🎓', url: 'https://www.khanacademykids.org', hidden: false, builtin: true },
    { id: 'netflix', name: 'Netflix Playground', emoji: '🎬', url: '', hidden: false, builtin: true }
  ];
}
function defaultState() {
  return {
    v: 1,
    pin: hashPin('1234'),
    pinChanged: false,
    settings: { childName: 'Emma-Grace', birthdate: '', dailyLimitMin: 60 },
    playtime: {},        // 'YYYY-MM-DD' -> { total: sec, games: { id: sec } }
    stars: [],           // { d, reason, bonus }
    gallery: [],         // dataURLs (max 20)
    shelf: defaultShelf(),
    challenge: { date: '', done: false },
    breakActive: false,
    breakDate: '',
    overrideDate: ''
  };
}
let state;
function loadState() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const base = defaultState();
      state = Object.assign(base, parsed);
      state.settings = Object.assign(defaultState().settings, parsed.settings || {});
      if (!Array.isArray(state.shelf) || !state.shelf.length) state.shelf = defaultShelf();
      // Break Time only lasts for the day it was set.
      if (state.breakActive && state.breakDate !== todayKey()) state.breakActive = false;
      return;
    }
  } catch (e) { /* corrupted storage -> start fresh */ }
  state = defaultState();
}
function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
  } catch (e) {
    // Quota trouble: trim the gallery and retry once.
    if (state.gallery.length > 5) {
      state.gallery.length = 5;
      try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e2) { /* give up quietly */ }
    }
  }
}

/* ---------------- age / difficulty ---------------- */
function ageYears() {
  const b = state.settings.birthdate;
  if (!b) return 6;
  const bd = new Date(b + 'T12:00:00');
  if (isNaN(bd)) return 6;
  const now = new Date();
  let a = now.getFullYear() - bd.getFullYear();
  const m = now.getMonth() - bd.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < bd.getDate())) a--;
  return a;
}
// Difficulty group: 6 until her 7th birthday, 7 from then on.
function ageGroup() { return ageYears() >= 7 ? 7 : 6; }

/* ---------------- sounds (WebAudio, no assets) ---------------- */
let AC = null;
function ac() {
  if (!AC) {
    try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { /* no audio */ }
  }
  if (AC && AC.state === 'suspended') AC.resume();
  return AC;
}
window.addEventListener('pointerdown', () => ac());
function beep(freq, dur, type, vol, delay) {
  const c = ac();
  if (!c) return;
  type = type || 'sine'; vol = vol || 0.12; delay = delay || 0;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.value = freq;
  const t = c.currentTime + delay;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(c.destination);
  o.start(t); o.stop(t + dur + 0.05);
}
function sndTap() { beep(600, 0.06, 'triangle', 0.07); }
function sndGood() { beep(880, 0.12, 'triangle', 0.1); beep(1175, 0.18, 'triangle', 0.1, 0.1); }
function sndNo() { beep(220, 0.2, 'sawtooth', 0.06); }
function sndWin() { [523, 659, 784, 1047].forEach((f, i) => beep(f, 0.16, 'triangle', 0.11, i * 0.12)); }

/* ---------------- confetti ---------------- */
function confetti(n) {
  n = n || 24;
  const layer = $('#confetti-layer');
  const em = ['⭐', '🎉', '🌈', '💖', '✨', '🎈'];
  for (let i = 0; i < n; i++) {
    const s = el('span', 'confetti', em[Math.floor(Math.random() * em.length)]);
    s.style.left = Math.random() * 100 + 'vw';
    s.style.animationDuration = (1.2 + Math.random() * 1.3) + 's';
    s.style.fontSize = (18 + Math.random() * 22) + 'px';
    layer.append(s);
    setTimeout(() => s.remove(), 2700);
  }
}

/* ---------------- game registry ---------------- */
const GAMES = [
  { id: 'draw', name: 'Drawing Pad', emoji: '🎨', cat: 'Creative', desc: 'Paint a picture', bg: 'linear-gradient(160deg,#FFE3F0,#FFF6FB)' },
  { id: 'memory', name: 'Memory Match', emoji: '🧠', cat: 'Puzzle', desc: 'Find the pairs', bg: 'linear-gradient(160deg,#E3F2FF,#F5FBFF)' },
  { id: 'numbers', name: 'Number Quest', emoji: '🔢', cat: 'Educational', desc: 'Count & add', bg: 'linear-gradient(160deg,#E7F9EF,#F6FFF9)' },
  { id: 'letters', name: 'Word Wonders', emoji: '🔤', cat: 'Educational', desc: 'Letters & words', bg: 'linear-gradient(160deg,#FFF3D9,#FFFBF2)' }
];
const TITLES = { draw: 'Drawing Pad', memory: 'Memory Match', numbers: 'Number Quest', letters: 'Word Wonders', challenge: 'Daily Challenge' };
const CATS = [
  { name: 'Creative', emoji: '🎨' },
  { name: 'Puzzle', emoji: '🧩' },
  { name: 'Educational', emoji: '📚' }
];

const WORDS6 = [
  { w: 'CAT', e: '🐱' }, { w: 'DOG', e: '🐶' }, { w: 'SUN', e: '☀️' },
  { w: 'PIG', e: '🐷' }, { w: 'BUS', e: '🚌' }, { w: 'EGG', e: '🥚' },
  { w: 'BEE', e: '🐝' }, { w: 'COW', e: '🐮' }, { w: 'HEN', e: '🐔' },
  { w: 'BOX', e: '📦' }
];
const WORDS7 = [
  { w: 'FISH', e: '🐟' }, { w: 'BIRD', e: '🐦' }, { w: 'CAKE', e: '🎂' },
  { w: 'STAR', e: '⭐' }, { w: 'MOON', e: '🌙' }, { w: 'APPLE', e: '🍎' },
  { w: 'HOUSE', e: '🏠' }, { w: 'TRAIN', e: '🚂' }, { w: 'HEART', e: '❤️' },
  { w: 'SHEEP', e: '🐑' }, { w: 'BREAD', e: '🍞' }, { w: 'TIGER', e: '🐯' }
];

/* ---------------- router ---------------- */
let currentView = 'home';
let currentGameId = null;
const views = {
  home: $('#view-home'),
  game: $('#view-game'),
  stars: $('#view-stars'),
  parent: $('#view-parent')
};
function showView(name) {
  if (name !== 'game') currentGameId = null;
  currentView = name;
  for (const k in views) views[k].classList.toggle('active', k === name);
  if (name === 'home') renderHome();
  if (name === 'stars') renderStars();
  if (name === 'parent') renderParent();
  updateOverlays();
  window.scrollTo(0, 0);
}
function openGame(id) {
  currentGameId = id;
  showView('game');
  startGame(id);
}

/* ---------------- time tracking & limits ---------------- */
function todayPlay() {
  const k = todayKey();
  if (!state.playtime[k]) state.playtime[k] = { total: 0, games: {} };
  return state.playtime[k];
}
function prunePlaytime() {
  const keys = Object.keys(state.playtime).sort();
  while (keys.length > 14) delete state.playtime[keys.shift()];
}
function totalTodaySec() { return todayPlay().total; }
function isLocked() {
  const lim = state.settings.dailyLimitMin;
  if (!lim) return false;
  if (state.overrideDate === todayKey()) return false;
  return totalTodaySec() >= lim * 60;
}
// Playtime accrues in memory every 5s but is persisted about every 30s,
// so the gallery dataURLs are not serialized on every tick. The
// visibilitychange handler below saves when the app goes to background.
let tickCount = 0;
setInterval(() => {
  if (document.hidden) return;
  if (!state.breakActive && currentView !== 'parent') {
    const t = todayPlay();
    t.total += 5;
    if (currentView === 'game' && currentGameId) {
      t.games[currentGameId] = (t.games[currentGameId] || 0) + 5;
    }
    if (++tickCount % 6 === 0) save();
  }
  updateOverlays();
}, 5000);
document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });

function updateOverlays() {
  const inParent = currentView === 'parent';
  $('#overlay-lock').classList.toggle('show', !inParent && !state.breakActive && isLocked());
  $('#overlay-break').classList.toggle('show', !inParent && state.breakActive);
}

/* ---------------- PIN modal ---------------- */
let pinVal = '';
let pinCb = null;
function buildPinPad() {
  const pad = $('#pin-pad');
  pad.innerHTML = '';
  ['1','2','3','4','5','6','7','8','9','','0','⌫'].forEach(k => {
    if (k === '') { pad.append(el('span')); return; }
    const b = el('button', 'pin-key', k);
    b.type = 'button';
    b.onclick = () => pinInput(k);
    pad.append(b);
  });
}
function renderPinDots() {
  const dots = $('#pin-dots').children;
  for (let i = 0; i < 4; i++) dots[i].classList.toggle('on', i < pinVal.length);
}
// onOk(pin) -> return true to close (unless it opened a follow-up prompt),
// false to shake and retry
function openPin(title, onOk) {
  pinVal = '';
  pinCb = onOk;
  $('#pin-title').textContent = title;
  renderPinDots();
  $('#overlay-pin').classList.add('show');
}
function closePin() {
  $('#overlay-pin').classList.remove('show');
  pinCb = null;
}
function pinInput(k) {
  if (k === '⌫') { pinVal = pinVal.slice(0, -1); renderPinDots(); return; }
  if (pinVal.length >= 4) return;
  pinVal += k;
  renderPinDots();
  if (pinVal.length === 4 && pinCb) {
    const cb = pinCb;
    const ok = cb(pinVal);
    // The callback may chain into a new PIN prompt (e.g. PIN change
    // confirmation); only close when it did not.
    if (ok) { if (pinCb === cb) closePin(); }
    else {
      pinVal = '';
      const sheet = $('#pin-sheet');
      sheet.classList.remove('shake');
      void sheet.offsetWidth;
      sheet.classList.add('shake');
      sndNo();
      setTimeout(renderPinDots, 60);
    }
  }
}
function checkPin(p) { return hashPin(p) === state.pin; }
function gate(title, onSuccess) {
  openPin(title, p => {
    if (checkPin(p)) { onSuccess(); return true; }
    return false;
  });
}

/* ---------------- stars ---------------- */
function awardStar(reason, bonus) {
  state.stars.push({ d: todayKey(), reason: reason, bonus: !!bonus });
  save();
  updateStarCount();
}
function updateStarCount() {
  $('#star-count').textContent = state.stars.length;
}

/* ---------------- home ---------------- */
function renderHome() {
  const v = views.home;
  v.innerHTML = '';

  // Daily challenge card
  const chTitle = el('h2', 'cat-title', '🌟 Today');
  v.append(chTitle);
  const chGrid = el('div', 'grid');
  const done = state.challenge.date === todayKey() && state.challenge.done;
  const dc = el('button', 'card card-challenge');
  dc.type = 'button';
  dc.innerHTML = done
    ? '<span class="card-emoji">✅</span><span class="card-name">Daily Challenge</span><span class="card-desc">Done! Great job!</span>'
    : '<span class="card-emoji">🌟</span><span class="card-name">Daily Challenge</span><span class="card-desc">Win a bonus star!</span>';
  dc.onclick = () => { sndTap(); openGame('challenge'); };
  chGrid.append(dc);
  v.append(chGrid);

  // Game categories
  CATS.forEach(cat => {
    const games = GAMES.filter(g => g.cat === cat.name);
    if (!games.length) return;
    v.append(el('h2', 'cat-title', cat.emoji + ' ' + cat.name));
    const grid = el('div', 'grid');
    games.forEach(g => {
      const c = el('button', 'card');
      c.type = 'button';
      c.style.background = g.bg;
      c.innerHTML = '<span class="card-emoji">' + g.emoji + '</span>' +
        '<span class="card-name">' + g.name + '</span>' +
        '<span class="card-desc">' + g.desc + '</span>';
      c.onclick = () => { sndTap(); openGame(g.id); };
      grid.append(c);
    });
    v.append(grid);
  });

  // Game shelf (external apps)
  const shelfItems = state.shelf.filter(s => !s.hidden);
  if (shelfItems.length) {
    v.append(el('h2', 'cat-title', '🎮 Game Shelf'));
    const grid = el('div', 'grid');
    shelfItems.forEach(s => {
      const c = el('button', 'card card-shelf');
      c.type = 'button';
      c.innerHTML = '<span class="card-emoji">' + escapeHtml(s.emoji) + '</span>' +
        '<span class="card-name">' + escapeHtml(s.name) + '</span>' +
        '<span class="card-desc">Lives outside the portal</span>';
      c.onclick = () => { sndTap(); openShelfCard(s); };
      grid.append(c);
    });
    v.append(grid);
  }

  v.append(el('p', 'home-footer', 'Made with 💜 for ' + escapeHtml(state.settings.childName)));
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
function openShelfCard(s) {
  const sheet = $('#shelf-sheet');
  sheet.innerHTML = '';
  sheet.append(el('div', 'sheet-emoji', escapeHtml(s.emoji)));
  sheet.append(el('h2', null, escapeHtml(s.name)));
  sheet.append(el('p', null, 'Ask a grown-up to open <b>' + escapeHtml(s.name) + '</b> for you!'));
  const row = el('div', 'shelf-link-row');
  if (s.url && /^https?:\/\//i.test(s.url)) {
    const link = el('button', 'btn btn-green btn-sm', '🌐 Open website');
    link.type = 'button';
    link.onclick = () => { window.open(s.url, '_blank'); };
    row.append(link);
  }
  const close = el('button', 'btn btn-ghost btn-sm', 'Close');
  close.type = 'button';
  close.onclick = () => { sndTap(); $('#overlay-shelf').classList.remove('show'); };
  row.append(close);
  sheet.append(row);
  $('#overlay-shelf').classList.add('show');
}

/* ---------------- game host ---------------- */
function startGame(id) {
  const v = views.game;
  v.innerHTML = '';
  const bar = el('div', 'game-bar');
  const home = el('button', 'btn-home', '🏠');
  home.type = 'button';
  home.setAttribute('aria-label', 'Home');
  home.onclick = () => { sndTap(); showView('home'); };
  bar.append(home);
  const gameDef = GAMES.find(g => g.id === id);
  const emoji = gameDef ? gameDef.emoji : '🌟';
  bar.append(el('h2', 'game-title', emoji + ' ' + (TITLES[id] || 'Game')));
  v.append(bar);
  const stage = el('div', 'stage');
  v.append(stage);
  if (id === 'draw') initDraw(stage);
  else if (id === 'memory') initMemory(stage);
  else if (id === 'numbers') initNumbers(stage);
  else if (id === 'letters') initLetters(stage);
  else if (id === 'challenge') initChallenge(stage);
}

/* ============================================================
   GAME 1: Drawing Pad
   ============================================================ */
function initDraw(stage) {
  const COLORS = ['#FF6B9D', '#FF9F43', '#FFD93D', '#6BCB77', '#4D96FF', '#B983FF', '#8D6E63', '#222222'];
  const SIZES = [6, 14, 28];
  let color = COLORS[0];
  let size = SIZES[1];
  let erasing = false;

  const toolbar = el('div', 'draw-toolbar');
  COLORS.forEach(c => {
    const b = el('button', 'swatch');
    b.type = 'button';
    b.style.background = c;
    b.setAttribute('aria-label', 'Color ' + c);
    if (c === color) b.classList.add('sel');
    b.onclick = () => {
      color = c; erasing = false; sndTap();
      toolbar.querySelectorAll('.swatch,.brush-btn').forEach(x => x.classList.remove('sel'));
      b.classList.add('sel');
    };
    toolbar.append(b);
  });
  const er = el('button', 'swatch eraser', '🧽');
  er.type = 'button';
  er.setAttribute('aria-label', 'Eraser');
  er.onclick = () => {
    erasing = true; sndTap();
    toolbar.querySelectorAll('.swatch,.brush-btn').forEach(x => x.classList.remove('sel'));
    er.classList.add('sel');
  };
  toolbar.append(er);
  SIZES.forEach((s, i) => {
    const b = el('button', 'brush-btn');
    b.type = 'button';
    b.setAttribute('aria-label', 'Brush size ' + s);
    const dot = el('span', 'brush-dot');
    dot.style.width = (4 + i * 5) + 'px';
    dot.style.height = (4 + i * 5) + 'px';
    b.append(dot);
    if (s === size) b.classList.add('sel');
    b.onclick = () => {
      size = s; sndTap();
      toolbar.querySelectorAll('.swatch,.brush-btn').forEach(x => x.classList.remove('sel'));
      b.classList.add('sel');
    };
    toolbar.append(b);
  });
  const clearBtn = el('button', 'btn btn-ghost btn-sm', '🗑️ Clear');
  clearBtn.type = 'button';
  const saveBtn = el('button', 'btn btn-pink btn-sm', '💾 Save');
  saveBtn.type = 'button';
  toolbar.append(clearBtn, saveBtn);
  stage.append(toolbar);

  const canvas = el('canvas');
  canvas.id = 'draw-canvas';
  canvas.width = 900;
  canvas.height = 620;
  stage.append(canvas);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  let drawing = false;
  let last = null;
  function pos(e) {
    const r = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) * (canvas.width / r.width),
      y: (e.clientY - r.top) * (canvas.height / r.height)
    };
  }
  function start(e) {
    drawing = true;
    last = pos(e);
    dot(last);
    e.preventDefault();
  }
  function move(e) {
    if (!drawing) return;
    const p = pos(e);
    ctx.strokeStyle = erasing ? '#FFFFFF' : color;
    ctx.lineWidth = erasing ? size * 2 : size;
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last = p;
    e.preventDefault();
  }
  function dot(p) {
    ctx.fillStyle = erasing ? '#FFFFFF' : color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, (erasing ? size * 2 : size) / 2, 0, Math.PI * 2);
    ctx.fill();
  }
  function end() { drawing = false; }
  canvas.addEventListener('pointerdown', start);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('pointerleave', end);

  clearBtn.onclick = () => {
    sndTap();
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  };

  const galTitle = el('h3', null, '🖼️ My Gallery');
  galTitle.style.textAlign = 'left';
  galTitle.style.marginTop = '18px';
  const strip = el('div', 'gallery-strip');

  function renderGallery() {
    strip.innerHTML = '';
    if (!state.gallery.length) {
      strip.append(el('span', 'hint', 'No saved drawings yet. Tap 💾 Save to keep one!'));
      return;
    }
    state.gallery.forEach((url, i) => {
      const item = el('div', 'gallery-item');
      const img = el('img');
      img.src = url;
      img.alt = 'Saved drawing ' + (i + 1);
      const del = el('button', 'gallery-del', '✕');
      del.type = 'button';
      del.onclick = () => {
        sndTap();
        state.gallery.splice(i, 1);
        save();
        renderGallery();
      };
      item.append(img, del);
      strip.append(item);
    });
  }
  stage.append(galTitle, strip);
  renderGallery();

  saveBtn.onclick = () => {
    const small = document.createElement('canvas');
    small.width = 360;
    small.height = 248;
    const sctx = small.getContext('2d');
    sctx.fillStyle = '#FFFFFF';
    sctx.fillRect(0, 0, small.width, small.height);
    sctx.drawImage(canvas, 0, 0, small.width, small.height);
    try {
      const url = small.toDataURL('image/jpeg', 0.8);
      state.gallery.unshift(url);
      if (state.gallery.length > 20) state.gallery.length = 20;
      save();
      renderGallery();
      sndGood();
    } catch (e) { /* storage full, ignore */ }
  };
}

/* ============================================================
   GAME 2: Memory Match
   ============================================================ */
function initMemory(stage) {
  const g = ageGroup();
  const pairs = g >= 7 ? 8 : 6; // 4x4 for age 7, 4x3 for age 6
  const POOL = ['🐶', '🐱', '🦊', '🐸', '🐵', '🦁', '🐷', '🐰', '🦄', '🐢', '🦋', '🐠'];
  const chosen = shuffle(POOL.slice()).slice(0, pairs);
  const deck = shuffle(chosen.concat(chosen));

  let first = null;
  let lock = false;
  let matched = 0;
  let moves = 0;

  const status = el('div', 'mem-status', 'Moves: 0');
  const grid = el('div', 'mem-grid');
  stage.append(status, grid);

  deck.forEach(emoji => {
    const c = el('button', 'mcard');
    c.type = 'button';
    c.dataset.emoji = emoji;
    c.append(el('span', null, emoji));
    c.onclick = () => {
      if (lock || c.classList.contains('flipped') || c.classList.contains('matched')) return;
      sndTap();
      c.classList.add('flipped');
      if (!first) { first = c; return; }
      moves++;
      status.textContent = 'Moves: ' + moves;
      if (first.dataset.emoji === c.dataset.emoji) {
        first.classList.add('matched');
        c.classList.add('matched');
        sndGood();
        first = null;
        matched++;
        if (matched === pairs) {
          setTimeout(() => {
            sndWin();
            confetti();
            stage.innerHTML = '';
            stage.append(
              el('div', 'center big-emoji', '🎉'),
              el('p', 'result-msg center', 'You found all the pairs!'),
              el('p', 'center', 'Moves: ' + moves)
            );
            const again = el('button', 'btn', '🔁 Play again');
            again.type = 'button';
            again.onclick = () => { sndTap(); startGame('memory'); };
            const wrap = el('div', 'center');
            wrap.append(again);
            stage.append(wrap);
          }, 450);
        }
      } else {
        lock = true;
        const a = first;
        first = null;
        setTimeout(() => {
          a.classList.remove('flipped');
          c.classList.remove('flipped');
          lock = false;
        }, 750);
      }
    };
    grid.append(c);
  });
}

/* ============================================================
   GAME 3: Number Quest
   ============================================================ */
function initNumbers(stage) {
  const g = ageGroup();
  const TOTAL = 5;
  const COUNT_EMOJI = ['🍎', '🎈', '🐤', '🌸', '🍓', '🦋'];
  let round = 0;
  let score = 0;

  function dots() {
    let s = '';
    for (let i = 0; i < TOTAL; i++) s += i < round ? '●' : '○';
    return s;
  }
  function uniqueOptions(answer, candidates) {
    const set = new Set([answer]);
    shuffle(candidates);
    for (const c of candidates) {
      if (set.size >= 4) break;
      if (c > 0 && !set.has(c)) set.add(c);
    }
    while (set.size < 4) set.add(answer + set.size + 1);
    return shuffle(Array.from(set));
  }
  function next() {
    if (round >= TOTAL) return done();
    round++;
    stage.innerHTML = '';
    stage.append(el('div', 'progress-dots', dots()));
    let qText, emojiRow, answer, options;

    if (g === 6) {
      if (Math.random() < 0.5) {
        // Counting 1-10
        const n = 1 + Math.floor(Math.random() * 10);
        const e = COUNT_EMOJI[Math.floor(Math.random() * COUNT_EMOJI.length)];
        qText = 'How many do you see?';
        emojiRow = e.repeat(n);
        answer = n;
        options = uniqueOptions(n, [n - 1, n + 1, n + 2, n - 2, n + 3]);
      } else {
        // Number recognition 1-10
        const n = 1 + Math.floor(Math.random() * 10);
        qText = 'Tap the number ' + n + '!';
        emojiRow = '👆';
        answer = n;
        options = uniqueOptions(n, [n - 1, n + 1, n + 2, n - 2, n + 3]);
      }
    } else {
      // Addition with sums up to 20
      const a = 1 + Math.floor(Math.random() * 10);
      const b = 1 + Math.floor(Math.random() * 10);
      qText = a + ' + ' + b + ' = ?';
      emojiRow = '🤔';
      answer = a + b;
      options = uniqueOptions(answer, [answer - 1, answer + 1, answer + 2, answer - 2, answer + 10, answer - 10]);
    }

    stage.append(el('div', 'q-emoji-row', emojiRow));
    stage.append(el('div', 'q-text', qText));
    const grid = el('div', 'options');
    options.forEach(o => {
      const b = el('button', 'opt', String(o));
      b.type = 'button';
      b.onclick = () => {
        grid.querySelectorAll('.opt').forEach(x => x.disabled = true);
        if (o === answer) {
          b.classList.add('right');
          score++;
          sndGood();
        } else {
          b.classList.add('wrong');
          grid.querySelectorAll('.opt').forEach(x => {
            if (Number(x.textContent) === answer) x.classList.add('right');
          });
          sndNo();
        }
        setTimeout(next, 950);
      };
      grid.append(b);
    });
    stage.append(grid);
  }
  function done() {
    stage.innerHTML = '';
    const praise = score === TOTAL ? 'AMAZING! 🏆' : score >= 4 ? 'Great job! 🎉' : score >= 3 ? 'Good try! 💪' : 'Keep practicing! 🌈';
    stage.append(
      el('div', 'center big-emoji', '🏁'),
      el('p', 'result-msg center', praise),
      el('p', 'center', 'You got ' + score + ' out of ' + TOTAL + '!')
    );
    if (score >= 4) { sndWin(); confetti(); } else { sndGood(); }
    const again = el('button', 'btn', '🔁 Play again');
    again.type = 'button';
    again.onclick = () => { sndTap(); startGame('numbers'); };
    const wrap = el('div', 'center');
    wrap.append(again);
    stage.append(wrap);
  }
  next();
}

/* ============================================================
   GAME 4: Word Wonders (letters)
   ============================================================ */
function initLetters(stage) {
  const g = ageGroup();
  const TOTAL = 5;
  const list = g === 6 ? WORDS6 : WORDS7;
  const words = shuffle(list.slice()).slice(0, TOTAL);
  let round = 0;
  let score = 0;

  function dots() {
    let s = '';
    for (let i = 0; i < TOTAL; i++) s += i < round ? '●' : '○';
    return s;
  }
  function letterOptions(correct) {
    const set = new Set([correct]);
    while (set.size < 4) {
      set.add(String.fromCharCode(65 + Math.floor(Math.random() * 26)));
    }
    return shuffle(Array.from(set));
  }
  function next() {
    if (round >= TOTAL) return done();
    const item = words[round];
    round++;
    const idx = Math.floor(Math.random() * item.w.length);
    const correct = item.w[idx];

    stage.innerHTML = '';
    stage.append(el('div', 'progress-dots', dots()));
    stage.append(el('div', 'q-emoji-row', item.e));
    stage.append(el('div', 'q-text', 'Which letter is missing?'));
    const slots = el('div', 'slots');
    for (let i = 0; i < item.w.length; i++) {
      slots.append(el('span', i === idx ? 'blank' : null, i === idx ? '?' : item.w[i]));
    }
    stage.append(slots);
    const grid = el('div', 'options');
    letterOptions(correct).forEach(L => {
      const b = el('button', 'opt', L);
      b.type = 'button';
      b.onclick = () => {
        grid.querySelectorAll('.opt').forEach(x => x.disabled = true);
        if (L === correct) {
          b.classList.add('right');
          score++;
          sndGood();
        } else {
          b.classList.add('wrong');
          grid.querySelectorAll('.opt').forEach(x => {
            if (x.textContent === correct) x.classList.add('right');
          });
          sndNo();
        }
        slots.children[idx].textContent = correct;
        slots.children[idx].classList.remove('blank');
        setTimeout(next, 1000);
      };
      grid.append(b);
    });
    stage.append(grid);
  }
  function done() {
    stage.innerHTML = '';
    const praise = score === TOTAL ? 'WORD WIZARD! 🏆' : score >= 4 ? 'Great job! 🎉' : score >= 3 ? 'Good try! 💪' : 'Keep practicing! 🌈';
    stage.append(
      el('div', 'center big-emoji', '🏁'),
      el('p', 'result-msg center', praise),
      el('p', 'center', 'You got ' + score + ' out of ' + TOTAL + '!')
    );
    if (score >= 4) { sndWin(); confetti(); } else { sndGood(); }
    const again = el('button', 'btn', '🔁 Play again');
    again.type = 'button';
    again.onclick = () => { sndTap(); startGame('letters'); };
    const wrap = el('div', 'center');
    wrap.append(again);
    stage.append(wrap);
  }
  next();
}

/* ============================================================
   Daily Challenge (seeded by date + age group)
   ============================================================ */
function todaysChallenge() {
  const dk = todayKey();
  const g = ageGroup();
  const rng = mulberry32(hashStr(dk + '|' + g + '|challenge'));
  if (rng() < 0.5) {
    let a, b;
    if (g === 6) {
      a = 1 + Math.floor(rng() * 6);
      b = 1 + Math.floor(rng() * Math.max(1, 10 - a));
    } else {
      a = 2 + Math.floor(rng() * 9);
      b = 2 + Math.floor(rng() * 9);
    }
    const answer = a + b;
    const set = new Set([answer]);
    const cands = [answer + 1, answer - 1, answer + 2, answer - 2, answer + 3];
    for (const c of cands) { if (set.size < 4 && c > 0) set.add(c); }
    while (set.size < 4) set.add(answer + set.size + 2);
    return { type: 'math', q: a + ' + ' + b + ' = ?', emoji: '🧮', options: shuffle(Array.from(set)), answer: answer };
  }
  const list = g === 6 ? WORDS6 : WORDS7;
  const item = list[Math.floor(rng() * list.length)];
  const idx = Math.floor(rng() * item.w.length);
  const correct = item.w[idx];
  const set = new Set([correct]);
  while (set.size < 4) set.add(String.fromCharCode(65 + Math.floor(rng() * 26)));
  return { type: 'word', word: item.w, idx: idx, emoji: item.e, options: shuffle(Array.from(set)), answer: correct };
}
function initChallenge(stage) {
  const dk = todayKey();
  if (state.challenge.date === dk && state.challenge.done) {
    stage.append(
      el('div', 'center big-emoji', '🌈'),
      el('p', 'result-msg center', 'You already did today\'s challenge!'),
      el('p', 'center', 'Come back tomorrow for a new one.')
    );
    return;
  }
  const c = todaysChallenge();
  stage.append(el('div', 'q-emoji-row', c.emoji));
  if (c.type === 'math') {
    stage.append(el('div', 'q-text', c.q));
  } else {
    stage.append(el('div', 'q-text', 'Which letter is missing?'));
    const slots = el('div', 'slots');
    for (let i = 0; i < c.word.length; i++) {
      slots.append(el('span', i === c.idx ? 'blank' : null, i === c.idx ? '?' : c.word[i]));
    }
    stage.append(slots);
  }
  const grid = el('div', 'options');
  c.options.forEach(o => {
    const b = el('button', 'opt', String(o));
    b.type = 'button';
    b.onclick = () => {
      grid.querySelectorAll('.opt').forEach(x => x.disabled = true);
      state.challenge = { date: dk, done: true };
      if (o === c.answer) {
        b.classList.add('right');
        awardStar('Daily Challenge', true);
        sndWin();
        confetti();
        setTimeout(() => {
          stage.innerHTML = '';
          stage.append(
            el('div', 'center big-emoji', '⭐'),
            el('p', 'result-msg center', 'Correct! You earned a star!'),
            el('p', 'center', 'Come back tomorrow for a new challenge.')
          );
        }, 800);
      } else {
        b.classList.add('wrong');
        grid.querySelectorAll('.opt').forEach(x => {
          if (String(x.textContent) === String(c.answer)) x.classList.add('right');
        });
        sndNo();
        setTimeout(() => {
          stage.innerHTML = '';
          stage.append(
            el('div', 'center big-emoji', '💜'),
            el('p', 'result-msg center', 'Good try!'),
            el('p', 'center', 'A new challenge waits for you tomorrow.')
          );
        }, 1200);
      }
      save();
    };
    grid.append(b);
  });
  stage.append(grid);
}

/* ============================================================
   Stars view
   ============================================================ */
function renderStars() {
  const v = views.stars;
  v.innerHTML = '';
  const bar = el('div', 'game-bar');
  const home = el('button', 'btn-home', '🏠');
  home.type = 'button';
  home.onclick = () => { sndTap(); showView('home'); };
  bar.append(home, el('h2', 'game-title', '⭐ My Stars'));
  v.append(bar);

  const stage = el('div', 'stage');
  stage.append(el('p', 'stars-big-count', state.stars.length + ' ⭐ earned!'));
  if (state.stars.length) {
    const grid = el('div', 'stars-grid');
    state.stars.forEach(() => grid.append(el('span', null, '⭐')));
    stage.append(grid);
    const log = el('div', 'star-log');
    state.stars.slice(-8).reverse().forEach(s => {
      const row = el('div', 'row');
      row.append(el('span', null, '⭐ ' + escapeHtml(s.reason)));
      row.append(el('span', 'date', s.d));
      log.append(row);
    });
    stage.append(log);
  } else {
    stage.append(el('p', 'stars-empty', 'No stars yet. Grown-ups can award stars for being awesome! 💜'));
  }
  v.append(stage);
}

/* ============================================================
   Parent panel
   ============================================================ */
const STAR_REASONS = ['Kindness 💜', 'Helping 🧹', 'Being Brave 🦁', 'Great Listening 👂', 'Trying Hard 💪', 'Other ✨'];
let pickedReason = STAR_REASONS[0];

function renderParent() {
  const v = views.parent;
  v.innerHTML = '';

  const head = el('div', 'panel-head');
  head.append(el('h2', null, '🔒 Grown-Ups Panel'));
  const doneBtn = el('button', 'btn btn-ghost btn-sm', 'Done ✓');
  doneBtn.type = 'button';
  doneBtn.onclick = () => { sndTap(); showView('home'); };
  head.append(doneBtn);
  v.append(head);

  if (!state.pinChanged) {
    v.append(el('div', 'banner', '⚠️ Your PIN is still the default (1234). Change it below in "Security".'));
  }

  // --- Profile ---
  const profile = el('div', 'panel-card');
  profile.append(el('h3', null, '👧 Profile'));
  profile.append(el('label', null, 'Name'));
  const nameIn = el('input');
  nameIn.type = 'text';
  nameIn.value = state.settings.childName;
  nameIn.maxLength = 20;
  nameIn.onchange = () => {
    state.settings.childName = nameIn.value.trim() || 'Emma-Grace';
    save();
    renderGreeting();
    renderParent();
  };
  profile.append(nameIn);
  profile.append(el('label', null, 'Birthdate (sets game difficulty)'));
  const bdIn = el('input');
  bdIn.type = 'date';
  bdIn.value = state.settings.birthdate;
  bdIn.onchange = () => { state.settings.birthdate = bdIn.value; save(); renderParent(); };
  profile.append(bdIn);
  profile.append(el('p', 'hint',
    'Current age: ' + ageYears() + ' → difficulty level "' + ageGroup() + '". ' +
    'Level 6: numbers to 10, 3-letter words, 12 memory cards. ' +
    'Level 7: addition to 20, 4-5 letter words, 16 memory cards. ' +
    'It upgrades automatically on her 7th birthday.'));
  v.append(profile);

  // --- Time ---
  const time = el('div', 'panel-card');
  time.append(el('h3', null, '⏰ Time'));
  time.append(el('label', null, 'Daily portal time limit'));
  const sel = el('select');
  [[15, '15 minutes'], [30, '30 minutes'], [45, '45 minutes'], [60, '1 hour'], [90, '1.5 hours'], [0, 'No limit']].forEach(([val, label]) => {
    const o = el('option', null, label);
    o.value = val;
    if (state.settings.dailyLimitMin === val) o.selected = true;
    sel.append(o);
  });
  sel.onchange = () => { state.settings.dailyLimitMin = Number(sel.value); save(); renderParent(); };
  time.append(sel);
  const usedMin = Math.floor(totalTodaySec() / 60);
  time.append(el('p', 'hint',
    'Used today: ' + usedMin + ' min' +
    (state.settings.dailyLimitMin ? ' of ' + state.settings.dailyLimitMin + ' min' : '') +
    (state.overrideDate === todayKey() ? ' (overridden for today)' : '') + '.'));
  const brk = el('button', state.breakActive ? 'btn btn-green' : 'btn btn-pink',
    state.breakActive ? '▶️ Resume play' : '⏸️ Break Time');
  brk.type = 'button';
  brk.onclick = () => {
    sndTap();
    state.breakActive = !state.breakActive;
    state.breakDate = state.breakActive ? todayKey() : '';
    save();
    updateOverlays();
    renderParent();
  };
  time.append(el('p', 'hint', 'Break Time instantly pauses the whole portal until you resume it.'));
  time.append(brk);
  v.append(time);

  // --- Stars ---
  const starsCard = el('div', 'panel-card');
  starsCard.append(el('h3', null, '⭐ Award a Star (' + state.stars.length + ' total)'));
  const chips = el('div', 'chip-row');
  STAR_REASONS.forEach(r => {
    const c = el('button', 'chip' + (r === pickedReason ? ' sel' : ''), r);
    c.type = 'button';
    c.onclick = () => { pickedReason = r; sndTap(); renderParent(); };
    chips.append(c);
  });
  starsCard.append(chips);
  const give = el('button', 'btn', '⭐ Give star');
  give.type = 'button';
  give.onclick = () => {
    awardStar(pickedReason, false);
    sndGood();
    confetti(14);
    renderParent();
  };
  starsCard.append(give);
  v.append(starsCard);

  // --- Playtime report ---
  const report = el('div', 'panel-card');
  report.append(el('h3', null, '📊 Playtime (last 7 days)'));
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(d);
  }
  const dayTotals = days.map(d => {
    const p = state.playtime[todayKey(d)];
    return p ? p.total : 0;
  });
  const maxSec = Math.max(300, ...dayTotals);
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  days.forEach((d, i) => {
    const row = el('div', 'bar-row');
    row.append(el('span', 'bar-day', dayNames[d.getDay()]));
    const track = el('div', 'bar-track');
    const fill = el('div', 'bar-fill');
    fill.style.width = Math.round(dayTotals[i] / maxSec * 100) + '%';
    track.append(fill);
    row.append(track);
    row.append(el('span', 'bar-val', Math.round(dayTotals[i] / 60) + 'm'));
    report.append(row);
  });
  const todayGames = todayPlay().games;
  const gameIds = Object.keys(todayGames);
  if (gameIds.length) {
    report.append(el('label', null, 'Today by activity'));
    gameIds.sort((a, b) => todayGames[b] - todayGames[a]).forEach(id => {
      const row = el('div', 'bar-row');
      row.append(el('span', 'bar-day', ''));
      const track = el('div', 'bar-track');
      const fill = el('div', 'bar-fill');
      fill.style.width = Math.round(todayGames[id] / Math.max(60, totalTodaySec()) * 100) + '%';
      track.append(fill);
      row.append(track);
      row.append(el('span', 'bar-val', (TITLES[id] || id) + ' ' + Math.round(todayGames[id] / 60) + 'm'));
      report.append(row);
    });
  }
  v.append(report);

  // --- Game shelf manager ---
  const shelfCard = el('div', 'panel-card');
  shelfCard.append(el('h3', null, '🎮 Game Shelf'));
  state.shelf.forEach(s => {
    const row = el('div', 'shelf-row');
    row.append(el('span', 's-emoji', escapeHtml(s.emoji)));
    row.append(el('span', 's-name', escapeHtml(s.name)));
    const hide = el('button', 'btn btn-ghost btn-sm', s.hidden ? 'Show' : 'Hide');
    hide.type = 'button';
    hide.onclick = () => { s.hidden = !s.hidden; save(); renderParent(); };
    row.append(hide);
    if (!s.builtin) {
      const del = el('button', 'btn btn-ghost btn-sm', '🗑️');
      del.type = 'button';
      del.onclick = () => {
        state.shelf = state.shelf.filter(x => x.id !== s.id);
        save();
        renderParent();
      };
      row.append(del);
    }
    shelfCard.append(row);
  });
  const add = el('div', 'shelf-add');
  const emojiIn = el('input');
  emojiIn.type = 'text';
  emojiIn.placeholder = '🧩';
  emojiIn.maxLength = 4;
  const nameAddIn = el('input');
  nameAddIn.type = 'text';
  nameAddIn.placeholder = 'App or game name';
  nameAddIn.maxLength = 30;
  const urlIn = el('input');
  urlIn.type = 'url';
  urlIn.className = 'full';
  urlIn.placeholder = 'Optional website (https://...)';
  const addBtn = el('button', 'btn btn-sm full', '➕ Add to shelf');
  addBtn.type = 'button';
  addBtn.onclick = () => {
    const nm = nameAddIn.value.trim();
    if (!nm) return;
    state.shelf.push({
      id: 'c' + Date.now(),
      name: nm,
      emoji: emojiIn.value.trim() || '🎮',
      url: urlIn.value.trim(),
      hidden: false,
      builtin: false
    });
    save();
    renderParent();
  };
  add.append(emojiIn, nameAddIn, urlIn, addBtn);
  shelfCard.append(add);
  shelfCard.append(el('p', 'hint',
    'Shelf cards remind her which apps live outside the portal. ' +
    'Use iOS Screen Time to set hard limits on those apps - the portal cannot control them.'));
  v.append(shelfCard);

  // --- Security ---
  const sec = el('div', 'panel-card');
  sec.append(el('h3', null, '🔑 Security'));
  const chPin = el('button', 'btn btn-ghost', 'Change PIN');
  chPin.type = 'button';
  chPin.onclick = () => {
    openPin('Enter a new PIN', p1 => {
      openPin('Enter it again', p2 => {
        if (p1 === p2) {
          state.pin = hashPin(p1);
          state.pinChanged = true;
          save();
          renderParent();
          return true;
        }
        return false;
      });
      return true;
    });
  };
  sec.append(chPin);
  sec.append(el('p', 'hint',
    'The PIN is a soft lock to keep little fingers out of settings. ' +
    'It is not real security - clearing Safari website data resets the whole app, including stars.'));
  v.append(sec);

  // --- Danger zone ---
  const danger = el('div', 'panel-card danger-zone');
  danger.append(el('h3', null, '⚠️ Reset'));
  const reset = el('button', 'btn', 'Reset all data');
  let armed = false;
  reset.type = 'button';
  reset.onclick = () => {
    if (!armed) {
      armed = true;
      reset.textContent = 'Tap again to erase EVERYTHING';
      setTimeout(() => { armed = false; reset.textContent = 'Reset all data'; }, 3000);
      return;
    }
    localStorage.removeItem(STORE_KEY);
    location.reload();
  };
  danger.append(reset);
  v.append(danger);
}

/* ---------------- greeting & sky ---------------- */
function renderGreeting() {
  const h = new Date().getHours();
  const tod = h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'evening';
  $('#greeting').textContent = 'Good ' + tod + ', ' + state.settings.childName + '!';
  const subs = ['Mini says hi! 🦄', 'Ready to play? 🌈', 'What shall we do today? ✨', 'Let\'s have fun! 🎈', 'You\'re a star! ⭐'];
  $('#greeting-sub').textContent = subs[Math.floor(Math.random() * subs.length)];
}
function buildSky() {
  const sky = $('#sky');
  const clouds = [
    { top: 6, w: 110, h: 34, dur: 90 }, { top: 18, w: 80, h: 26, dur: 120 },
    { top: 32, w: 140, h: 40, dur: 105 }, { top: 55, w: 90, h: 28, dur: 135 },
    { top: 72, w: 120, h: 34, dur: 115 }
  ];
  clouds.forEach(c => {
    const d = el('div', 'cloud');
    d.style.top = c.top + '%';
    d.style.width = c.w + 'px';
    d.style.height = c.h + 'px';
    d.style.animationDuration = c.dur + 's';
    d.style.animationDelay = (-Math.random() * c.dur) + 's';
    sky.append(d);
  });
  for (let i = 0; i < 14; i++) {
    const s = el('span', 'tw', '✦');
    s.style.left = Math.random() * 100 + '%';
    s.style.top = Math.random() * 100 + '%';
    s.style.fontSize = (8 + Math.random() * 10) + 'px';
    s.style.animationDelay = (Math.random() * 2.6) + 's';
    sky.append(s);
  }
  // A couple of Minis drifting by
  [{ top: 12, dur: 150 }, { top: 48, dur: 190 }].forEach(u => {
    const s = el('span', 'uni', '🦄');
    s.style.top = u.top + '%';
    s.style.animationDuration = u.dur + 's';
    s.style.animationDelay = (-Math.random() * u.dur) + 's';
    sky.append(s);
  });
}

/* ---------------- wiring ---------------- */
function init() {
  loadState();
  prunePlaytime();
  buildSky();
  buildPinPad();
  renderGreeting();
  updateStarCount();
  showView('home');

  $('#nav-home').onclick = () => { sndTap(); showView('home'); };
  $('#nav-parent').onclick = () => { sndTap(); gate('Grown-ups only 🔒', () => showView('parent')); };
  $('#star-chip').onclick = () => { sndTap(); showView('stars'); };
  $('#pin-cancel').onclick = () => { sndTap(); closePin(); };
  $('#lock-parent').onclick = () => {
    sndTap();
    gate('Grown-up override', () => {
      state.overrideDate = todayKey();
      save();
      updateOverlays();
    });
  };
  $('#break-parent').onclick = () => {
    sndTap();
    gate('Grown-up resume', () => {
      state.breakActive = false;
      save();
      updateOverlays();
    });
  };
  $('#overlay-shelf').addEventListener('click', e => {
    if (e.target === $('#overlay-shelf')) $('#overlay-shelf').classList.remove('show');
  });

  updateOverlays();

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => { /* offline support unavailable */ });
    });
  }
}
init();
