import { onAuth, loadProfile, signOutUser } from './auth.js';
import { loadProgress, saveProgress } from './storage.js';
import { pickNextWithStats, recordAnswer } from './engine.js';
import topicsMap, { getTopic } from './topics/registry.js';
import * as LoginUI from './ui/login.js';
import { initParentPanel } from './ui/parent.js';

const state = {
  user: null,
  profile: null,
  progress: null,
  session: { correct: 0, errors: 0, streak: 0 },
  mode: 'A',                // 'A' | 'B' | 'C'
  screen: 'HOME',           // 'HOME' | 'GAME' | 'PARENT'
  activeTopicId: null,      // tema que se está practicando ahora
  forcedTopicId: null,      // si viene de "Repasar", el tema concreto
  currentCard: null,        // { topicId, op }
  examTable: 7,
  currentTyped: '',
  cardStartTime: 0,
  firstTouchTime: 0,
  hasTouchedFirstKey: false,
  locked: false
};

initUI();
initLoginListener();

function initLoginListener() {
  LoginUI.initLogin({
    onSuccess: async (user, profile) => {
      state.user = user;
      state.profile = profile;
      window.__currentUid = user.uid;
      LoginUI.hideLogin();
      await startApp();
    }
  });
}

onAuth(async (user) => {
  if (!user) {
    state.user = null;
    state.profile = null;
    LoginUI.showLogin();
    return;
  }
  LoginUI.showLoading();
  try {
    const profile = await loadProfile(user.uid);
    if (!profile) {
      LoginUI.showLogin();
      document.getElementById('login-error').textContent = 'Cuenta sin configurar.';
      return;
    }
    state.user = user;
    state.profile = profile;
    window.__currentUid = user.uid;
    LoginUI.hideLogin();
    await startApp();
  } finally {
    LoginUI.hideLoading();
  }
});

async function startApp() {
  document.getElementById('app-content').classList.remove('hidden');
  document.getElementById('header-user').textContent = state.profile.displayName || '';
  document.getElementById('btn-parent-panel').classList.toggle('hidden', state.profile.role !== 'parent');

  state.progress = await loadProgress(state.user.uid);
  ensurePlan(state.progress);
  state.session = { correct: 0, errors: 0, streak: 0 };
  updateHUD();

  showScreen('HOME');
  renderTopicsGrid();
}

// Asegura que progress tiene la estructura nueva. Migra si es antiguo.
function ensurePlan(progress) {
  if (!progress.plan) {
    progress.plan = {
      order: ['tablas'],
      topics: {
        tablas: { enabled: true, activeLevels: [1,2,3,4,5,6,7,8,9,10,11,12] }
      }
    };
  }
  // Migración: si tenía activeTables antiguo, conviértelo en activeLevels
  if (progress.activeTables && !progress.plan.topics.tablas.activeLevels) {
    progress.plan.topics.tablas.activeLevels = [...progress.activeTables];
  }
}

// ============ NAVEGACIÓN DE PANTALLAS ============
function showScreen(screen) {
  state.screen = screen;
  document.getElementById('section-HOME').classList.toggle('hidden', screen !== 'HOME');
  document.getElementById('section-GAME').classList.toggle('hidden', screen !== 'GAME');
  document.getElementById('section-PARENT').classList.toggle('hidden', screen !== 'PARENT');
  document.getElementById('btn-home').classList.toggle('hidden', screen === 'HOME');
  document.getElementById('brand-icon').classList.toggle('hidden', screen !== 'HOME');

  // HUD y tabs de modo solo en GAME
  const nav = document.querySelectorAll('.mode-tab');
  nav.forEach(n => n.style.display = screen === 'GAME' ? '' : 'none');
  document.getElementById('game-hud').classList.toggle('hidden', screen !== 'GAME');
}

// ============ CUADRÍCULA DE TEMAS ============
function renderTopicsGrid() {
  const grid = document.getElementById('topics-grid');
  grid.innerHTML = '';

  const plan = state.progress.plan;
  const order = plan.order.filter(id => plan.topics[id]?.enabled);

  for (const topicId of order) {
    const t = getTopic(topicId);
    if (!t) continue;
    const card = makeTopicCard(t);
    grid.appendChild(card);
  }

  // Tarjeta "Repasar"
  const review = document.createElement('button');
  review.className = 'bg-slate-900 border-2 border-slate-800 hover:border-slate-700 rounded-3xl p-5 flex flex-col items-center justify-center gap-2 transition active:scale-95 aspect-square';
  review.innerHTML = `
    <div class="text-5xl">🎲</div>
    <div class="text-sm font-black text-white">Repasar</div>
    <div class="text-[10px] text-slate-400 text-center leading-tight">Practicar algo concreto</div>
  `;
  review.onclick = openReviewModal;
  grid.appendChild(review);
}

