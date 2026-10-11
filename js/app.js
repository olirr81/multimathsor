import { onAuth, loadProfile, signOutUser } from './auth.js';
import { loadProgress, saveProgress } from './storage.js';
import { pickNext, recordAnswer } from './engine.js';
import topics from './topics/registry.js';
import * as LoginUI from './ui/login.js';
import { initParentPanel } from './ui/parent.js';

const topic = topics.tablas;

const state = {
  user: null,
  profile: null,
  progress: null,
  session: { correct: 0, errors: 0, streak: 0 },
  mode: 'A',
  currentCard: null,
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
  state.session = { correct: 0, errors: 0, streak: 0 };
  updateHUD();

  switchMode('A');
}

function initUI() {
  document.querySelectorAll('.mode-tab').forEach(btn => {
    btn.addEventListener('click', () => switchMode(btn.dataset.mode));
  });
  document.getElementById('btn-config').addEventListener('click', () => {
    document.getElementById('config-modal').classList.remove('hidden');
  });
  document.getElementById('btn-config-cancel').addEventListener('click', () => {
    document.getElementById('config-modal').classList.add('hidden');
  });
  document.getElementById('btn-switch-user').addEventListener('click', async () => {
    await signOutUser();
    document.getElementById('config-modal').classList.add('hidden');
    location.reload();
  });
  document.getElementById('btn-signout').addEventListener('click', async () => {
    await signOutUser();
    location.reload();
  });

  buildNumpad('numpad-A', pressA, clearA);
  buildNumpad('numpad-C', pressC, clearC);

  document.getElementById('btn-reveal').addEventListener('click', revealSolution);
  document.getElementById('exam-table-select').value = state.examTable;
  document.getElementById('exam-table-select').addEventListener('change', (e) => {
    state.examTable = parseInt(e.target.value, 10);
    nextCard();
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

  ['A', 'B', 'C', 'PARENT'].forEach(m => {
    document.getElementById(`section-${m}`).classList.toggle('hidden', m !== mode);
  });
  document.getElementById('game-hud').classList.toggle('hidden', mode === 'PARENT');

  if (mode === 'PARENT') return;

  nextCard();
}

function nextCard() {
  if (state.mode === 'C') {
    const b = Math.floor(Math.random() * 10) + 1;
    state.currentCard = { a: state.examTable, b };
  } else {
    const stats = state.progress.stats || {};
    state.currentCard = pickNext(topic, stats);
  }
  state.currentTyped = '';
  state.hasTouchedFirstKey = false;
  state.firstTouchTime = 0;
  state.cardStartTime = Date.now();
  state.locked = false;
  renderCard();
}

function renderCard() {
  const op = state.currentCard;

  if (state.mode === 'A') {
    document.getElementById('modeA-op').innerHTML = topic.render(op);
    document.getElementById('modeA-display').textContent = '?';
    document.getElementById('modeA-hint').textContent = 'Introduce el resultado';
    document.getElementById('modeA-hint').className = 'text-xs text-slate-400 mt-1 min-h-[1.25rem]';
    document.getElementById('btn-reveal').classList.add('hidden');
  } else if (state.mode === 'B') {
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
  const correct = topic.solve(state.currentCard);
  const opts = topic.distractors(state.currentCard, correct);
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
  const expected = String(topic.solve(state.currentCard));
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
  const expected = String(topic.solve(state.currentCard));
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
  const correct = topic.solve(state.currentCard);
  document.getElementById('modeA-hint').innerHTML = `${topic.renderPlain(state.currentCard)} = ${correct}`;
  document.getElementById('modeA-hint').className = 'text-sm text-indigo-300 font-bold mt-1 min-h-[1.25rem]';
}

async function evaluate(userAns) {
  if (state.locked) return;
  const correct = topic.solve(state.currentCard);
  const isCorrect = userAns === correct;
  const latency = state.firstTouchTime > 0 ? state.firstTouchTime : (Date.now() - state.cardStartTime);

  recordAnswer(state.progress.stats, topic, state.currentCard, isCorrect, latency);
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

initParentPanel({
  getCurrentUser: () => state.user
});