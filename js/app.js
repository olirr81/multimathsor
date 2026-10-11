import { onAuth, loadProfile, signOutUser } from './auth.js';
import { loadProgress, saveProgress, reloadProgress } from './storage.js';
import { pickNextWithStats, recordAnswer } from './engine.js';
import topicsMap, { getTopic } from './topics/registry.js';
import * as LoginUI from './ui/login.js';
import { initParentPanel } from './ui/parent.js';

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

function startGame(topicId, forcedTopicId) {
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
  document.getElementById('btn-switch-user').addEventListener('click', async () => { await signOutUser(); location.reload(); });
  document.getElementById('btn-signout').addEventListener('click', async () => { await signOutUser(); location.reload(); });

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
  while (s.size <