function makeTopicCard(t) {
  const card = document.createElement('button');
  const colorMap = {
    indigo: 'from-indigo-500 to-violet-600',
    emerald: 'from-emerald-500 to-teal-600',
    rose: 'from-rose-500 to-pink-600',
    amber: 'from-amber-500 to-orange-600',
    sky: 'from-sky-500 to-cyan-600'
  };
  const grad = colorMap[t.color] || colorMap.indigo;
  card.className = `bg-gradient-to-tr ${grad} rounded-3xl p-5 flex flex-col items-center justify-center gap-2 shadow-2xl transition active:scale-95 aspect-square border border-white/10`;
  card.innerHTML = `
    <div class="text-5xl font-black text-white drop-shadow">${t.icon}</div>
    <div class="text-sm font-black text-white">${t.nombre}</div>
    <div class="text-[10px] text-white/70 text-center leading-tight">${t.nombreLargo}</div>
  `;
  card.onclick = () => startGame(t.id, null);
  return card;
}

// ============ MODAL REPASAR ============
function openReviewModal() {
  const list = document.getElementById('review-topics-list');
  list.innerHTML = '';
  for (const t of Object.values(topicsMap)) {
    const btn = document.createElement('button');
    btn.className = 'w-full bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-2xl px-4 py-3 flex items-center gap-3 transition';
    btn.innerHTML = `
      <div class="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-500 to-violet-600 flex items-center justify-center text-white font-black text-xl">${t.icon}</div>
      <div class="text-left">
        <div class="text-sm font-bold text-white">${t.nombre}</div>
        <div class="text-[10px] text-slate-400">${t.nombreLargo}</div>
      </div>
    `;
    btn.onclick = () => {
      document.getElementById('review-modal').classList.add('hidden');
      startGame(t.id, t.id);
    };
    list.appendChild(btn);
  }
  document.getElementById('review-modal').classList.remove('hidden');
}

// ============ INICIAR JUEGO ============
function startGame(topicId, forcedTopicId) {
  state.activeTopicId = topicId;
  state.forcedTopicId = forcedTopicId;
  state.session = { correct: 0, errors: 0, streak: 0 };
  updateHUD();
  showScreen('GAME');
  switchMode(state.mode || 'A');
}

// ============ NAVEGACIÓN DE MODOS ============
function initUI() {
  document.querySelectorAll('.mode-tab').forEach(btn => {
    btn.addEventListener('click', () => switchMode(btn.dataset.mode));
  });

  document.getElementById('btn-home').addEventListener('click', () => {
    showScreen('HOME');
    renderTopicsGrid();
  });

  document.getElementById('btn-config').addEventListener('click', () => {
    document.getElementById('config-modal').classList.remove('hidden');
  });
  document.getElementById('btn-config-cancel').addEventListener('click', () => {
    document.getElementById('config-modal').classList.add('hidden');
  });
  document.getElementById('btn-switch-user').addEventListener('click', async () => {
    await signOutUser();
    location.reload();
  });
  document.getElementById('btn-signout').addEventListener('click', async () => {
    await signOutUser();
    location.reload();
  });

  document.getElementById('review-cancel').addEventListener('click', () => {
    document.getElementById('review-modal').classList.add('hidden');
  });
  document.getElementById('levels-close').addEventListener('click', () => {
    document.getElementById('levels-modal').classList.add('hidden');
    // Refresca el panel de padres si está abierto
    if (state.screen === 'PARENT') {
      openParentPanel(state.user);
    }
  });

  buildNumpad('numpad-A', pressA, clearA);
  buildNumpad('numpad-C', pressC, clearC);

  document.getElementById('btn-reveal').addEventListener('click', revealSolution);
  document.getElementById('exam-table-select').value = state.examTable;
  document.getElementById('exam-table-select').addEventListener('change', (e) => {
    state.examTable = parseInt(e.target.value, 10);
    nextCard();
  });

  document.getElementById('btn-parent-panel').addEventListener('click', () => openParentPanel(state.user));
}

