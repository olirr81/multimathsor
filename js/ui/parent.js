import { listChildren, createChild, registerChildUnderParent } from '../auth.js';
import { loadProgress, saveProgress, invalidateCache } from '../storage.js';

let ctx = null;
let currentUserId = null;
let currentViewUid = null;
let childrenCache = [];

export function initParentPanel(context) {
  ctx = context;

  document.getElementById('add-child-cancel').addEventListener('click', () => {
    document.getElementById('add-child-modal').classList.add('hidden');
  });
  document.getElementById('modal-close').addEventListener('click', () => {
    document.getElementById('detail-modal').classList.add('hidden');
  });
  document.getElementById('add-child-form').addEventListener('submit', handleAddChild);

  document.getElementById('levels-select-all').addEventListener('click', () => toggleAllLevels(true));
  document.getElementById('levels-select-none').addEventListener('click', () => toggleAllLevels(false));

  window.addEventListener('mf:open-parent', () => openPanel());
}

async function openPanel() {
  const state = ctx.getState();
  const user = state.user;
  if (!user) return;
  currentUserId = user.uid;

  ctx.showScreen('PARENT');

  const children = await listChildren(user.uid);
  childrenCache = children;

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
      <p class="text-xs text-slate-400 mb-4">Marca qué temas aparecen en la pantalla del niño. Usa ↑↓ para reordenar.</p>
      <div id="p-topics-list" class="space-y-2"></div>
    </div>

    <div class="bg-slate-900 border border-slate-800 rounded-3xl p-5">
      <h3 class="text-sm font-bold text-white mb-1 flex items-center gap-2">
        <i class="fa-solid fa-fire text-amber-400"></i> Mapa de calor (Tablas)
      </h3>
      <p class="text-xs text-slate-400 mb-4">Solo se muestran las operaciones de tablas. Toca cualquier celda para ver detalle.</p>
      <div class="overflow-x-auto">
        <div id="p-heatmap" class="grid grid-cols-12 gap-1 min-w-[480px]"></div>
      </div>
    </div>

    <div class="bg-slate-900 border border-slate-800 rounded-3xl p-5">
      <h3 class="text-sm font-bold text-white mb-3 flex items-center gap-2">
        <i class="fa-solid fa-triangle-exclamation text-rose-400"></i> Top 5 más atascadas
      </h3>
      <div id="p-bottlenecks" class="space-y-2"></div>
    </div>
  `;

  renderTopicsList(uid, prog);
  renderHeatmap(stats);
  renderBottlenecks(stats);
}

function renderTopicsList(uid, prog) {
  const cont = document.getElementById('p-topics-list');
  cont.innerHTML = '';
  const plan = prog.plan || { order: [], topics: {} };

  // Aseguramos que todos los temas disponibles están en order
  const allTopicIds = Object.keys(ctx.topicsMap);
  for (const id of allTopicIds) {
    if (!plan.order.includes(id)) plan.order.push(id);
    if (!plan.topics[id]) plan.topics[id] = { enabled: false, activeLevels: null };
  }

  plan.order.forEach((topicId, index) => {
    const t = ctx.topicsMap[topicId];
    if (!t) return;
    const cfg = plan.topics[topicId];
    const levels = t.levels();

    // Cuenta de niveles activos
    const activeCount = cfg.activeLevels ? cfg.activeLevels.length : levels.length;
    const levelsLabel = `${activeCount}/${levels.length} niveles`;

    const row = document.createElement('div');
    row.className = 'flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-2xl px-3 py-2.5';
    row.innerHTML = `
      <button data-toggle class="w-10 h-10 rounded-xl flex items-center justify-center text-xl font-black ${cfg.enabled ? 'bg-gradient-to-tr from-indigo-500 to-violet-600 text-white' : 'bg-slate-900 text-slate-500 border border-slate-800'}">
        ${t.icon}
      </button>
      <div class="flex-1">
        <div class="text-sm font-bold text-white">${t.nombre}</div>
        <div class="text-[10px] text-slate-400">${cfg.enabled ? levelsLabel : 'Desactivado'}</div>
      </div>
      <button data-config class="px-3 py-2 text-xs font-bold rounded-xl ${cfg.enabled ? 'bg-slate-800 hover:bg-slate-700 text-slate-200' : 'bg-slate
