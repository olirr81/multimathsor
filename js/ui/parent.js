import { listChildren, createChild, registerChildUnderParent } from '../auth.js';
import { loadProgress, saveProgress, invalidateCache } from '../storage.js';

let ctx = null;
let currentUserId = null;
let currentViewUid = null;

export function initParentPanel(context) {
  ctx = context;

  document.getElementById('add-child-cancel').addEventListener('click', () => {
    document.getElementById('add-child-modal').classList.add('hidden');
  });
  document.getElementById('modal-close').addEventListener('click', () => {
    document.getElementById('detail-modal').classList.add('hidden');
  });
  document.getElementById('add-child-form').addEventListener('submit', handleAddChild);

  window.addEventListener('mf:open-parent', () => openPanel());
}

async function openPanel() {
  const state = ctx.getState();
  const user = state.user;
  if (!user) return;
  currentUserId = user.uid;

  ctx.showScreen('PARENT');

  const children = await listChildren(user.uid);

  const options = [
    { uid: user.uid, displayName: 'Yo (progenitor)', role: 'parent' },
    ...children
  ];

  if (!currentViewUid || !options.find(o => o.uid === currentViewUid)) {
    currentViewUid = children[0]?.uid || user.uid;
  }

  const sec = document.getElementById('section-PARENT');
  sec.innerHTML = `
    <div class="bg-slate-900 border border-slate-800 rounded-3xl p-5 flex flex-col md:flex-row items-center justify-between gap-4">
      <div>
        <h2 class="text-xl font-bold text-white flex items-center gap-2">
          <i class="fa-solid fa-chart-line text-amber-400"></i> Panel de Padres
        </h2>
        <p class="text-xs text-slate-400 mt-0.5">Programa qué practica cada hijo y revisa su progreso.</p>
      </div>
      <div class="flex gap-2">
        <button id="p-add-child" class="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition">
          <i class="fa-solid fa-user-plus mr-1"></i> Añadir hijo
        </button>
        <button id="p-export" class="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold transition border border-slate-700">
          <i class="fa-solid fa-download"></i>
        </button>
        <button id="p-import" class="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold transition border border-slate-700">
          <i class="fa-solid fa-upload"></i>
        </button>
      </div>
    </div>

    <div class="bg-slate-900 border border-slate-800 rounded-3xl p-4">
      <label class="text-[10px] font-bold uppercase text-slate-400 tracking-wider">Configurando a:</label>
      <select id="p-child-select" class="w-full mt-1 bg-slate-950 border border-slate-700 text-white text-sm font-bold rounded-xl px-3 py-2 outline-none">
        ${options.map(o => `<option value="${o.uid}" ${o.uid === currentViewUid ? 'selected' : ''}>${o.displayName}${o.role === 'child' ? ' (hijo)' : ''}</option>`).join('')}
      </select>
    </div>

    <div id="p-stats-area" class="space-y-5"></div>
  `;

  document.getElementById('p-add-child').addEventListener('click', () => {
    document.getElementById('add-child-modal').classList.remove('hidden');
    document.getElementById('add-child-error').textContent = '';
  });
  document.getElementById('p-export').addEventListener('click', () => exportJSON(currentViewUid));
  document.getElementById('p-import').addEventListener('click', () => importJSON(currentViewUid));

  const sel = document.getElementById('p-child-select');
  sel.addEventListener('change', () => {
    currentViewUid = sel.value;
    renderStats(currentViewUid);
  });

  renderStats(currentViewUid);
}

async function handleAddChild(e) {
  e.preventDefault();
  const errEl = document.getElementById('add-child-error');
  errEl.textContent = '';
  const name = document.getElementById('child-name').value.trim();
  const user = document.getElementById('child-user').value.trim();
  const pass = document.getElementById('child-pass').value;

  try {
    const childUid = await createChild(currentUserId, user, pass, name);
    await registerChildUnderParent(currentUserId, childUid);
    document.getElementById('add-child-modal').classList.add('hidden');
    document.getElementById('add-child-form').reset();
    await openPanel();
  } catch (err) {
    errEl.textContent = err.code === 'auth/email-already-in-use'
      ? 'Ese usuario ya existe.'
      : (err.message || 'Error al crear la cuenta.');
  }
}