function switchMode(mode) {
  state.mode = mode;
  state.session = { correct: 0, errors: 0, streak: 0 };
  updateHUD();

  document.querySelectorAll('.mode-tab').forEach(b => {
    const on = b.dataset.mode === mode;
    b.className = `mode-tab px-2.5 py-1.5 rounded-xl text-xs font-bold transition ${
      on ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
         : 'text-slate-400 hover:text-white hover:bg-slate-800'
    }`;
  });

  ['A', 'B', 'C'].forEach(m => {
    document.getElementById(`section-${m}`).classList.toggle('hidden', m !== mode);
  });

  nextCard();
}

// ============ JUEGO ============
function nextCard() {
  if (state.mode === 'C') {
    const b = Math.floor(Math.random() * 12) + 1;
    const t = getTopic(state.activeTopicId);
    state.currentCard = { topicId: state.activeTopicId, op: { a: state.examTable, b }, topic: t };
  } else {
    const next = pickNextWithStats(
      state.progress.plan,
      topicsMap,
      state.progress.stats || {},
      state.forcedTopicId
    );
    if (!next) {
      // Fallback: nada configurado
      showScreen('HOME');
      renderTopicsGrid();
      return;
    }
    const t = getTopic(next.topicId);
    state.currentCard = { topicId: next.topicId, op: next.op, topic: t };
  }
  state.currentTyped = '';
  state.hasTouchedFirstKey = false;
  state.firstTouchTime = 0;
  state.cardStartTime = Date.now();
  state.locked = false;
  renderCard();
}

function renderCard() {
  const { op, topic } = state.currentCard;
  const tag = topic.nombre.toUpperCase();

  if (state.mode === 'A') {
    document.getElementById('card-topic-tag').textContent = tag;
    document.getElementById('modeA-op').innerHTML = topic.render(op);
    document.getElementById('modeA-display').textContent = '?';
    document.getElementById('modeA-hint').textContent = 'Introduce el resultado';
    document.getElementById('modeA-hint').className = 'text-xs text-slate-400 mt-1 min-h-[1.25rem]';
    document.getElementById('btn-reveal').classList.add('hidden');
  } else if (state.mode === 'B') {
    document.getElementById('card-topic-tag-B').textContent = tag;
    document.getElementById('modeB-op').innerHTML = topic.render(op, 'text-purple-400');
    renderQuizOptions();
  } else if (state.mode === 'C') {
    document.getElementById('modeC-op').innerHTML = topic.render(op, 'text-emerald-400');
    document.getElementById('modeC-display').textContent = '?';
    document.getElementById('modeC-hint').textContent = 'Escribe la respuesta';
    document.getElementById('modeC-hint').className = 'text-xs text-slate-400 mt-1 min-h-[1.25rem]';
  }
}

function renderQuizOptions() {
  const { op, topic } = state.currentCard;
  const correct = topic.solve(op);
  const opts = topic.distractors(op, correct);
  const cont = document.getElementById('quiz-options');
  cont.innerHTML = '';
  for (const v of opts) {
    const btn = document.createElement('button');
    btn.className = 'bg-slate-900 hover:bg-slate-800 border border-slate-800 text-2xl font-black py-4 rounded-2xl active:bg-purple-600 transition text-white shadow-lg';
    btn.textContent = v;
    btn.onclick = () => {
      if (state.locked) return;
      registerFirstTouch();
      evaluate(v);
    };
    cont.appendChild(btn);
  }
}

function buildNumpad(containerId, onDigit, onClear) {
  const cont = document.getElementById(containerId);
  cont.innerHTML = '';
  const layout = ['1','2','3','4','5','6','7','8','9','⌫','0','Borrar'];
  for (const k of layout) {
    const btn = document.createElement('button');
    const isBack = k === '⌫';
    const isClear = k === 'Borrar';
    btn.className = isBack
      ? 'bg-rose-950/30 hover:bg-rose-900/50 border border-rose-900/40 text-rose-300 font-bold py-3.5 rounded-2xl transition flex items-center justify-center'
      : isClear
      ? 'bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs font-bold py-3.5 rounded-2xl transition text-slate-400'
      : 'bg-slate-900 hover:bg-slate-800 border border-slate-800 text-2xl font-bold py-3.5 rounded-2xl active:bg-indigo-600 transition text-slate-100';
    btn.innerHTML = isBack ? '<i class="fa-solid fa-backspace"></i>' : k;
    btn.onclick = () => {
      if (state.locked) return;
      if (isBack) onClear(true);
      else if (isClear) onClear(false);
      else onDigit(k);
    };
    cont.appendChild(btn);
  }
}

