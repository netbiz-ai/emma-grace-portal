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
    pets: [],            // adopted pets (Pet Pals)
    hearts: 0,           // Pet Pals currency, earned by caring for pets
    garden: { coins: 25, plotsUnlocked: 4, plots: [null, null, null, null, null, null], basket: [] },
    keydash: { stage: 1, top: 0 }, // highest stage reached, top speed
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
  { id: 'pets', name: 'Pet Pals', emoji: '🐾', cat: 'Pets', desc: 'Adopt & care', bg: 'linear-gradient(160deg,#F3E3FF,#FDF6FF)' },
  { id: 'garden', name: 'Magic Garden', emoji: '🌻', cat: 'Garden', desc: 'Plant & harvest', bg: 'linear-gradient(160deg,#E3F9E5,#F7FFF3)' },
  { id: 'keydash', name: 'Keyboard Dash', emoji: '⌨️', cat: 'Arcade', desc: 'Jump the keys!', bg: 'linear-gradient(160deg,#FFE9F4,#FFF9FC)' },
  { id: 'draw', name: 'Drawing Pad', emoji: '🎨', cat: 'Creative', desc: 'Paint a picture', bg: 'linear-gradient(160deg,#FFE3F0,#FFF6FB)' },
  { id: 'memory', name: 'Memory Match', emoji: '🧠', cat: 'Puzzle', desc: 'Find the pairs', bg: 'linear-gradient(160deg,#E3F2FF,#F5FBFF)' },
  { id: 'numbers', name: 'Number Quest', emoji: '🔢', cat: 'Educational', desc: 'Count & add', bg: 'linear-gradient(160deg,#E7F9EF,#F6FFF9)' },
  { id: 'letters', name: 'Word Wonders', emoji: '🔤', cat: 'Educational', desc: 'Letters & words', bg: 'linear-gradient(160deg,#FFF3D9,#FFFBF2)' }
];
const TITLES = { pets: 'Pet Pals', garden: 'Magic Garden', keydash: 'Keyboard Dash', draw: 'Drawing Pad', memory: 'Memory Match', numbers: 'Number Quest', letters: 'Word Wonders', challenge: 'Daily Challenge' };
const CATS = [
  { name: 'Pets', emoji: '🐾' },
  { name: 'Garden', emoji: '🌻' },
  { name: 'Arcade', emoji: '🕹️' },
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
let gameTimer = null; // games can set one interval for live re-renders
let gameRaf = null;   // ...or one animation-frame loop
const views = {
  home: $('#view-home'),
  game: $('#view-game'),
  stars: $('#view-stars'),
  parent: $('#view-parent')
};
function showView(name) {
  if (gameTimer) { clearInterval(gameTimer); gameTimer = null; }
  if (gameRaf) { cancelAnimationFrame(gameRaf); gameRaf = null; }
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
  if (gameTimer) { clearInterval(gameTimer); gameTimer = null; }
  if (gameRaf) { cancelAnimationFrame(gameRaf); gameRaf = null; }
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
  if (id === 'pets') initPets(stage);
  else if (id === 'garden') initGarden(stage);
  else if (id === 'keydash') initKeydash(stage);
  else if (id === 'draw') initDraw(stage);
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
   GAME 5: Pet Pals
   Adopt eggs, hatch pets, and care for them. Fulfilling a
   pet's needs earns hearts (for adopting more pets) and ages
   it through six stages, from Newborn to Full Grown. Needs
   decay with real time, even while the app is closed, but
   nothing bad ever happens to a neglected pet.
   ============================================================ */
const PET_SPECIES = [
  { sp: 'Puppy', e: '🐶', r: 0, starter: true }, { sp: 'Kitten', e: '🐱', r: 0, starter: true },
  { sp: 'Chick', e: '🐥', r: 0 },
  { sp: 'Bunny', e: '🐰', r: 1 }, { sp: 'Fox', e: '🦊', r: 1 }, { sp: 'Frog', e: '🐸', r: 1 },
  { sp: 'Turtle', e: '🐢', r: 2 }, { sp: 'Panda', e: '🐼', r: 2 }, { sp: 'Owl', e: '🦉', r: 2 },
  { sp: 'Penguin', e: '🐧', r: 3 }, { sp: 'Koala', e: '🐨', r: 3 }, { sp: 'Hedgehog', e: '🦔', r: 3 },
  { sp: 'Unicorn', e: '🦄', r: 4 }, { sp: 'Dragon', e: '🐉', r: 4 }
];
const PET_RARITY = [
  { name: 'Common', c: '#6B7B8D', bg: '#E8EDF2', w: 45 },
  { name: 'Uncommon', c: '#2E7D4F', bg: '#DFF7EC', w: 30 },
  { name: 'Rare', c: '#3F7FB8', bg: '#E1F0FF', w: 15 },
  { name: 'Ultra-Rare', c: '#7A63C8', bg: '#EFE9FF', w: 7 },
  { name: 'Legendary', c: '#9A7200', bg: '#FFF3C4', w: 3 }
];
const PET_STAGES = [
  { name: 'Newborn', up: 'a Newborn 🍼', xp: 0, size: 64 },
  { name: 'Junior', up: 'a Junior 🧒', xp: 25, size: 76 },
  { name: 'Pre-Teen', up: 'a Pre-Teen 🎒', xp: 60, size: 88 },
  { name: 'Teen', up: 'a Teen 🎧', xp: 110, size: 100 },
  { name: 'Post-Teen', up: 'a Post-Teen 🛹', xp: 175, size: 110 },
  { name: 'Full Grown', up: 'all Full Grown 🌟', xp: 260, size: 120 }
];
const PET_NAMES = ['Biscuit', 'Coco', 'Peanut', 'Mochi', 'Sunny', 'Pip', 'Noodle', 'Bubbles',
  'Ziggy', 'Maple', 'Sprinkles', 'Pickles', 'Waffles', 'Jellybean', 'Poppy', 'Doodle',
  'Twinkle', 'Marshmallow'];
const PET_NEEDS = [
  { id: 'hunger', name: 'Feed', emoji: '🍎' },
  { id: 'fun', name: 'Play', emoji: '🧸' },
  { id: 'clean', name: 'Wash', emoji: '🛁' },
  { id: 'energy', name: 'Rest', emoji: '😴' }
];
const PET_CARE_MSG = {
  hunger: ['Yummy! 😋', 'Crunch, crunch! 🍎', 'So tasty! 😋'],
  fun: ['Wheee! 🎈', 'So much fun! 😄', 'Again! Again! 🧸'],
  clean: ['Splish, splash! 🛁', 'All clean! ✨', 'Bubbles everywhere! 🫧'],
  energy: ['Zzz... 😴', 'Nap time! 🌙', 'So cozy... 💤']
};
const PET_DECAY = 0.5;   // need points lost per minute, even while away
const PET_BOOST = 45;    // need points restored per care action
const PET_XP = 10;       // xp per care action, +5 bonus when the need was urgent
const PET_EGG_COST = 10; // hearts
const PET_MAX = 8;

let petSelId = null;

function newPetNeeds() {
  const t = Date.now();
  const n = {};
  PET_NEEDS.forEach(x => { n[x.id] = { v: 90, t: t }; });
  return n;
}
function petNeedNow(n) {
  const mins = (Date.now() - n.t) / 60000;
  return Math.max(0, Math.min(100, n.v - mins * PET_DECAY));
}
function petStage(p) {
  let s = PET_STAGES[0], next = null;
  for (let i = 0; i < PET_STAGES.length; i++) {
    if (p.xp >= PET_STAGES[i].xp) s = PET_STAGES[i];
    else { next = PET_STAGES[i]; break; }
  }
  return { s: s, next: next };
}
function pickPetSpecies(starter) {
  if (starter) {
    const st = PET_SPECIES.filter(x => x.starter);
    return st[Math.floor(Math.random() * st.length)];
  }
  const total = PET_RARITY.reduce((a, r) => a + r.w, 0);
  let roll = Math.random() * total, ri = PET_RARITY.length - 1;
  for (let i = 0; i < PET_RARITY.length; i++) {
    roll -= PET_RARITY[i].w;
    if (roll <= 0) { ri = i; break; }
  }
  const pool = PET_SPECIES.filter(x => x.r === ri);
  return pool[Math.floor(Math.random() * pool.length)];
}
function pickPetName() {
  const used = new Set(state.pets.map(p => p.name));
  const free = PET_NAMES.filter(n => !used.has(n));
  const list = free.length ? free : PET_NAMES;
  return list[Math.floor(Math.random() * list.length)];
}
function activePet() {
  let p = state.pets.find(x => x.id === petSelId);
  if (!p && state.pets.length) { p = state.pets[state.pets.length - 1]; petSelId = p.id; }
  return p || null;
}

function initPets(stage) {
  let hatching = false;
  let hatched = null;
  let petMsg = '';

  function hatch() {
    if (hatching || state.pets.length >= PET_MAX) return;
    const starter = state.pets.length === 0;
    if (!starter) {
      if (state.hearts < PET_EGG_COST) return;
      state.hearts -= PET_EGG_COST;
    }
    hatching = true;
    const spec = pickPetSpecies(starter);
    const pet = {
      id: 'p' + Date.now() + Math.floor(Math.random() * 1000),
      sp: spec.sp, e: spec.e, r: spec.r,
      name: pickPetName(),
      xp: 0, born: Date.now(),
      needs: newPetNeeds()
    };
    state.pets.push(pet);
    petSelId = pet.id;
    save();
    sndTap();
    render();
    setTimeout(() => {
      hatching = false;
      hatched = pet;
      sndWin();
      confetti(pet.r >= 3 ? 36 : 20);
      render();
    }, 900);
  }

  function careFor(pet, needId) {
    const beforeStage = petStage(pet).s.name;
    const before = petNeedNow(pet.needs[needId]);
    pet.needs[needId] = { v: Math.min(100, before + PET_BOOST), t: Date.now() };
    pet.xp += PET_XP + (before < 30 ? 5 : 0);
    state.hearts += 2;
    const st = petStage(pet);
    if (st.s.name !== beforeStage) {
      state.hearts += 5;
      petMsg = pet.name + ' is ' + st.s.up + '!';
      sndWin();
      confetti();
    } else {
      const msgs = PET_CARE_MSG[needId];
      petMsg = msgs[Math.floor(Math.random() * msgs.length)];
      sndGood();
    }
    save();
    render();
  }

  function render() {
    stage.innerHTML = '';

    if (hatching) {
      stage.append(el('div', 'center pet-egg-big', '🥚'));
      stage.append(el('p', 'result-msg center', 'Something is wiggling...'));
      return;
    }
    if (hatched) {
      const r = PET_RARITY[hatched.r];
      const big = el('div', 'center pet-emoji', hatched.e);
      big.style.fontSize = '96px';
      stage.append(big);
      stage.append(el('p', 'result-msg center', 'It\'s ' + hatched.name + ' the ' + hatched.sp + '!'));
      const badge = el('span', 'pet-badge', r.name);
      badge.style.background = r.bg;
      badge.style.color = r.c;
      const bw = el('div', 'center pet-info');
      bw.append(badge);
      stage.append(bw);
      const hi = el('button', 'btn', 'Say hi! 👋');
      hi.type = 'button';
      hi.onclick = () => { sndTap(); hatched = null; petMsg = ''; render(); };
      const wrap = el('div', 'center pet-actions');
      wrap.append(hi);
      stage.append(wrap);
      return;
    }

    const pet = activePet();
    if (!pet) {
      const card = el('button', 'card pet-egg-card');
      card.type = 'button';
      card.innerHTML = '<span class="card-emoji">🥚</span>' +
        '<span class="card-name">A mystery egg!</span>' +
        '<span class="card-desc">Tap to meet your first pet - free!</span>';
      card.onclick = hatch;
      const wrap = el('div', 'pet-egg-wrap');
      wrap.append(card);
      stage.append(wrap);
      return;
    }

    // pet switcher + hearts balance
    const head = el('div', 'pet-head');
    const strip = el('div', 'pet-strip');
    state.pets.forEach(p => {
      const b = el('button', 'pet-tab' + (p.id === pet.id ? ' sel' : ''), p.e);
      b.type = 'button';
      b.setAttribute('aria-label', p.name + ' the ' + p.sp);
      b.onclick = () => { sndTap(); petSelId = p.id; petMsg = ''; render(); };
      strip.append(b);
    });
    head.append(strip, el('span', 'hearts-chip', '💖 ' + state.hearts));
    stage.append(head);

    // the pet itself
    const st = petStage(pet);
    const big = el('div', 'center pet-emoji', pet.e);
    big.style.fontSize = st.s.size + 'px';
    stage.append(big);
    stage.append(el('p', 'pet-name center', pet.name + ' the ' + pet.sp));
    if (petMsg) stage.append(el('p', 'pet-msg center', petMsg));
    const info = el('div', 'center pet-info');
    const badge = el('span', 'pet-badge', PET_RARITY[pet.r].name);
    badge.style.background = PET_RARITY[pet.r].bg;
    badge.style.color = PET_RARITY[pet.r].c;
    info.append(badge, el('span', 'pet-badge pet-badge-stage', st.s.name));
    stage.append(info);

    // xp towards the next stage
    const xpRow = el('div', 'bar-row');
    xpRow.append(el('span', 'bar-day', '✨'));
    const xpTrack = el('div', 'bar-track');
    const xpFill = el('div', 'bar-fill');
    xpFill.style.width = (st.next ? Math.round((pet.xp - st.s.xp) / (st.next.xp - st.s.xp) * 100) : 100) + '%';
    xpTrack.append(xpFill);
    xpRow.append(xpTrack, el('span', 'bar-val', st.next ? '' : 'MAX'));
    stage.append(xpRow);

    // needs
    PET_NEEDS.forEach(n => {
      const row = el('div', 'bar-row');
      row.append(el('span', 'bar-day', n.emoji));
      const track = el('div', 'bar-track');
      const fill = el('div', 'bar-fill');
      const v = Math.round(petNeedNow(pet.needs[n.id]));
      fill.style.width = v + '%';
      if (v < 30) fill.classList.add('low');
      track.append(fill);
      row.append(track, el('span', 'bar-val', v));
      stage.append(row);
    });

    // care actions
    const care = el('div', 'care-grid');
    PET_NEEDS.forEach(n => {
      const b = el('button', 'care-btn', '<span class="care-emoji">' + n.emoji + '</span><br>' + n.name);
      b.type = 'button';
      b.onclick = () => careFor(pet, n.id);
      care.append(b);
    });
    stage.append(care);

    // adopt another pet
    const wrap = el('div', 'center pet-actions');
    if (state.pets.length < PET_MAX) {
      const ad = el('button', 'btn btn-green pet-adopt', '🥚 Adopt a new pet · ' + PET_EGG_COST + ' 💖');
      ad.type = 'button';
      if (state.hearts < PET_EGG_COST) ad.disabled = true;
      ad.onclick = hatch;
      wrap.append(ad);
      if (state.hearts < PET_EGG_COST) wrap.append(el('p', 'hint', 'Care for your pets to earn 💖!'));
    } else {
      wrap.append(el('p', 'hint', 'Your pet family is full! 💜'));
    }
    stage.append(wrap);
  }

  render();
}

/* ============================================================
   GAME 6: Magic Garden
   Plant seeds, wait for crops to grow (in real time, even
   while the app is closed), then harvest and sell them for
   coins. A seed shop restocks every 5 minutes with weighted
   rarity odds, weather changes every 5 minutes and can
   multiply growth speed or mutate crops (Wet, Frozen,
   Shocked, Gold, Rainbow) for big coin paydays. Crops never
   rot and nothing is ever lost.
   ============================================================ */
const SEEDS = [
  { id: 'carrot', name: 'Carrot', e: '🥕', r: 0, cost: 10, grow: 2, sell: 20 },
  { id: 'strawberry', name: 'Strawberry', e: '🍓', r: 0, cost: 25, grow: 4, sell: 45, regrow: true },
  { id: 'tomato', name: 'Tomato', e: '🍅', r: 1, cost: 40, grow: 6, sell: 75, regrow: true },
  { id: 'corn', name: 'Corn', e: '🌽', r: 1, cost: 60, grow: 8, sell: 115 },
  { id: 'blueberry', name: 'Blueberry', e: '🫐', r: 1, cost: 80, grow: 10, sell: 150, regrow: true },
  { id: 'pumpkin', name: 'Pumpkin', e: '🎃', r: 2, cost: 120, grow: 12, sell: 230 },
  { id: 'watermelon', name: 'Watermelon', e: '🍉', r: 2, cost: 180, grow: 15, sell: 350 },
  { id: 'grapes', name: 'Grapes', e: '🍇', r: 2, cost: 260, grow: 18, sell: 500 },
  { id: 'starfruit', name: 'Starfruit', e: '⭐', r: 3, cost: 400, grow: 22, sell: 800 },
  { id: 'moonbloom', name: 'Moon Bloom', e: '🌙', r: 3, cost: 600, grow: 28, sell: 1250 },
  { id: 'rainbowrose', name: 'Rainbow Rose', e: '🌈', r: 4, cost: 1000, grow: 40, sell: 2200 }
];
const SEED_RARITY = [
  { name: 'Common', c: '#6B7B8D', bg: '#E8EDF2' },
  { name: 'Uncommon', c: '#2E7D4F', bg: '#DFF7EC' },
  { name: 'Rare', c: '#3F7FB8', bg: '#E1F0FF' },
  { name: 'Legendary', c: '#7A63C8', bg: '#EFE9FF' },
  { name: 'Mythical', c: '#B84A8A', bg: '#FFE3F2' }
];
const SHOP_W = [40, 28, 18, 10, 4];      // rotating-stock rarity weights
const SHOP_STAPLES = ['carrot', 'strawberry']; // always in stock
const WEATHERS = [
  { id: 'sunny', name: 'Sunny', e: '☀️', speed: 1, tip: 'A lovely day for growing.' },
  { id: 'rain', name: 'Rain', e: '🌧️', speed: 1.5, tip: 'Rain makes crops grow 1.5x fast - harvest now for Wet 💧 crops (2x)!' },
  { id: 'storm', name: 'Storm', e: '⛈️', speed: 1.5, tip: 'Storms make crops grow 1.5x fast - lightning can make Shocked ⚡ crops (100x)!' },
  { id: 'frost', name: 'Frost', e: '❄️', speed: 1, tip: 'Harvest during a frost for Frozen 🧊 crops (10x)!' }
];
const MUTS = {
  wet: { name: 'Wet', e: '💧', mult: 2 },
  frozen: { name: 'Frozen', e: '🧊', mult: 10 },
  shocked: { name: 'Shocked', e: '⚡', mult: 100 },
  gold: { name: 'Gold', e: '✨', mult: 20 },
  rainbow: { name: 'Rainbow', e: '🌈', mult: 50 }
};
const G_BUCKET = 5 * 60000;     // weather & shop restock bucket
const G_WATER_MAX = 3;          // waterings per crop
const G_WATER_BOOST = 0.1;      // growth gained per watering (of grow time)
const G_UNLOCK_COSTS = [150, 400]; // plot 5 and 6

function seedById(id) { return SEEDS.find(s => s.id === id); }
function weatherAt(ts) {
  const r = mulberry32(hashStr('weather|' + Math.floor(ts / G_BUCKET)))();
  if (r < 0.6) return WEATHERS[0];
  if (r < 0.8) return WEATHERS[1];
  if (r < 0.9) return WEATHERS[2];
  return WEATHERS[3];
}
// Shop: staples + 3 rotating picks, deterministic per 5-minute bucket.
function seedStock(now) {
  const rng = mulberry32(hashStr('stock|' + Math.floor(now / G_BUCKET)));
  const picks = [];
  let guard = 0;
  while (picks.length < 3 && guard++ < 80) {
    let roll = rng() * 100, ri = SHOP_W.length - 1;
    for (let i = 0; i < SHOP_W.length; i++) { roll -= SHOP_W[i]; if (roll <= 0) { ri = i; break; } }
    const pool = SEEDS.filter(s => s.r === ri && !SHOP_STAPLES.includes(s.id) && !picks.includes(s));
    if (pool.length) picks.push(pool[Math.floor(rng() * pool.length)]);
  }
  while (picks.length < 3) {
    const rest = SEEDS.filter(s => !SHOP_STAPLES.includes(s.id) && !picks.includes(s));
    picks.push(rest[Math.floor(rng() * rest.length)]);
  }
  return SHOP_STAPLES.map(seedById).concat(picks);
}
function rollMutation(weatherId) {
  const r = Math.random();
  if (r < 0.001) return 'rainbow';
  if (r < 0.011) return 'gold';
  const w = Math.random();
  if (weatherId === 'rain' && w < 0.4) return 'wet';
  if (weatherId === 'storm' && w < 0.3) return 'shocked';
  if (weatherId === 'frost' && w < 0.3) return 'frozen';
  return null;
}
// Effective minutes grown: weather-weighted elapsed time + watering.
function growEff(crop, now) {
  let eff = crop.water * crop.grow * G_WATER_BOOST;
  let t = crop.planted;
  while (t < now && eff < crop.grow) {
    const next = Math.min((Math.floor(t / G_BUCKET) + 1) * G_BUCKET, now);
    eff += (next - t) / 60000 * weatherAt(t).speed;
    t = next;
  }
  return Math.min(eff, crop.grow);
}

function initGarden(stage) {
  const g = state.garden;
  let planting = -1;
  let gMsg = '';

  function buy(seed, i) {
    if (g.coins < seed.cost) return;
    g.coins -= seed.cost;
    g.plots[i] = { seed: seed.id, planted: Date.now(), water: 0, grow: seed.grow };
    planting = -1;
    gMsg = seed.e + ' ' + seed.name + ' planted! It keeps growing even while you are away.';
    sndGood();
    save();
    render();
  }
  function water(i) {
    const c = g.plots[i];
    if (!c || c.water >= G_WATER_MAX) return;
    c.water++;
    sndGood();
    save();
    render();
  }
  function unlock() {
    const cost = G_UNLOCK_COSTS[g.plotsUnlocked - 4];
    if (cost == null || g.coins < cost) return;
    g.coins -= cost;
    g.plotsUnlocked++;
    gMsg = 'Your garden grew bigger! 🌻';
    sndWin();
    confetti(14);
    save();
    render();
  }
  function harvest(i) {
    const c = g.plots[i];
    if (!c) return;
    const now = Date.now();
    if (growEff(c, now) < c.grow) return;
    const seed = seedById(c.seed);
    const mut = rollMutation(weatherAt(now).id);
    const m = mut ? MUTS[mut] : null;
    const val = Math.round(seed.sell * (m ? m.mult : 1));
    const label = (m ? m.e + ' ' + m.name + ' ' : '') + seed.name;
    g.basket.push({ e: seed.e, name: label, val: val });
    if (m && m.mult >= 20) {
      gMsg = m.e + ' ' + m.name.toUpperCase() + '! You picked a ' + label + '! Amazing!';
      sndWin();
      confetti(30);
    } else {
      gMsg = 'You picked a ' + label + '!' + (m ? ' Worth ' + m.mult + 'x!' : '');
      sndGood();
    }
    if (seed.regrow) {
      c.planted = now;
      c.water = 0;
      c.grow = Math.max(1, Math.ceil(seed.grow / 2));
      gMsg += ' It grows back! 🌱';
    } else {
      g.plots[i] = null;
    }
    save();
    render();
  }
  function sellAll() {
    if (!g.basket.length) return;
    const total = g.basket.reduce((a, x) => a + x.val, 0);
    g.coins += total;
    gMsg = 'Sold the whole basket for ' + total + ' 🪙!';
    g.basket = [];
    sndWin();
    confetti(14);
    save();
    render();
  }

  function renderShop(now) {
    stage.append(el('h3', null, '🌱 Seed Shop'));
    const left = 5 - Math.floor((now % G_BUCKET) / 60000);
    stage.append(el('p', 'g-tip', 'New seeds arrive in ~' + left + 'm. Rare seeds come and go!'));
    const grid = el('div', 'g-shop');
    seedStock(now).forEach(s => {
      const b = el('button', 'g-seed');
      b.type = 'button';
      if (g.coins < s.cost) b.disabled = true;
      b.innerHTML = '<span class="s-e">' + s.e + '</span><span class="s-n">' + s.name + '</span>';
      const r = SEED_RARITY[s.r];
      const badge = el('span', 'pet-badge', r.name);
      badge.style.background = r.bg;
      badge.style.color = r.c;
      b.append(badge);
      b.append(el('span', 's-i', s.cost + ' 🪙 · ⏱️ ' + s.grow + 'm · sells ~' + s.sell + ' 🪙'));
      if (s.regrow) b.append(el('span', 's-i', '🌱 grows back after picking!'));
      b.onclick = () => buy(s, planting);
      grid.append(b);
    });
    stage.append(grid);
    const cancel = el('button', 'btn btn-ghost', 'Never mind');
    cancel.type = 'button';
    cancel.onclick = () => { sndTap(); planting = -1; render(); };
    const wrap = el('div', 'center pet-actions');
    wrap.append(cancel);
    stage.append(wrap);
  }

  function renderBasket() {
    if (!g.basket.length) return;
    stage.append(el('h3', null, '🧺 Harvest Basket'));
    const groups = {};
    g.basket.forEach(x => {
      if (!groups[x.name]) groups[x.name] = { e: x.e, name: x.name, val: x.val, n: 0 };
      groups[x.name].n++;
    });
    const total = g.basket.reduce((a, x) => a + x.val, 0);
    Object.keys(groups).forEach(k => {
      const it = groups[k];
      const row = el('div', 'g-basket-row');
      row.append(el('span', null, it.e + ' ' + it.name + (it.n > 1 ? ' ×' + it.n : '')));
      row.append(el('span', null, it.val * it.n + ' 🪙'));
      stage.append(row);
    });
    const sell = el('button', 'btn btn-green', '💰 Sell all for ' + total + ' 🪙');
    sell.type = 'button';
    sell.onclick = sellAll;
    const wrap = el('div', 'center pet-actions');
    wrap.append(sell);
    stage.append(wrap);
  }

  function renderPlots(now) {
    const w = weatherAt(now);
    const grid = el('div', 'g-grid');
    for (let i = 0; i < g.plots.length; i++) {
      const c = g.plots[i];
      const plot = el('div', 'gplot');
      if (i >= g.plotsUnlocked) {
        plot.classList.add('locked');
        plot.append(el('div', 'g-crop', '🔒'));
        const cost = G_UNLOCK_COSTS[g.plotsUnlocked - 4];
        if (i === g.plotsUnlocked && cost != null) {
          const b = el('button', 'btn btn-sm btn-green', 'Unlock · ' + cost + ' 🪙');
          b.type = 'button';
          if (g.coins < cost) b.disabled = true;
          b.onclick = unlock;
          plot.append(b);
        } else {
          plot.append(el('div', 'g-time', 'Locked'));
        }
      } else if (!c) {
        plot.append(el('div', 'g-crop', '🟫'));
        const b = el('button', 'btn btn-sm', 'Tap to plant!');
        b.type = 'button';
        b.onclick = () => { sndTap(); planting = i; render(); };
        plot.append(b);
      } else {
        const seed = seedById(c.seed);
        const eff = growEff(c, now);
        const prog = Math.min(1, eff / c.grow);
        const ce = el('div', 'g-crop', seed.e);
        ce.style.fontSize = (26 + prog * 38) + 'px';
        plot.append(ce);
        if (prog >= 1) {
          plot.classList.add('ready');
          const b = el('button', 'btn btn-sm btn-pink', 'Harvest!');
          b.type = 'button';
          b.onclick = () => harvest(i);
          plot.append(b);
        } else {
          const track = el('div', 'bar-track g-prog');
          const fill = el('div', 'bar-fill');
          fill.style.width = Math.round(prog * 100) + '%';
          track.append(fill);
          plot.append(track);
          const remMin = (c.grow - eff) / w.speed;
          plot.append(el('div', 'g-time', remMin <= 1 ? '⏳ almost ready!' : '⏳ ~' + Math.ceil(remMin) + 'm left'));
          if (c.water < G_WATER_MAX) {
            const wb = el('button', 'btn btn-sm g-water', '💧 Water (' + (G_WATER_MAX - c.water) + ')');
            wb.type = 'button';
            wb.onclick = () => water(i);
            plot.append(wb);
          } else {
            plot.append(el('div', 'g-time', '💧💧💧'));
          }
        }
      }
      grid.append(plot);
    }
    stage.append(grid);
  }

  function render() {
    stage.innerHTML = '';
    const now = Date.now();
    const w = weatherAt(now);
    const head = el('div', 'g-head');
    head.append(el('span', 'hearts-chip', '🪙 ' + g.coins));
    head.append(el('span', 'hearts-chip', w.e + ' ' + w.name));
    head.append(el('span', 'hearts-chip', '🧺 ' + g.basket.length));
    stage.append(head);
    stage.append(el('p', 'g-tip', w.tip));
    if (gMsg) stage.append(el('p', 'pet-msg center', gMsg));

    if (planting >= 0) renderShop(now);
    else {
      renderPlots(now);
      renderBasket();
    }
  }

  render();
  gameTimer = setInterval(() => {
    if (currentView === 'game' && currentGameId === 'garden') render();
  }, 5000);
}

/* ============================================================
   GAME 7: Keyboard Dash
   Mini the unicorn auto-runs across giant candy keyboard
   keys. Tap anywhere to jump the gaps; every key you step on
   gives +1 speed, so you keep accelerating. One fall and you
   are back at the start of the stage. Reach the ENTER key to
   escape. Stage layouts are deterministic, so retries are
   fair, and the highest stage reached is saved.
   ============================================================ */
const KD_GRAV = 2600;    // px/s^2
const KD_JUMP = 800;     // px/s jump impulse
const KD_STEP = 14;      // px/s gained per key stepped on
const KD_KEY_TOP = 300;  // canvas y of the key surface
const KD_FALL = 300;     // px below the surface before it counts as a fall
const KD_CHAR_X = 180;   // runner's fixed screen x
let kdProbe = null;      // debug/testing handle for the live run
const KD_ROWS = 'QWERTYUIOPASDFGHJKLZXCVBNM';
const KD_PAL = [
  { top: '#FFE3F0', front: '#FF9EC7', ink: '#7A2E54' },
  { top: '#EFE7FF', front: '#B8A7F9', ink: '#4A3A86' },
  { top: '#E1F2FF', front: '#8FCBFF', ink: '#2E5E8C' },
  { top: '#E2F9EC', front: '#9BE7C4', ink: '#256B4C' },
  { top: '#FFF4D9', front: '#FFD93D', ink: '#7A5C00' },
  { top: '#FFE9E1', front: '#FFB59E', ink: '#8C4326' }
];

// Deterministic layout per stage: same course every retry.
function kdBuildStage(n) {
  const rng = mulberry32(hashStr('keydash|' + n));
  const keys = [{ x: 0, w: 260, letter: '▶', c: 0 }];
  const total = 20 + n * 6;
  const gapMin = Math.min(120, 34 + n * 8);
  const gapVar = Math.min(90, 30 + n * 6);
  let x = 260, li = 0;
  for (let i = 0; i < total; i++) {
    const isSpace = i % 9 === 8;
    x += i === 0 ? 30 : Math.round(gapMin + rng() * gapVar);
    const w = isSpace ? 240 : 92 + Math.round(rng() * 36);
    keys.push({ x: x, w: w, letter: isSpace ? 'SPACE' : KD_ROWS[li++ % 26], c: (i + 1) % KD_PAL.length });
    x += w;
  }
  x += Math.round(gapMin + rng() * gapVar);
  keys.push({ x: x, w: 300, letter: 'ENTER ⏎', c: 4 });
  const last = keys[keys.length - 1];
  return { keys: keys, baseSpeed: 120 + n * 15, finishX: last.x + last.w - 40 };
}
function kdKeyAt(level, x) {
  const ks = level.keys;
  for (let i = 0; i < ks.length; i++) {
    if (x >= ks[i].x && x <= ks[i].x + ks[i].w) return i;
  }
  return -1;
}
function kdNewSim(n) {
  const level = kdBuildStage(n);
  return {
    stage: n, level: level,
    x: level.keys[0].x + 40, y: 0, vy: 0,
    grounded: true, speed: level.baseSpeed,
    keyIdx: 0, status: 'run', // run | fall | clear
    coyote: 0
  };
}
// One physics step. y = 0 is the key surface, positive is down.
function kdStep(s, dt, jump) {
  const ev = { jumped: false, landed: 0, fell: false, cleared: false };
  if (s.status !== 'run') return ev;
  if (s.grounded) s.coyote = 0; else s.coyote += dt * 1000;
  // Jumps work on the ground or within 100ms of leaving it (coyote time).
  if (jump && (s.grounded || s.coyote < 100)) {
    s.vy = -KD_JUMP;
    s.grounded = false;
    s.coyote = 999;
    ev.jumped = true;
  }
  s.vy += KD_GRAV * dt;
  s.y += s.vy * dt;
  s.x += s.speed * dt;
  const ki = kdKeyAt(s.level, s.x);
  if (s.grounded) {
    if (ki < 0) {
      s.grounded = false; // ran off the edge of a key
    } else {
      s.y = 0;
      s.vy = 0;
      if (ki !== s.keyIdx) {
        s.keyIdx = ki;
        s.speed += KD_STEP;
        ev.landed = 1;
      }
    }
  } else if (s.vy > 0 && s.y >= 0) {
    if (ki >= 0) {
      s.grounded = true;
      s.y = 0;
      s.vy = 0;
      if (ki !== s.keyIdx) {
        s.keyIdx = ki;
        s.speed += KD_STEP;
        ev.landed = 1;
      }
    } else if (s.y > KD_FALL) {
      s.status = 'fall';
      ev.fell = true;
    }
  }
  if (s.status === 'run' && s.grounded && s.x >= s.level.finishX) {
    s.status = 'clear';
    ev.cleared = true;
  }
  return ev;
}
// Layered mechanical-keyboard click; pitch climbs with speed.
function kdClick(speed) {
  const f = 1500 + Math.min(900, (speed - 100) * 1.2);
  beep(f, 0.03, 'square', 0.05);
  beep(f * 0.5, 0.045, 'triangle', 0.04, 0.012);
}

function initKeydash(stage) {
  const W = 900, H = 420;
  const canvas = el('canvas');
  canvas.id = 'kd-canvas';
  canvas.width = W;
  canvas.height = H;
  stage.append(canvas);
  const panel = el('div', 'kd-panel');
  stage.append(panel);
  const ctx = canvas.getContext('2d');

  let sim = kdNewSim(state.keydash.stage);
  let mode = 'intro'; // intro | play | dead | clear
  let jumpBufferT = -1000; // last tap time in ms (input buffering)
  let lastT = 0;
  let deadT = 0;
  let pops = [];
  let decos = [];
  kdProbe = { get sim() { return sim; }, get mode() { return mode; } };

  function buildDecos() {
    const rng = mulberry32(hashStr('kddeco|' + sim.stage));
    const DE = ['🍭', '🍬', '🍫', '🧁', '🍩', '🍪'];
    decos = [];
    for (let i = 0; i < 40; i++) {
      decos.push({
        x: rng() * (sim.level.finishX + 600),
        y: 30 + rng() * 190,
        e: DE[Math.floor(rng() * DE.length)],
        s: 22 + Math.floor(rng() * 20)
      });
    }
  }

  function startPlay() {
    panel.style.display = 'none';
    mode = 'play';
  }

  function showIntro() {
    mode = 'intro';
    panel.innerHTML = '';
    panel.style.display = '';
    panel.append(el('p', 'kd-msg',
      'Tap anywhere to <b>JUMP</b>! Every key you land on makes you faster ⚡<br>' +
      'Reach the <b>ENTER ⏎</b> key to escape!'));
    if (state.keydash.top > 0) {
      panel.append(el('p', 'kd-hint', 'Best: Stage ' + state.keydash.stage + ' · ⚡ ' + state.keydash.top));
    }
    const b = el('button', 'btn', '▶️ Start');
    b.type = 'button';
    b.onclick = () => { sndTap(); startPlay(); };
    panel.append(b);
  }

  function onClear() {
    mode = 'clear';
    state.keydash.top = Math.max(state.keydash.top, Math.round(sim.speed));
    state.keydash.stage = Math.max(state.keydash.stage, sim.stage + 1);
    save();
    sndWin();
    confetti(30);
    panel.innerHTML = '';
    panel.style.display = '';
    panel.append(el('p', 'kd-msg', '🎉 You escaped Stage ' + sim.stage + '! Top speed: ⚡ ' + Math.round(sim.speed)));
    const b = el('button', 'btn', '➡️ Stage ' + (sim.stage + 1));
    b.type = 'button';
    b.onclick = () => {
      sndTap();
      sim = kdNewSim(sim.stage + 1);
      buildDecos();
      pops = [];
      panel.style.display = 'none';
      mode = 'play';
    };
    panel.append(b);
  }

  function resetRun() {
    sim = kdNewSim(sim.stage);
    buildDecos();
    pops = [];
    mode = 'play';
  }

  canvas.addEventListener('pointerdown', e => {
    e.preventDefault();
    if (mode === 'intro') startPlay(); // "tap anywhere" starts too
    if (mode === 'play') jumpBufferT = performance.now();
  });

  function tick(t) {
    if (mode === 'play') {
      const dt = Math.min(0.05, lastT ? (t - lastT) / 1000 : 0.016);
      // Taps are buffered for 150ms so early or mid-air taps still jump.
      const ev = kdStep(sim, dt, t - jumpBufferT < 150);
      if (ev.jumped) { jumpBufferT = -1000; beep(480, 0.09, 'sine', 0.07); }
      if (ev.landed) { kdClick(sim.speed); pops.push({ x: sim.x, t: t }); }
      if (ev.fell) { mode = 'dead'; deadT = t; sndNo(); }
      if (ev.cleared) onClear();
    } else if (mode === 'dead' && t - deadT > 900) {
      resetRun();
    }
    lastT = t;
    draw(t);
    gameRaf = requestAnimationFrame(tick);
  }

  function draw(t) {
    const cam = Math.max(0, sim.x - KD_CHAR_X);
    ctx.fillStyle = '#F7F0FF';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, KD_KEY_TOP + 56, W, H - KD_KEY_TOP - 56);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const d of decos) {
      const sx = d.x - cam * 0.35;
      if (sx < -60 || sx > W + 60) continue;
      ctx.font = d.s + 'px serif';
      ctx.fillText(d.e, sx, d.y);
    }
    const ks = sim.level.keys;
    for (let i = 0; i < ks.length; i++) {
      const k = ks[i];
      const sx = k.x - cam;
      if (sx + k.w < -60 || sx > W + 60) continue;
      const pal = KD_PAL[k.c];
      ctx.fillStyle = pal.front;
      ctx.fillRect(sx, KD_KEY_TOP + 12, k.w, 30);
      ctx.fillStyle = pal.top;
      ctx.fillRect(sx, KD_KEY_TOP, k.w, 14);
      ctx.fillStyle = pal.ink;
      ctx.font = '700 20px Fredoka, sans-serif';
      ctx.fillText(k.letter, sx + k.w / 2, KD_KEY_TOP + 27);
    }
    pops = pops.filter(p => t - p.t < 700);
    ctx.font = '700 20px Fredoka, sans-serif';
    for (const p of pops) {
      const a = 1 - (t - p.t) / 700;
      ctx.fillStyle = 'rgba(69, 174, 120, ' + a + ')';
      ctx.fillText('+1', p.x - cam, KD_KEY_TOP - 24 - (t - p.t) / 14);
    }
    ctx.save();
    ctx.translate(KD_CHAR_X, KD_KEY_TOP + sim.y);
    if (!sim.grounded) ctx.rotate(sim.vy < 0 ? -0.15 : 0.25);
    ctx.scale(-1, 1);
    ctx.font = '46px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('🦄', 0, 2);
    ctx.restore();
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#5B4B8A';
    ctx.font = '700 22px Fredoka, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('⚡ ' + Math.round(sim.speed), 16, 28);
    ctx.textAlign = 'center';
    ctx.fillText('Stage ' + sim.stage, W / 2, 28);
    const x0 = sim.level.keys[0].x;
    const prog = Math.max(0, Math.min(1, (sim.x - x0) / (sim.level.finishX - x0)));
    ctx.fillStyle = '#E9DFF9';
    ctx.fillRect(16, 42, W - 32, 8);
    ctx.fillStyle = '#B8A7F9';
    ctx.fillRect(16, 42, (W - 32) * prog, 8);
    if (mode === 'dead') {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.78)';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#5B4B8A';
      ctx.font = '700 34px Fredoka, sans-serif';
      ctx.fillText('😱 Back to the start!', W / 2, H / 2);
    }
  }

  buildDecos();
  showIntro();
  draw(0);
  gameRaf = requestAnimationFrame(tick);
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