async function renderStats(uid) {
  const area = document.getElementById('p-stats-area');
  const prog = await loadProgress(uid);
  const stats = prog.stats || {};

  let totalOps = 0, totalCorrect = 0, totalLatSum = 0;
  for (const s of Object.values(stats)) {
    totalOps += s.attempts || 0;
    totalCorrect += s.correct || 0;
    totalLatSum += s.totalFirstTouchMs || 0;
  }
  const accuracy = totalOps > 0 ? Math.round((totalCorrect / totalOps) * 100) : 0;
  const avgLat = totalOps > 0 ? ((totalLatSum / totalOps) / 1000).toFixed(1) : '0.0';

  area.innerHTML = `
    <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
      <div class="bg-slate-900 border border-slate-800 p-4 rounded-2xl">
        <span class="text-[10px] font-bold uppercase text-slate-400">Operaciones</span>
        <div class="text-2xl font-black text-white mt-1">${totalOps}</div>
      </div>
      <div class="bg-slate-900 border border-slate-800 p-4 rounded-2xl">
        <span class="text-[10px] font-bold uppercase text-slate-400">Precisión</span>
        <div class="text-2xl font-black text-emerald-400 mt-1">${accuracy}%</div>
      </div>
      <div class="bg-slate-900 border border-slate-800 p-4 rounded-2xl col-span-2 sm:col-span-1">
        <span class="text-[10px] font-bold uppercase text-slate-400">Latencia 1er toque</span>
        <div class="text-2xl font-black text-amber-400 mt-1">${avgLat}s</div>
      </div>
    </div>

    <div class="bg-slate-900 border border-slate-800 rounded-3xl p-5">
      <h3 class="text-sm font-bold text-white mb-1 flex items-center gap-2">
        <i class="fa-solid fa-book text-indigo-400"></i> Temas y orden de práctica
      </h3>
      <p class="text-xs text-slate-400 mb-4">Marca qué temas aparecen en la pantalla del niño. Usa ↑↓ para reordenar. El engranaje configura los niveles.</p>
      <div id="p-topics-list" class="space-y-2"></div>
    </div>

    <div class="bg-slate-900 border border-slate-800 rounded-3xl p-5">
      <h3 class="text-sm font-bold text-white mb-3 flex items-center gap-2">
        <i class="fa-solid fa-triangle-exclamation text-rose-400"></i> Top 5 más atascadas
      </h3>
      <div id="p-bottlenecks" class="space-y-2"></div>
    </div>
  `;

  renderTopicsList(uid, prog);
  renderBottlenecks(stats);
}

function renderTopicsList(uid, prog) {
  const cont = document.getElementById('p-topics-list');
  cont.innerHTML = '';
  const plan = prog.plan || { order: [], topics: {} };

  const allTopicIds = Object.keys(ctx.topicsMap);
  for (const id of allTopicIds) {
    if (!plan.order.includes(id)) plan.order.push(id);
    if (!plan.topics[id]) plan.topics[id] = { enabled: false, activeLevels: null };
  }
  prog.plan = plan;

  plan.order.forEach((topicId, index) => {
    const t = ctx.topicsMap[topicId];
    if (!t) return;
    const cfg = plan.topics[topicId];
    const allLevels = t.levels();
    const active = cfg.activeLevels || allLevels.map(l => l.id);
    const activeCount = active.length;

    const row = document.createElement('div');
    row.className = 'flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-2xl px-3 py-2.5';
    row.innerHTML = `
      <button data-toggle class="w-10 h-10 rounded-xl flex items-center justify-center text-xl font-black ${cfg.enabled ? 'bg-gradient-to-tr from-indigo-500 to-violet-600 text-white' : 'bg-slate-900 text-slate-500 border border-slate-800'}">
        ${t.icon}
      </button>
      <div class="flex-1">
        <div class="text-sm font-bold text-white">${t.nombre}</div>
        <div class="text-[10px] text-slate-400">${cfg.enabled ? activeCount + '/' + allLevels.length + ' niveles' : 'Desactivado — ' + activeCount + '/' + allLevels.length}</div>
      </div>
      <button data-config class="px-3 py-2 text-xs font-bold rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200">
        <i class="fa-solid fa-sliders"></i>
      </button>
      <div class="flex flex-col">
        <button data-up class="px-2 text-slate-400 hover:text-white text-[10px]" ${index === 0 ? 'disabled' : ''}>▲</button>
        <button data-down class="px-2 text-slate-400 hover:text-white text-[10px]" ${index === plan.order.length - 1 ? 'disabled' : ''}>▼</button>
      </div>
    `;

    row.querySelector('[data-toggle]').onclick = () => {
      cfg.enabled = !cfg.enabled;
      saveProgress(uid, prog);
      renderTopicsList(uid, prog);
    };
    row.querySelector('[data-config]').onclick = () => openLevelsModal(uid, topicId, t, cfg);
    row.querySelector('[data-up]').onclick = () => {
      if (index === 0) return;
      const arr = plan.order;
      [arr[index - 1], arr[index]] = [arr[index], arr[index - 1]];
      saveProgress(uid, prog);
      renderTopicsList(uid, prog);
    };
    row.querySelector('[data-down]').onclick = () => {
      if (index === plan.order.length - 1) return;
      const arr = plan.order;
      [arr[index + 1], arr[index]] = [arr[index], arr[index + 1]];
      saveProgress(uid, prog);
      renderTopicsList(uid, prog);
    };

    cont.appendChild(row);
  });
}

