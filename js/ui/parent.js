import { listChildren, createChild, registerChildUnderParent } from '../auth.js';
import { loadProgress, saveProgress, invalidateCache, flushProgress } from '../storage.js';

let ctx = null;
let currentUserId = null;
let currentViewUid = null;
let currentTab = 'resumen';

// SheetJS viene desde el <script> en index.html
const XLSX = window.XLSX;

export function initParentPanel(context) {
  ctx = context;

  document.getElementById('add-child-cancel').addEventListener('click', () => {
    document.getElementById('add-child-modal').classList.add('hidden');
  });
  document.getElementById('modal-close').addEventListener('click', () => {
    document.getElementById('detail-modal').classList.add('hidden');
  });
  document.getElementById('add-child-form').addEventListener('submit', handleAddChild);

  window.addEventListener('mf:open-parent', () => {
    currentTab = 'resumen';
    openPanel();
  });
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
      </div>
    </div>

    <div class="bg-slate-900 border border-slate-800 rounded-3xl p-4">
      <label class="text-[10px] font-bold uppercase text-slate-400 tracking-wider">Configurando a:</label>
      <select id="p-child-select" class="w-full mt-1 bg-slate-950 border border-slate-700 text-white text-sm font-bold rounded-xl px-3 py-2 outline-none">
        ${options.map(o => `<option value="${o.uid}" ${o.uid === currentViewUid ? 'selected' : ''}>${o.displayName}${o.role === 'child' ? ' (hijo)' : ''}</option>`).join('')}
      </select>
    </div>

    <div class="bg-slate-900 border border-slate-800 rounded-2xl p-1.5 flex gap-1">
      <button data-tab="resumen" class="ptab flex-1 py-2.5 rounded-xl text-xs font-bold transition">Resumen</button>
      <button data-tab="informe" class="ptab flex-1 py-2.5 rounded-xl text-xs font-bold transition">Informe</button>
      <button data-tab="config" class="ptab flex-1 py-2.5 rounded-xl text-xs font-bold transition">Configuración</button>
    </div>

    <div id="p-tab-content"></div>
  `;

  document.getElementById('p-add-child').addEventListener('click', () => {
    document.getElementById('add-child-modal').classList.remove('hidden');
    document.getElementById('add-child-error').textContent = '';
  });

  document.getElementById('p-child-select').addEventListener('change', (e) => {
    currentViewUid = e.target.value;
    renderTab();
  });

  document.querySelectorAll('.ptab').forEach(btn => {
    btn.addEventListener('click', () => {
      currentTab = btn.dataset.tab;
      renderTab();
    });
  });

  renderTab();
}

function renderTab() {
  // Actualiza el estilo de las pestañas
  document.querySelectorAll('.ptab').forEach(b => {
    const on = b.dataset.tab === currentTab;
    b.className = `ptab flex-1 py-2.5 rounded-xl text-xs font-bold transition ${
      on ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
         : 'text-slate-400 hover:text-white hover:bg-slate-800'
    }`;
  });

  if (currentTab === 'resumen')      renderResumenTab(currentViewUid);
  else if (currentTab === 'informe') renderInformeTab(currentViewUid);
  else if (currentTab === 'config')  renderConfigTab(currentViewUid);
}

// ============================================================
// PESTAÑA: RESUMEN
// ============================================================
async function renderResumenTab(uid) {
  const cont = document.getElementById('p-tab-content');
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

  cont.innerHTML = `
    <div class="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-1">
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

    <div class="bg-slate-900 border border-slate-800 rounded-3xl p-5 mt-5">
      <h3 class="text-sm font-bold text-white mb-3 flex items-center gap-2">
        <i class="fa-solid fa-triangle-exclamation text-rose-400"></i> Top 5 más atascadas
      </h3>
      <div id="p-bottlenecks" class="space-y-2"></div>
    </div>
  `;
  renderBottlenecks(stats);
}

// ============================================================
// PESTAÑA: INFORME
// ============================================================
async function renderInformeTab(uid) {
  const cont = document.getElementById('p-tab-content');
  const prog = await loadProgress(uid);

  const kpis = prog.kpis || { daily: {}, byTopic: {}, byLevel: {} };
  const sessions = prog.sessions || [];

  // KPIs por tema (toda la historia)
  const byTopic = kpis.byTopic || {};
  const topicRows = Object.entries(byTopic).map(([topicId, t]) => {
    const accuracy = t.ops > 0 ? Math.round((t.correct / t.ops) * 100) : 0;
    const avgMs = t.ops > 0 ? Math.round(t.ms / t.ops) : 0;
    return { topicId, ...t, accuracy, avgMs };
  }).sort((a, b) => a.topicId.localeCompare(b.topicId));

  // KPIs por nivel (toda la historia)
  const byLevel = kpis.byLevel || {};
  const levelRows = Object.entries(byLevel).map(([key, l]) => {
    const [topicId, levelId] = key.split(':');
    const accuracy = l.ops > 0 ? Math.round((l.correct / l.ops) * 100) : 0;
    const avgMs = l.ops > 0 ? Math.round(l.ms / l.ops) : 0;
    return { topicId, levelId, ...l, accuracy, avgMs };
  }).sort((a, b) => a.accuracy - b.accuracy);

  // Total histórico desde KPIs
  const totalOpsAll = topicRows.reduce((s, r) => s + r.ops, 0);
  const totalCorrectAll = topicRows.reduce((s, r) => s + r.correct, 0);
  const totalErrorsAll = topicRows.reduce((s, r) => s + r.errors, 0);
  const totalMsAll = topicRows.reduce((s, r) => s + r.ms, 0);
  const accuracyAll = totalOpsAll > 0 ? Math.round((totalCorrectAll / totalOpsAll) * 100) : 0;

  // Fallos recientes (de las 50 sesiones)
  const recentErrors = [];
  for (const s of sessions) {
    for (const a of s.attempts || []) {
      if (!a.ok) {
        recentErrors.push({ ...a, sessionId: s.id, topicId: s.topicId, topicName: s.topicName });
      }
    }
  }
  recentErrors.sort((a, b) => b.at - a.at);
  const topErrors = recentErrors.slice(0, 30);

  cont.innerHTML = `
    <div class="bg-gradient-to-tr from-emerald-600 to-teal-600 rounded-3xl p-5 shadow-2xl border border-white/10 mt-1">
      <div class="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 class="text-base font-black text-white flex items-center gap-2">
            <i class="fa-solid fa-file-excel"></i> Exportar a Excel
          </h3>
          <p class="text-xs text-white/80 mt-0.5">Informe completo con 7 hojas: KPIs, sesiones, fallos y detalle.</p>
        </div>
        <button id="btn-export-xlsx" class="bg-white text-emerald-700 font-black px-4 py-2.5 rounded-xl text-sm shadow-lg transition hover:scale-[1.02] active:scale-95 flex items-center gap-2">
          <i class="fa-solid fa-download"></i> Descargar .xlsx
        </button>
      </div>
    </div>

    <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
      <div class="bg-slate-900 border border-slate-800 p-4 rounded-2xl">
        <span class="text-[10px] font-bold uppercase text-slate-400">Ops históricas</span>
        <div class="text-2xl font-black text-white mt-1">${totalOpsAll}</div>
      </div>
      <div class="bg-slate-900 border border-slate-800 p-4 rounded-2xl">
        <span class="text-[10px] font-bold uppercase text-slate-400">Precisión</span>
        <div class="text-2xl font-black text-emerald-400 mt-1">${accuracyAll}%</div>
      </div>
      <div class="bg-slate-900 border border-slate-800 p-4 rounded-2xl">
        <span class="text-[10px] font-bold uppercase text-slate-400">Fallos</span>
        <div class="text-2xl font-black text-rose-400 mt-1">${totalErrorsAll}</div>
      </div>
      <div class="bg-slate-900 border border-slate-800 p-4 rounded-2xl">
        <span class="text-[10px] font-bold uppercase text-slate-400">Tiempo total</span>
        <div class="text-2xl font-black text-amber-400 mt-1">${Math.round(totalMsAll / 60000)}min</div>
      </div>
    </div>

    <div class="bg-slate-900 border border-slate-800 rounded-3xl p-5 mt-5">
      <h3 class="text-sm font-bold text-white mb-3 flex items-center gap-2">
        <i class="fa-solid fa-layer-group text-indigo-400"></i> Rendimiento por tema (toda la historia)
      </h3>
      <div class="overflow-x-auto">
        <table class="w-full text-xs text-slate-300">
          <thead class="text-[10px] uppercase text-slate-500 border-b border-slate-800">
            <tr><th class="text-left py-2">Tema</th><th class="text-right">Ops</th><th class="text-right">Aciertos</th><th class="text-right">Fallos</th><th class="text-right">Precisión</th><th class="text-right">ms/op</th></tr>
          </thead>
          <tbody>
            ${topicRows.length === 0
              ? `<tr><td colspan="6" class="py-4 italic text-slate-500 text-center">Sin datos</td></tr>`
              : topicRows.map(r => `
                <tr class="border-b border-slate-800/50">
                  <td class="py-2 font-bold text-white">${r.topicId}</td>
                  <td class="text-right">${r.ops}</td>
                  <td class="text-right text-emerald-400">${r.correct}</td>
                  <td class="text-right text-rose-400">${r.errors}</td>
                  <td class="text-right font-bold ${r.accuracy < 50 ? 'text-rose-400' : r.accuracy > 80 ? 'text-emerald-400' : 'text-amber-400'}">${r.accuracy}%</td>
                  <td class="text-right text-slate-400">${r.avgMs}</td>
                </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <div class="bg-slate-900 border border-slate-800 rounded-3xl p-5 mt-5">
      <h3 class="text-sm font-bold text-white mb-3 flex items-center gap-2">
        <i class="fa-solid fa-ranking-star text-amber-400"></i> Niveles ordenados por precisión (peores primero)
      </h3>
      <div class="overflow-x-auto">
        <table class="w-full text-xs text-slate-300">
          <thead class="text-[10px] uppercase text-slate-500 border-b border-slate-800">
            <tr><th class="text-left py-2">Tema · Nivel</th><th class="text-right">Ops</th><th class="text-right">Precisión</th><th class="text-right">ms/op</th></tr>
          </thead>
          <tbody>
            ${levelRows.length === 0
              ? `<tr><td colspan="4" class="py-4 italic text-slate-500 text-center">Sin datos</td></tr>`
              : levelRows.map(r => `
                <tr class="border-b border-slate-800/50">
                  <td class="py-2"><span class="font-bold text-white">${r.topicId}</span> <span class="text-slate-500">·</span> ${r.levelId}</td>
                  <td class="text-right">${r.ops}</td>
                  <td class="text-right font-bold ${r.accuracy < 50 ? 'text-rose-400' : r.accuracy > 80 ? 'text-emerald-400' : 'text-amber-400'}">${r.accuracy}%</td>
                  <td class="text-right text-slate-400">${r.avgMs}</td>
                </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <div class="bg-slate-900 border border-slate-800 rounded-3xl p-5 mt-5">
      <h3 class="text-sm font-bold text-white mb-3 flex items-center gap-2">
        <i class="fa-solid fa-clock-rotate-left text-sky-400"></i> Últimas sesiones
      </h3>
      <div class="overflow-x-auto">
        <table class="w-full text-xs text-slate-300">
          <thead class="text-[10px] uppercase text-slate-500 border-b border-slate-800">
            <tr><th class="text-left py-2">Fecha</th><th class="text-left">Tema</th><th class="text-right">Duración</th><th class="text-right">Ops</th><th class="text-right">Precisión</th><th class="text-right">ms/op</th></tr>
          </thead>
          <tbody>
            ${sessions.length === 0
              ? `<tr><td colspan="6" class="py-4 italic text-slate-500 text-center">Sin sesiones registradas todavía</td></tr>`
              : sessions.slice().reverse().slice(0, 15).map(s => `
                <tr class="border-b border-slate-800/50">
                  <td class="py-2 text-slate-400">${formatDate(s.startedAt)}</td>
                  <td class="font-bold text-white">${s.topicName}</td>
                  <td class="text-right">${Math.round(s.activeSec / 60)}min</td>
                  <td class="text-right">${s.operations}</td>
                  <td class="text-right font-bold ${s.accuracy < 50 ? 'text-rose-400' : s.accuracy > 80 ? 'text-emerald-400' : 'text-amber-400'}">${s.accuracy}%</td>
                  <td class="text-right text-slate-400">${s.avgLatencyMs}</td>
                </tr>`).join('')}
          </tbody>
        </table>
      </div>
      ${sessions.length > 15 ? `<p class="text-[10px] text-slate-500 mt-2 italic">Mostrando las últimas 15 de ${sessions.length} sesiones guardadas. El Excel contiene todas.</p>` : ''}
    </div>

    <div class="bg-slate-900 border border-slate-800 rounded-3xl p-5 mt-5">
      <h3 class="text-sm font-bold text-white mb-3 flex items-center gap-2">
        <i class="fa-solid fa-list-ul text-rose-400"></i> Últimos fallos (${recentErrors.length} en las últimas 50 sesiones)
      </h3>
      <div class="overflow-x-auto">
        <table class="w-full text-xs text-slate-300">
          <thead class="text-[10px] uppercase text-slate-500 border-b border-slate-800">
            <tr><th class="text-left py-2">Fecha</th><th class="text-left">Tema · Nivel</th><th class="text-left">Pregunta</th><th class="text-right">Dado</th><th class="text-right">Correcto</th><th class="text-right">ms</th></tr>
          </thead>
          <tbody>
            ${topErrors.length === 0
              ? `<tr><td colspan="6" class="py-4 italic text-slate-500 text-center">Sin fallos registrados</td></tr>`
              : topErrors.map(e => `
                <tr class="border-b border-slate-800/50">
                  <td class="py-2 text-slate-400 whitespace-nowrap">${formatDate(e.at)}</td>
                  <td><span class="font-bold text-white">${e.topicName}</span><br><span class="text-slate-500 text-[10px]">${e.levelId}</span></td>
                  <td class="text-slate-300 max-w-xs">${escapeHtml(e.prompt)}</td>
                  <td class="text-right text-rose-400 font-bold">${escapeHtml(String(e.given))}</td>
                  <td class="text-right text-emerald-400 font-bold">${escapeHtml(String(e.answer))}</td>
                  <td class="text-right text-slate-400">${e.ms}</td>
                </tr>`).join('')}
          </tbody>
        </table>
      </div>
      ${recentErrors.length > 30 ? `<p class="text-[10px] text-slate-500 mt-2 italic">Mostrando 30 de ${recentErrors.length} fallos. El Excel contiene todos.</p>` : ''}
    </div>
  `;

  document.getElementById('btn-export-xlsx').addEventListener('click', () => exportXLSX(uid, prog));
}

// ============================================================
// PESTAÑA: CONFIGURACIÓN
// ============================================================
async function renderConfigTab(uid) {
  const cont = document.getElementById('p-tab-content');
  const prog = await loadProgress(uid);

  cont.innerHTML = `
    <div class="bg-slate-900 border border-slate-800 rounded-3xl p-5 mt-1">
      <h3 class="text-sm font-bold text-white mb-1 flex items-center gap-2">
        <i class="fa-solid fa-book text-indigo-400"></i> Temas y orden de práctica
      </h3>
      <p class="text-xs text-slate-400 mb-4">Marca qué temas aparecen en la pantalla del niño. Usa ↑↓ para reordenar. El engranaje configura los niveles.</p>
      <div id="p-topics-list" class="space-y-2"></div>
    </div>
  `;

  renderTopicsList(uid, prog);
}

function renderTopicsList(uid, prog) {
  const cont = document.getElementById('p-topics-list');
  cont.innerHTML = '';
  const plan = prog.plan || { order: [], topics: {} };

  const allTopicIds = Object.keys(ctx.topicsMap);
  let planChanged = false;
  for (const id of allTopicIds) {
    if (!plan.order.includes(id)) { plan.order.push(id); planChanged = true; }
    if (!plan.topics[id]) { plan.topics[id] = { enabled: false, activeLevels: null }; planChanged = true; }
  }
  prog.plan = plan;
  if (planChanged) saveProgress(uid, prog);

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

    row.querySelector('[data-toggle]').onclick = async () => {
      cfg.enabled = !cfg.enabled;
      saveProgress(uid, prog);
      await flushProgress(uid);
      renderTopicsList(uid, prog);
    };
    row.querySelector('[data-config]').onclick = () => openLevelsModal(uid, topicId, t, cfg);
    row.querySelector('[data-up]').onclick = async () => {
      if (index === 0) return;
      const arr = plan.order;
      [arr[index - 1], arr[index]] = [arr[index], arr[index - 1]];
      saveProgress(uid, prog);
      await flushProgress(uid);
      renderTopicsList(uid, prog);
    };
    row.querySelector('[data-down]').onclick = async () => {
      if (index === plan.order.length - 1) return;
      const arr = plan.order;
      [arr[index + 1], arr[index]] = [arr[index], arr[index + 1]];
      saveProgress(uid, prog);
      await flushProgress(uid);
      renderTopicsList(uid, prog);
    };

    cont.appendChild(row);
  });
}

// ============================================================
// MODAL NIVELES
// ============================================================
function openLevelsModal(uid, topicId, topic, cfg) {
  const modal = document.getElementById('levels-modal');
  const title = document.getElementById('levels-modal-title');
  const grid = document.getElementById('levels-grid');

  title.textContent = `${topic.nombre} — niveles`;

  const levels = topic.levels();
  const active = cfg.activeLevels || levels.map(l => l.id);

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
    await flushProgress(uid);
    modal.classList.add('hidden');
    renderConfigTab(uid);
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

// ============================================================
// TOP 5 ATASCADAS (Resumen)
// ============================================================
function renderBottlenecks(stats) {
  const cont = document.getElementById('p-bottlenecks');
  cont.innerHTML = '';
  const items = [];
  for (const [k, s] of Object.entries(stats)) {
    if (!s.attempts) continue;
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

// ============================================================
// AÑADIR HIJO
// ============================================================
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

// ============================================================
// EXPORTAR A EXCEL
// ============================================================
function exportXLSX(uid, prog) {
  if (!XLSX) {
    alert('La librería Excel no está cargada. Verifica js/lib/xlsx.full.min.js en el repo.');
    return;
  }

  const kpis = prog.kpis || { daily: {}, byTopic: {}, byLevel: {} };
  const sessions = prog.sessions || [];
  const stats = prog.stats || {};

  const wb = XLSX.utils.book_new();

  // -------- HOJA 1: RESUMEN --------
  const totalOpsAll = Object.values(kpis.byTopic || {}).reduce((s, t) => s + t.ops, 0);
  const totalCorrectAll = Object.values(kpis.byTopic || {}).reduce((s, t) => s + t.correct, 0);
  const totalErrorsAll = Object.values(kpis.byTopic || {}).reduce((s, t) => s + t.errors, 0);
  const totalMsAll = Object.values(kpis.byTopic || {}).
