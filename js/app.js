import { onAuth, loadProfile, signOutUser } from './auth.js';
import { loadProgress, saveProgress, reloadProgress, commitSession, flushProgress } from './storage.js';
import { pickNextWithStats, recordAnswer } from './engine.js';
import topicsMap, { getTopic } from './topics/registry.js';
import * as LoginUI from './ui/login.js';
import { initParentPanel } from './ui/parent.js';

const INACTIVITY_MS = 15 * 60 * 1000;   // 15 min
const ACTIVE_GAP_MS = 2 * 60 * 1000;    // 2 min entre ops para contar como "activa"
const MAX_ATTEMPTS_PER_SESSION = 200;   // tope de seguridad

const state = {
  user: null,
  profile: null,
  progress: null,
  session: { correct: 0, errors: 0, streak: 0 },
  mode: 'A',
  screen: 'HOME',
  activeTopicId: null,
  forcedTopicId: null,
  currentCard: null,
  currentTyped: '',
  cardStartTime: 0,
  firstTouchTime: 0,
  hasTouchedFirstKey: false,
  locked: false,
  // Session tracker
  tracker: null
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

  state.progress = await reloadProgress(state.user.uid);
  ensurePlan(state.progress);
  state.session = { correct: 0, errors: 0, streak: 0 };
  updateHUD();

  showScreen('HOME');
  renderTopicsGrid();
}

function ensurePlan(progress) {
  if (!progress.plan) {
    progress.plan = { order: ['tablas'], topics: { tablas: { enabled: true, activeLevels: null } } };
  }
  if (!progress.plan.order) progress.plan.order = [];
  if (!progress.plan.topics) progress.plan.topics = {};
}

function showScreen(screen) {
  state.screen = screen;
  document.getElementById('section-HOME').classList.toggle('hidden', screen !== 'HOME');
  document.getElementById('section-GAME').classList.toggle('hidden', screen !== 'GAME');
  document.getElementById('section-PARENT').classList.toggle('hidden', screen !== 'PARENT');
  document.getElementById('btn-home').classList.toggle('hidden', screen === 'HOME');
  document.getElementById('brand-icon').classList.toggle('hidden', screen !== 'HOME');

  document.querySelectorAll('.mode-tab').forEach(n => {
    n.style.display = screen === 'GAME' ? '' : 'none';
  });
  document.getElementById('game-hud').classList.toggle('hidden', screen !== 'GAME');
}

// ============ SESSION TRACKER ============
function trackerOpen(topicId, topicName) {
  state.tracker = {
    id: 's_' + Date.now(),
    topicId,
    topicName,
    startedAt: Date.now(),
    lastAttemptAt: Date.now(),
    modes: new Set([state.mode]),
    operations: 0,
    correct: 0,
    errors: 0,
    totalMs: 0,
    activeMs: 0,
    attempts: []
  };
}

function trackerAddResult(att) {
  if (!state.tracker) return;
  const t = state.tracker;
  const now = Date.now();
  const gap = now - t.lastAttemptAt;

  t.operations += 1;
  if (att.ok) t.correct += 1; else t.errors += 1;
  t.totalMs += att.ms || 0;
  t.activeMs += (gap > 0 && gap < ACTIVE_GAP_MS) ? gap : (att.ms || 0);
  t.lastAttemptAt = now;
  t.modes.add(state.mode);

  if (t.attempts.length < MAX_ATTEMPTS_PER_SESSION) {
    t.attempts.push(att);
  }
}

async function trackerCommitAndClose() {
  if (!state.tracker) return;
  const t = state.tracker;
  state.tracker = null;
  if (t.operations < 1) return;

  const session = {
    id: t.id,
    topicId: t.topicId,
    topicName: t.topicName,
    startedAt: t.startedAt,
    endedAt: Date.now(),
    durationSec: Math.round((Date.now() - t.startedAt) / 1000),
    activeSec: Math.round(t.activeMs / 1000),
    operations: t.operations,
    correct: t.correct,
    errors: t.errors,
    accuracy: Math.round((t.correct / t.operations) * 100),
    avgLatencyMs: Math.round(t.totalMs / t.operations),
    modes: [...t.modes],
    attempts: t.attempts
  };

  commitSession(state.progress, session);
  saveProgress(state.user.uid, state.progress);
  await flushProgress(state.user.uid);
}