function openLevelsModal(uid, topicId, topic, cfg) {
  const modal = document.getElementById('levels-modal');
  const title = document.getElementById('levels-modal-title');
  const grid = document.getElementById('levels-grid');

  title.textContent = `${topic.nombre} — niveles`;

  const levels = topic.levels();
  const active = cfg.activeLevels || levels.map(l => l.id);

  // Agrupamos por .group (si existe)
  const groups = {};
  for (const lvl of levels) {
    const g = lvl.group || 'Otros';
    if (!groups[g]) groups[g] = [];
    groups[g].push(lvl);
  }

  grid.className = 'space-y-4 mb-4';
  grid.innerHTML = '';

  for (const [groupName, groupLevels] of Object.entries(groups)) {
    const groupEl = document.createElement('div');

    const header = document.createElement('div');
    header.className = 'text-[10px] font-bold uppercase text-slate-400 tracking-wider mb-2';
    header.textContent = groupName;
    groupEl.appendChild(header);

    const row = document.createElement('div');
    row.className = 'grid grid-cols-2 sm:grid-cols-3 gap-2';

    for (const lvl of groupLevels) {
      const on = active.includes(lvl.id);
      const btn = document.createElement('button');
      btn.dataset.level = String(lvl.id);
      btn.dataset.on = on ? '1' : '0';
      btn.textContent = lvl.label;
      btn.onclick = () => {
        btn.dataset.on = btn.dataset.on === '1' ? '0' : '1';
        repaintLevelsGrid();
      };
      row.appendChild(btn);
    }

    groupEl.appendChild(row);
    grid.appendChild(groupEl);
  }

  repaintLevelsGrid();

  document.getElementById('levels-select-all').onclick = () => {
    grid.querySelectorAll('button[data-level]').forEach(b => b.dataset.on = '1');
    repaintLevelsGrid();
  };
  document.getElementById('levels-select-none').onclick = () => {
    grid.querySelectorAll('button[data-level]').forEach(b => b.dataset.on = '0');
    repaintLevelsGrid();
  };
  document.getElementById('levels-close').onclick = async () => {
    const selected = [...grid.querySelectorAll('button[data-level]')]
      .filter(b => b.dataset.on === '1')
      .map(b => {
        const raw = b.dataset.level;
        const n = parseInt(raw, 10);
        return isNaN(n) ? raw : n;
      });
    if (selected.length === 0) {
      alert('Marca al menos un nivel.');
      return;
    }
    const prog = await loadProgress(uid);
    if (!prog.plan) prog.plan = { order: [], topics: {} };
    if (!prog.plan.topics[topicId]) prog.plan.topics[topicId] = { enabled: true, activeLevels: null };
    prog.plan.topics[topicId].activeLevels = selected;
    saveProgress(uid, prog);
    modal.classList.add('hidden');
    renderStats(uid);
  };

  modal.classList.remove('hidden');
}

function repaintLevelsGrid() {
  const grid = document.getElementById('levels-grid');
  grid.querySelectorAll('button[data-level]').forEach(b => {
    const on = b.dataset.on === '1';
    b.className = `px-3 py-2.5 rounded-xl text-xs font-bold transition border ${
      on ? 'bg-indigo-600 border-indigo-500 text-white shadow-md shadow-indigo-600/30'
         : 'bg-slate-950 border-slate-800 text-slate-500'
    }`;
  });
}

function renderBottlenecks(stats) {
  const cont = document.getElementById('p-bottlenecks');
  cont.innerHTML = '';
  const items = [];
  for (const [k, s] of Object.entries(stats)) {
    if (!s.attempts) continue;
    // clave nueva: topic:level:op
    const parts = k.split(':');
    if (parts.length < 3) continue;
    const [, levelId, opKey] = parts;
    const avgL = (s.totalFirstTouchMs / s.attempts) / 1000;
    items.push({ op: `[${levelId}] ${opKey}`, errors: s.errors, latency: avgL.toFixed(1), score: s.errors * 25 + avgL });
  }
  items.sort((a, b) => b.score - a.score);
  if (!items.length) {
    cont.innerHTML = `<p class="text-xs text-slate-500 italic">Sin datos todavía.</p>`;
    return;
  }
  for (const it of items.slice(0, 5)) {
    const row = document.createElement('div');
    row.className = 'flex items-center justify-between p-3 rounded-2xl bg-slate-950 border border-slate-800 text-xs';
    row.innerHTML = `
      <span class="font-black text-white text-sm">${it.op}</span>
      <div class="flex items-center gap-3">
        <span class="text-rose-400 font-bold"><i class="fa-solid fa-circle-xmark"></i> ${it.errors}</span>
        <span class="text-amber-400 font-bold"><i class="fa-solid fa-clock"></i> ${it.latency}s</span>
      </div>`;
    cont.appendChild(row);
  }
}

async function exportJSON(uid) {
  const prog = await loadProgress(uid);
  const blob = new Blob([JSON.stringify({ uid, progress: prog }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `multiflash_${uid.slice(0, 6)}_${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

async function importJSON(uid) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json';
  input.onchange = async () => {
    const file = input.files[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      const prog = {
        stats: data.progress?.stats || {},
        plan: data.progress?.plan || null
      };
      invalidateCache(uid);
      saveProgress(uid, prog);
      setTimeout(() => renderStats(uid), 2000);
      alert('Progreso importado. Se subirá a la nube en unos segundos.');
    } catch (e) {
      alert('JSON inválido.');
    }
  };
  input.click();
}