function registerFirstTouch() {
  if (!state.hasTouchedFirstKey) {
    state.hasTouchedFirstKey = true;
    state.firstTouchTime = Date.now() - state.cardStartTime;
  }
}

function pressA(d) {
  registerFirstTouch();
  const { op, topic } = state.currentCard;
  const expected = String(topic.solve(op));
  if (state.currentTyped.length < expected.length) {
    state.currentTyped += d;
    document.getElementById('modeA-display').textContent = state.currentTyped;
  }
  if (state.currentTyped.length === expected.length) {
    evaluate(parseInt(state.currentTyped, 10));
  }
}

function clearA(backspace) {
  state.currentTyped = backspace ? state.currentTyped.slice(0, -1) : '';
  document.getElementById('modeA-display').textContent = state.currentTyped || '?';
}

function pressC(d) {
  registerFirstTouch();
  const { op, topic } = state.currentCard;
  const expected = String(topic.solve(op));
  if (state.currentTyped.length < expected.length) {
    state.currentTyped += d;
    document.getElementById('modeC-display').textContent = state.currentTyped;
  }
  if (state.currentTyped.length === expected.length) {
    evaluate(parseInt(state.currentTyped, 10));
  }
}

function clearC(backspace) {
  state.currentTyped = backspace ? state.currentTyped.slice(0, -1) : '';
  document.getElementById('modeC-display').textContent = state.currentTyped || '?';
}

function revealSolution() {
  const { op, topic } = state.currentCard;
  const correct = topic.solve(op);
  document.getElementById('modeA-hint').innerHTML = `${topic.renderPlain(op)} = ${correct}`;
  document.getElementById('modeA-hint').className = 'text-sm text-indigo-300 font-bold mt-1 min-h-[1.25rem]';
}

async function evaluate(userAns) {
  if (state.locked) return;
  const { op, topic, topicId } = state.currentCard;
  const correct = topic.solve(op);
  const isCorrect = userAns === correct;
  const latency = state.firstTouchTime > 0 ? state.firstTouchTime : (Date.now() - state.cardStartTime);

  recordAnswer(state.progress.stats, topicId, topic, op, isCorrect, latency);
  saveProgress(state.user.uid, state.progress);

  const container = state.mode === 'A' ? 'card-container'
                   : state.mode === 'B' ? 'quiz-options'
                   : 'exam-container';

  if (isCorrect) {
    state.session.correct++;
    state.session.streak++;
    updateHUD();
    if (window.confetti) confetti({ particleCount: 35, spread: 50, origin: { y: 0.7 } });
    state.locked = true;
    setTimeout(() => nextCard(), 800);
  } else {
    state.session.errors++;
    state.session.streak = 0;
    updateHUD();
    const el = document.getElementById(container);
    el.classList.add('animate-shake');
    setTimeout(() => el.classList.remove('animate-shake'), 400);

    if (state.mode === 'A') {
      document.getElementById('modeA-hint').textContent = '¡Casi! Inténtalo de nuevo';
      document.getElementById('modeA-hint').className = 'text-xs text-rose-400 font-bold mt-1 min-h-[1.25rem]';
      document.getElementById('btn-reveal').classList.remove('hidden');
      clearA(false);
    } else if (state.mode === 'C') {
      document.getElementById('modeC-hint').textContent = '¡Error!';
      document.getElementById('modeC-hint').className = 'text-xs text-rose-400 font-bold mt-1 min-h-[1.25rem]';
      clearC(false);
    } else if (state.mode === 'B') {
      state.locked = true;
      setTimeout(() => nextCard(), 700);
    }
  }
}

function updateHUD() {
  document.getElementById('hud-correct').textContent = state.session.correct;
  document.getElementById('hud-errors').textContent = state.session.errors;
  document.getElementById('hud-streak').textContent = `🔥 ${state.session.streak}`;
}

// ============ PANEL PADRES ============
let parentPanelInited = false;
function openParentPanel(user) {
  if (!parentPanelInited) {
    initParentPanel({
      getState: () => state,
      topicsMap,
      showScreen,
      renderTopicsGrid
    });
    parentPanelInited = true;
  }
  // Dispara el render llamando a la función interna del módulo
  // (lo hacemos vía evento personalizado para no acoplar)
  window.dispatchEvent(new CustomEvent('mf:open-parent'));
}