// Detecta si el intento anterior fue hace demasiado
function trackerNeedsReset() {
  if (!state.tracker) return false;
  return Date.now() - state.tracker.lastAttemptAt > INACTIVITY_MS;
}

// ============ CUADRÍCULA ============
function renderTopicsGrid() {
  const grid = document.getElementById('topics-grid');
  grid.innerHTML = '';

  const plan = state.progress.plan;
  const order = plan.order.filter(id => plan.topics[id]?.enabled);

  for (const topicId of order) {
    const t = getTopic(topicId);
    if (!t) continue;
    grid.appendChild(makeTopicCard(t));
  }

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
  card.onclick = () => startGame(t.id, t.id);
  return card;
}

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

async function startGame(topicId, forcedTopicId) {
  // Si había una sesión abierta de otro tema, ciérrala
  if (state.tracker && state.tracker.topicId !== topicId) {
    await trackerCommitAndClose();
  }
  state.activeTopicId = topicId;
  state.forcedTopicId = forcedTopicId || topicId;
  state.session = { correct: 0, errors: 0, streak: 0 };
  updateHUD();
  showScreen('GAME');
  switchMode(state.mode || 'A');
}

function initUI() {
  document.querySelectorAll('.mode-tab').forEach(btn => {
    btn.addEventListener('click', () => switchMode(btn.dataset.mode));
  });

  document.getElementById('btn-home').addEventListener('click', async () => {
    await trackerCommitAndClose();
    state.forcedTopicId = null;
    state.activeTopicId = null;
    state.progress = await reloadProgress(state.user.uid);
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
    await trackerCommitAndClose();
    await signOutUser(); location.reload();
  });
  document.getElementById('btn-signout').addEventListener('click', async () => {
    await trackerCommitAndClose();
    await signOutUser(); location.reload();
  });

  document.getElementById('review-cancel').addEventListener('click', () => {
    document.getElementById('review-modal').classList.add('hidden');
  });
  document.getElementById('levels-close').addEventListener('click', () => {
    document.getElementById('levels-modal').classList.add('hidden');
    if (state.screen === 'PARENT') {
      openParentPanel(state.user);
    }
  });

  document.getElementById('btn-reveal').addEventListener('click', revealSolution);

  document.getElementById('btn-parent-panel').addEventListener('click', () => openParentPanel(state.user));

  // Cerrar sesión al salir de la pestaña / minimizar
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'hidden' && state.tracker) {
      await trackerCommitAndClose();
    }
  });
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

function nextCard() {
  // Si la sesión expiró por inactividad, ciérrala
  if (state.tracker && trackerNeedsReset()) {
    trackerCommitAndClose();
  }

  const next = pickNextWithStats(
    state.progress.plan,
    topicsMap,
    state.progress.stats || {},
    state.forcedTopicId
  );

  if (!next) {
    showScreen('HOME');
    renderTopicsGrid();
    return;
  }

  // Abre sesión si no hay ninguna
  if (!state.tracker) {
    trackerOpen(next.topicId, next.topic.nombre);
  }

  state.currentCard = next;
  state.currentTyped = '';
  state.hasTouchedFirstKey = false;
  state.firstTouchTime = 0;
  state.cardStartTime = Date.now();
  state.locked = false;
  renderCard();
}

function renderCard() {
  const c = state.currentCard;
  const tag = c.topic.nombre.toUpperCase();

  if (state.mode === 'A') {
    document.getElementById('card-topic-tag').textContent = tag;
    renderPromptInto('modeA-op', c);
    document.getElementById('modeA-hint').textContent =
      c.inputMode === 'choice' ? 'Choose the correct answer' : 'Introduce el resultado';
    document.getElementById('modeA-hint').className = 'text-xs text-slate-400 mt-1 min-h-[1.25rem]';
    document.getElementById('btn-reveal').classList.add('hidden');
    renderAnswerInput('A', c);
  } else if (state.mode === 'B') {
    document.getElementById('card-topic-tag-B').textContent = tag;
    renderPromptInto('modeB-op', c);
    renderQuizOptions();
  } else if (state.mode === 'C') {
    renderPromptInto('modeC-op', c);
    document.getElementById('modeC-hint').textContent =
      c.inputMode === 'choice' ? 'Choose the correct answer' : 'Escribe la respuesta';
    document.getElementById('modeC-hint').className = 'text-xs text-slate-400 mt-1 min-h-[1.25rem]';
    renderAnswerInput('C', c);
  }
}

function renderPromptInto(elId, c) {
  const el = document.getElementById(elId);
  if (c.topic.render) {
    el.innerHTML = c.topic.render(c.item, 'text-indigo-400');
  } else {
    el.textContent = c.item.prompt;
  }
}

function renderAnswerInput(slot, c) {
  const displayId = slot === 'A' ? 'modeA-display' : 'modeC-display';
  const numpadId  = slot === 'A' ? 'numpad-A'     : 'numpad-C';

  const display = document.getElementById(displayId);
  const numpad = document.getElementById(numpadId);

  if (c.inputMode === 'choice') {
    display.classList.add('hidden');
    numpad.className = 'grid grid-cols-2 gap-2 mt-3 w-full';
    numpad.innerHTML = '';
    for (const choice of c.item.choices) {
      const btn = document.createElement('button');
      btn.className = 'bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xl font-black py-4 rounded-2xl active:bg-indigo-600 transition text-white';
      btn.textContent = choice;
      btn.onclick = () => {
        if (state.locked) return;
        registerFirstTouch();
        evaluate(choice);
      };
      numpad.appendChild(btn);
    }
  } else {
    display.classList.remove('hidden');
    display.textContent = '?';
    numpad.className = 'w-full max-w-xs grid grid-cols-3 gap-2 mt-5';
    buildNumpad(numpadId, slot === 'A' ? pressA : pressC, slot === 'A' ? clearA : clearC);
  }
}

function renderQuizOptions() {
  const c = state.currentCard;
  const cont = document.getElementById('quiz-options');
  cont.innerHTML = '';

  let opts;
  if (c.inputMode === 'choice') {
    opts = c.item.choices;
  } else if (typeof c.topic.distractors === 'function') {
    opts = c.topic.distractors(c.item);
  } else {
    opts = generateNumericDistractors(c.item.answer);
  }

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

function generateNumericDistractors(correct) {
  const s = new Set([correct]);
  while (s.size < 4) {
    const delta = (Math.floor(Math.random() * 5) + 1) * (Math.random() < 0.5 ? 1 : -1);
    s.add(Math.max(1, correct + delta));
  }
  return [...s].sort(() => Math.random() - 0.5);
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
  const expected = String(state.currentCard.item.answer);
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
  const expected = String(state.currentCard.item.answer);
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
  const c = state.currentCard;
  document.getElementById('modeA-hint').innerHTML = `Answer: <strong>${c.item.answer}</strong>`;
  document.getElementById('modeA-hint').className = 'text-sm text-indigo-300 font-bold mt-1 min-h-[1.25rem]';
}

async function evaluate(userAns) {
  if (state.locked) return;
  const c = state.currentCard;
  const correct = c.item.answer;
  const isCorrect = String(userAns) === String(correct);
  const latency = state.firstTouchTime > 0 ? state.firstTouchTime : (Date.now() - state.cardStartTime);

  // Guarda en stats (para el motor adaptativo)
  recordAnswer(state.progress.stats, c.topicId, c.levelId, c.topic, c.item, isCorrect, latency);

  // Guarda en el tracker (para la sesión)
  trackerAddResult({
    levelId: c.levelId,
    prompt: c.item.prompt,
    answer: correct,
    given: userAns,
    ok: isCorrect,
    ms: latency,
    mode: state.mode,
    at: Date.now()
  });

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
      state.currentTyped = '';
      if (c.inputMode === 'numeric') {
        document.getElementById('modeA-display').textContent = '?';
      }
    } else if (state.mode === 'C') {
      document.getElementById('modeC-hint').textContent = '¡Error!';
      document.getElementById('modeC-hint').className = 'text-xs text-rose-400 font-bold mt-1 min-h-[1.25rem]';
      state.currentTyped = '';
      if (c.inputMode === 'numeric') {
        document.getElementById('modeC-display').textContent = '?';
      }
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
  window.dispatchEvent(new CustomEvent('mf:open-parent'));
}
