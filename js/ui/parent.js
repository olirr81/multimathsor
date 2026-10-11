import { listChildren, createChild, registerChildUnderParent } from '../auth.js';
import { loadProgress, saveProgress, invalidateCache, flushProgress } from '../storage.js';

let ctx = null;
let currentUserId = null;
let currentViewUid = null;
let currentTab = 'resumen';
let currentRange = 'todo'; // '7d' | '30d' | 'todo'

const XLSX = window.XLSX;

// ============================================================
// UMBRALES DE SEMÁFORO
// ============================================================
const RULES = {
  dominated:  { minAcc: 90, minOps: 10, label: 'Dominado',   icon: '🟢', color: 'emerald' },
  progress:   { minAcc: 60, minOps: 5,  label: 'En progreso', icon: '🟡', color: 'amber' },
  reinforce:  { minAcc: 0,  minOps: 5,  label: 'Reforzar',   icon: '🔴', color: 'rose' },
  nodata:     {                          label: 'Sin datos',   icon: '⚪', color: 'slate' }
};

function classify(ops, accuracy) {
  if (ops < RULES.reinforce.minOps) return 'nodata';
  if (accuracy >= RULES.dominated.minAcc && ops >= RULES.dominated.minOps) return 'dominated';
  if (accuracy >= RULES.progress.minAcc) return 'progress';
  return 'reinforce';
}

// ============================================================
// INIT
// ============================================================
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
    currentRange = 'todo';
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
  const sessions = prog.sessions || [];

  let totalOps = 0, totalCorrect = 0, totalLatSum = 0;
  for (const s of Object.values(stats)) {
    totalOps += s.attempts || 0;
    totalCorrect += s.correct || 0;
    totalLatSum += s.totalFirstTouchMs || 0;
  }
  const accuracy = totalOps > 0 ? Math.round((totalCorrect / totalOps) * 100) : 0;
  const avgLat = totalOps > 0 ? ((totalLatSum / totalOps) / 1000).toFixed(1) : '0.0';

  // Últimas 5 sesiones
  const recent = sessions.slice().reverse().slice(0, 5);

  cont.innerHTML = `
    <div class="bg-slate-900 border border-slate-800 rounded-3xl p-5 mt-1">
      <h3 class="text-sm font-bold text-white mb-3 flex items-center gap-2">
        <i class="fa-solid fa-clock-rotate-left text-sky-400"></i> Actividad reciente
      </h3>
      ${recent.length === 0
        ? `<p class="text-xs text-slate-500 italic">Todavía no hay sesiones registradas. Juega unas cuantas operaciones y vuelve aquí.</p>`
        : `<div class="space-y-2">
            ${recent.map(s => `
              <div class="flex items-center justify-between p-3 rounded-2xl bg-slate-950 border border-slate-800 text-xs">
                <div class="flex-1">
                  <div class="font-bold text-white text-sm">${s.topicName}</div>
                  <div class="text-slate-400 text-[10px]">${formatRelative(s.startedAt)} · ${Math.round(s.activeSec / 60)}min</div>
                </div>
                <div class="flex items-center gap-3">
                  <span class="text-slate-400">${s.operations} ops</span>
                  <span class="font-black ${s.accuracy < 50 ? 'text-rose-400' : s.accuracy > 80 ? 'text-emerald-400' : 'text-amber-400'}">${s.accuracy}%</span>
                </div>
              </div>
            `).join('')}
          </div>
          <div class="text-right mt-2">
            <button id="go-to-informe" class="text-[11px] text-indigo-400 hover:text-indigo-300 font-bold">
              Ver todas →
            </button>
          </div>`
      }
    </div>

    <div class="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-5">
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

  const gotoInforme = document.getElementById('go-to-informe');
  if (gotoInforme) {
    gotoInforme.onclick = () => {
      currentTab = 'informe';
      renderTab();
    };
  }
}

// ============================================================
// PESTAÑA: INFORME
// ============================================================
async function renderInformeTab(uid) {
  const cont = document.getElementById('p-tab-content');
  const prog = await loadProgress(uid);
  const sessions = prog.sessions || [];

  // 1. Filtrado por rango
  const filtered = filterSessions(sessions, currentRange);

  // 2. Recalcula KPIs por tema y nivel SOLO desde las sesiones filtradas
  const byTopic = {};
  const byLevel = {};
  const daily = {};
  let totalOpsAll = 0, totalCorrectAll = 0, totalErrorsAll = 0, totalMsAll = 0;

  for (const s of filtered) {
    // Por tema
    const t = byTopic[s.topicId] || { topicId: s.topicId, topicName: s.topicName, ops: 0, correct: 0, errors: 0, ms: 0 };
    t.ops += s.operations;
    t.correct += s.correct;
    t.errors += s.errors;
    t.ms += s.activeSec * 1000;
    byTopic[s.topicId] = t;

    // Por nivel
    for (const a of s.attempts || []) {
      const key = `${s.topicId}:${a.levelId}`;
      const l = byLevel[key] || { topicId: s.topicId, levelId: a.levelId, ops: 0, correct: 0, errors: 0, ms: 0 };
      l.ops += 1;
      if (a.ok) l.correct += 1; else l.errors += 1;
      l.ms += a.ms || 0;
      byLevel[key] = l;
    }

    // Diario
    const dayKey = new Date(s.startedAt).toISOString().slice(0, 10);
    const d = daily[dayKey] || { date: dayKey, ops: 0, correct: 0, errors: 0, ms: 0 };
    d.ops += s.operations;
    d.correct += s.correct;
    d.errors += s.errors;
    d.ms += s.activeSec * 1000;
    daily[dayKey] = d;

    totalOpsAll += s.operations;
    totalCorrectAll += s.correct;
    totalErrorsAll += s.errors;
    totalMsAll += s.activeSec * 1000;
  }

  const accuracyAll = totalOpsAll > 0 ? Math.round((totalCorrectAll / totalOpsAll) * 100) : 0;

  // 3. Construir filas de semáforo por nivel
  const levelRows = Object.values(byLevel).map(l => {
    const acc = l.ops > 0 ? Math.round((l.correct / l.ops) * 100) : 0;
    const avgMs = l.ops > 0 ? Math.round(l.ms / l.ops) : 0;
    const state = classify(l.ops, acc);
    return { ...l, accuracy: acc, avgMs, state };
  }).sort((a, b) => {
    const order = { reinforce: 0, progress: 1, nodata: 2, dominated: 3 };
    return (order[a.state] - order[b.state]) || (a.accuracy - b.accuracy);
  });

  // 4. Recomendaciones
  const toReinforce = levelRows.filter(r => r.state === 'reinforce').slice(0, 5);
  const toMaster   = levelRows.filter(r => r.state === 'dominated').slice(0, 3);

  // 5. KPIs por tema (para tabla)
  const topicRows = Object.values(byTopic).map(t => {
    const acc = t.ops > 0 ? Math.round((t.correct / t.ops) * 100) : 0;
    const avgMs = t.ops > 0 ? Math.round(t.ms / t.ops) : 0;
    return { ...t, accuracy: acc, avgMs };
  }).sort((a, b) => a.accuracy - b.accuracy);

  // 6. Fallos recientes (del rango filtrado)
  const recentErrors = [];
  for (const s of filtered) {
    for (const a of s.attempts || []) {
      if (!a.ok) recentErrors.push({ ...a, topicName: s.topicName });
    }
  }
  recentErrors.sort((a, b) => b.at - a.at);

  // 7. Rango: label
  const rangeLabels = { '7d': 'Últimos 7 días', '30d': 'Últimos 30 días', 'todo': 'Todo el histórico' };

  cont.innerHTML = `
    <!-- Rango -->
    <div class="bg-slate-900 border border-slate-800 rounded-2xl p-1.5 flex gap-1 mt-1">
      <button data-range="7d"   class="rtab flex-1 py-2 rounded-xl text-xs font-bold transition">7 días</button>
      <button data-range="30d"  class="rtab flex-1 py-2 rounded-xl text-xs font-bold transition">30 días</button>
      <button data-range="todo" class="rtab flex-1 py-2 rounded-xl text-xs font-bold transition">Todo</button>
    </div>

    <!-- Exportar -->
    <div class="bg-gradient-to-tr from-emerald-600 to-teal-600 rounded-3xl p-5 shadow-2xl border border-white/10 mt-5">
      <div class="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 class="text-base font-black text-white flex items-center gap-2">
            <i class="fa-solid fa-file-excel"></i> Exportar a Excel
          </h3>
          <p class="text-xs text-white/80 mt-0.5">Informe con 8 hojas. Respeta el rango: <strong>${rangeLabels[currentRange]}</strong>.</p>
        </div>
        <button id="btn-export-xlsx" class="bg-white text-emerald-700 font-black px-4 py-2.5 rounded-xl text-sm shadow-lg transition hover:scale-[1.02] active:scale-95 flex items-center gap-2">
          <i class="fa-solid fa-download"></i> Descargar .xlsx
        </button>
      </div>
    </div>

    <!-- KPIs globales del rango -->
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
      <div class="bg-slate-900 border border-slate-800 p-4 rounded-2xl">
        <span class="text-[10px] font-bold uppercase text-slate-400">Ops en el rango</span>
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
        <span class="text-[10px] font-bold uppercase text-slate-400">Tiempo activo</span>
        <div class="text-2xl font-black text-amber-400 mt-1">${Math.round(totalMsAll / 60000)}min</div>
      </div>
    </div>

    <!-- Recomendaciones -->
    <div class="bg-slate-900 border border-slate-800 rounded-3xl p-5 mt-5">
      <h3 class="text-sm font-bold text-white mb-3 flex items-center gap-2">
        <i class="fa-solid fa-lightbulb text-amber-400"></i> Recomendaciones
      </h3>
      ${levelRows.length === 0
        ? `<p class="text-xs text-slate-500 italic">Sin datos suficientes para recomendar.</p>`
        : `<div class="space-y-2">
            ${toReinforce.length === 0 && toMaster.length === 0
              ? `<p class="text-xs text-slate-400 italic">Nada destacable en el rango seleccionado.</p>`
              : ''}
            ${toReinforce.map(r => `
              <div class="flex items-center gap-3 p-3 rounded-2xl bg-rose-950/30 border border-rose-900/40">
                <span class="text-lg">🔴</span>
                <div class="text-xs">
                  <div class="font-bold text-rose-300">Reforzar <span class="text-white">${r.topicId} → ${r.levelId}</span></div>
                  <div class="text-slate-400">${r.accuracy}% de aciertos en ${r.ops} ops</div>
                </div>
              </div>
            `).join('')}
            ${toMaster.map(r => `
              <div class="flex items-center gap-3 p-3 rounded-2xl bg-emerald-950/30 border border-emerald-900/40">
                <span class="text-lg">🟢</span>
                <div class="text-xs">
                  <div class="font-bold text-emerald-300">Ya domina <span class="text-white">${r.topicId} → ${r.levelId}</span></div>
                  <div class="text-slate-400">${r.accuracy}% en ${r.ops} ops · puedes desmarcarlo para dar paso a lo difícil</div>
                </div>
              </div>
            `).join('')}
          </div>`}
    </div>

    <!-- Semáforo -->
    <div class="bg-slate-900 border border-slate-800 rounded-3xl p-5 mt-5">
      <h3 class="text-sm font-bold text-white mb-3 flex items-center gap-2">
        <i class="fa-solid fa-traffic-light text-indigo-400"></i> Semáforo por nivel
      </h3>
      <div class="bg-slate-950 border border-slate-800 rounded-2xl p-3 mb-4 text-[11px] text-slate-300 grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div>🟢 <strong>Dominado</strong> · ≥90% y ≥10 ops</div>
        <div>🟡 <strong>En progreso</strong> · 60–90%</div>
        <div>🔴 <strong>Reforzar</strong> · <60% con ≥5 ops</div>
        <div>⚪ <strong>Sin datos</strong> · <5 ops</div>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-xs text-slate-300">
          <thead class="text-[10px] uppercase text-slate-500 border-b border-slate-800">
            <tr><th class="text-left py-2">Tema · Nivel</th><th class="text-right">Ops</th><th class="text-right">Precisión</th><th class="text-right">ms/op</th><th class="text-left pl-3">Estado</th></tr>
          </thead>
          <tbody>
            ${levelRows.length === 0
              ? `<tr><td colspan="5" class="py-4 italic text-slate-500 text-center">Sin datos en el rango seleccionado</td></tr>`
              : levelRows.map(r => `
                <tr class="border-b border-slate-800/50">
                  <td class="py-2"><span class="font-bold text-white">${r.topicId}</span> <span class="text-slate-500">·</span> ${r.levelId}</td>
                  <td class="text-right">${r.ops}</td>
                  <td class="text-right font-bold ${r.accuracy < 50 ? 'text-rose-400' : r.accuracy > 80 ? 'text-emerald-400' : 'text-amber-400'}">${r.accuracy}%</td>
                  <td class="text-right text-slate-400">${r.avgMs}</td>
                  <td class="pl-3">${RULES[r.state].icon} <span class="text-slate-300">${RULES[r.state].label}</span></td>
                </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Por tema -->
    <div class="bg-slate-900 border border-slate-800 rounded-3xl p-5 mt-5">
      <h3 class="text-sm font-bold text-white mb-3 flex items-center gap-2">
        <i class="fa-solid fa-layer-group text-indigo-400"></i> Rendimiento por tema
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
                  <td class="py-2 font-bold text-white">${r.topicName}</td>
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

    <!-- Sesiones -->
    <div class="bg-slate-900 border border-slate-800 rounded-3xl p-5 mt-5">
      <h3 class="text-sm font-bold text-white mb-3 flex items-center gap-2">
        <i class="fa-solid fa-clock-rotate-left text-sky-400"></i> Sesiones en el rango (${filtered.length})
      </h3>
      <div class="overflow-x-auto">
        <table class="w-full text-xs text-slate-300">
          <thead class="text-[10px] uppercase text-slate-500 border-b border-slate-800">
            <tr><th class="text-left py-2">Fecha</th><th class="text-left">Tema</th><th class="text-right">Duración</th><th class="text-right">Ops</th><th class="text-right">Precisión</th><th class="text-right">ms/op</th></tr>
          </thead>
          <tbody>
            ${filtered.length === 0
              ? `<tr><td colspan="6" class="py-4 italic text-slate-500 text-center">Sin sesiones en este rango</td></tr>`
              : filtered.slice().reverse().slice(0, 15).map(s => `
                <tr class="border-b border-slate-800/50">
                  <td class="py-2 text-slate-400">${formatRelative(s.startedAt)}</td>
                  <td class="font-bold text-white">${s.topicName}</td>
                  <td class="text-right">${Math.round(s.activeSec / 60)}min</td>
                  <td class="text-right">${s.operations}</td>
                  <td class="text-right font-bold ${s.accuracy < 50 ? 'text-rose-400' : s.accuracy > 80 ? 'text-emerald-400' : 'text-amber-400'}">${s.accuracy}%</td>
                  <td class="text-right text-slate-400">${s.avgLatencyMs}</td>
                </tr>`).join('')}
          </tbody>
        </table>
      </div>
      ${filtered.length > 15 ? `<p class="text-[10px] text-slate-500 mt-2 italic">Mostrando 15 de ${filtered.length}. El Excel contiene todas.</p>` : ''}
    </div>

    <!-- Fallos -->
    <div class="bg-slate-900 border border-slate-800 rounded-3xl p-5 mt-5">
      <h3 class="text-sm font-bold text-white mb-3 flex items-center gap-2">
        <i class="fa-solid fa-list-ul text-rose-400"></i> Fallos en el rango (${recentErrors.length})
      </h3>
      <div class="overflow-x-auto">
        <table class="w-full text-xs text-slate-300">
          <thead class="text-[10px] uppercase text-slate-500 border-b border-slate-800">
            <tr><th class="text-left py-2">Fecha</th><th class="text-left">Tema · Nivel</th><th class="text-left">Pregunta</th><th class="text-right">Dado</th><th class="text-right">Correcto</th><th class="text-right">ms</th></tr>
          </thead>
          <tbody>
            ${recentErrors.length === 0
              ? `<tr><td colspan="6" class="py-4 italic text-slate-500 text-center">Sin fallos en el rango</td></tr>`
              : recentErrors.slice(0, 30).map(e => `
                <tr class="border-b border-slate-800/50">
                  <td class="py-2 text-slate-400 whitespace-nowrap">${formatRelative(e.at)}</td>
                  <td>${e.topicName}<br><span class="text-slate-500 text-[10px]">${e.levelId}</span></td>
                  <td class="text-slate-300 max-w-xs">${escapeHtml(e.prompt)}</td>
                  <td class="text-right text-rose-400 font-bold">${escapeHtml(String(e.given))}</td>
                  <td class="text-right text-emerald-400 font-bold">${escapeHtml(String(e.answer))}</td>
                  <td class="text-right text-slate-400">${e.ms}</td>
                </tr>`).join('')}
          </tbody>
        </table>
      </div>
      ${recentErrors.length > 30 ? `<p class="text-[10px] text-slate-500 mt-2 italic">Mostrando 30 de ${recentErrors.length}. El Excel contiene todos.</p>` : ''}
    </div>
  `;

  // Botones de rango
  document.querySelectorAll('.rtab').forEach(b => {
    const on = b.dataset.range === currentRange;
    b.className = `rtab flex-1 py-2 rounded-xl text-xs font-bold transition ${
      on ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
         : 'text-slate-400 hover:text-white hover:bg-slate-800'
    }`;
    b.addEventListener('click', () => {
      currentRange = b.dataset.range;
      renderInformeTab(uid);
    });
  });

  // Export
  document.getElementById('btn-export-xlsx').addEventListener('click', () => {
    exportXLSX(uid, prog, filtered, { topicRows, levelRows, dailyRows: Object.values(daily), recentErrors });
  });
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
    if (selected.length === 0) { alert('Marca al menos un nivel.'); return; }
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
// UTILIDADES
// ============================================================
function filterSessions(sessions, range) {
  if (range === 'todo') return sessions;
  const days = range === '7d' ? 7 : 30;
  const limit = Date.now() - days * 24 * 3600 * 1000;
  return sessions.filter(s => s.endedAt >= limit);
}

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

function formatRelative(ms) {
  const d = new Date(ms);
  const now = new Date();
  const dayDiff = Math.floor((startOfDay(now) - startOfDay(d)) / (24 * 3600 * 1000));
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  if (dayDiff === 0) return `Hoy ${hh}:${mm}`;
  if (dayDiff === 1) return `Ayer ${hh}:${mm}`;
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${day}/${month} ${hh}:${mm}`;
}

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function escapeHtml(s) {
  if (s === undefined || s === null) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

// ============================================================
// EXPORTAR A EXCEL
// ============================================================
function exportXLSX(uid, prog, filteredSessions, computed) {
  if (!XLSX) {
    alert('La librería Excel no está cargada. Verifica js/lib/xlsx.full.min.js en el repo.');
    return;
  }

  const { topicRows, levelRows, dailyRows, recentErrors } = computed;
  const wb = XLSX.utils.book_new();

  // Totales
  const totalOpsAll = topicRows.reduce((s, t) => s + t.ops, 0);
  const totalCorrectAll = topicRows.reduce((s, t) => s + t.correct, 0);
  const totalErrorsAll = topicRows.reduce((s, t) => s + t.errors, 0);
  const totalMsAll = topicRows.reduce((s, t) => s + t.ms, 0);
  const accuracyAll = totalOpsAll > 0 ? Math.round((totalCorrectAll / totalOpsAll) * 100) : 0;
  const rangeLabels = { '7d': 'Últimos 7 días', '30d': 'Últimos 30 días', 'todo': 'Todo el histórico' };

  // Hoja 1: Resumen
  const resumenRows = [
    { Métrica: 'Rango', Valor: rangeLabels[currentRange] },
    { Métrica: 'Total operaciones', Valor: totalOpsAll },
    { Métrica: 'Aciertos', Valor: totalCorrectAll },
    { Métrica: 'Fallos', Valor: totalErrorsAll },
    { Métrica: 'Precisión %', Valor: accuracyAll },
    { Métrica: 'Tiempo activo (min)', Valor: Math.round(totalMsAll / 60000) },
    { Métrica: 'Sesiones guardadas en el rango', Valor: filteredSessions.length },
    { Métrica: 'Fecha de exportación', Valor: new Date().toLocaleString('es-ES') }
  ];
  const wsResumen = XLSX.utils.json_to_sheet(resumenRows);
  wsResumen['!cols'] = [{ wch: 32 }, { wch: 24 }];
  XLSX.utils.book_append_sheet(wb, wsResumen, 'Resumen');

  // Hoja 2: Semáforo
  const semaforoRows = levelRows.map(r => ({
    Tema: r.topicId,
    Nivel: r.levelId,
    Operaciones: r.ops,
    Aciertos: r.correct,
    Fallos: r.errors,
    'Precisión %': r.accuracy,
    'ms/op': r.avgMs,
    Estado: RULES[r.state].icon + ' ' + RULES[r.state].label
  }));
  if (semaforoRows.length === 0) semaforoRows.push({ Tema: '(sin datos)' });
  const wsSemaforo = XLSX.utils.json_to_sheet(semaforoRows);
  wsSemaforo['!cols'] = [{ wch: 14 }, { wch: 18 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 10 }, { wch: 18 }];
  XLSX.utils.book_append_sheet(wb, wsSemaforo, 'Semáforo');

  // Hoja 3: Por tema
  const topicSheetRows = topicRows.map(t => ({
    Tema: t.topicName,
    Operaciones: t.ops,
    Aciertos: t.correct,
    Fallos: t.errors,
    'Precisión %': t.accuracy,
    'Tiempo activo (s)': Math.round(t.ms / 1000),
    'ms/op': t.avgMs
  }));
  if (topicSheetRows.length === 0) topicSheetRows.push({ Tema: '(sin datos)' });
  const wsTopics = XLSX.utils.json_to_sheet(topicSheetRows);
  wsTopics['!cols'] = [{ wch: 14 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 16 }, { wch: 10 }];
  XLSX.utils.book_append_sheet(wb, wsTopics, 'Por tema');

  // Hoja 4: Por nivel
  const levelSheetRows = levelRows.map(r => ({
    Tema: r.topicId,
    Nivel: r.levelId,
    Operaciones: r.ops,
    Aciertos: r.correct,
    Fallos: r.errors,
    'Precisión %': r.accuracy,
    'ms/op': r.avgMs
  }));
  if (levelSheetRows.length === 0) levelSheetRows.push({ Tema: '(sin datos)' });
  const wsLevels = XLSX.utils.json_to_sheet(levelSheetRows);
  wsLevels['!cols'] = [{ wch: 14 }, { wch: 16 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 10 }];
  XLSX.utils.book_append_sheet(wb, wsLevels, 'Por nivel');

  // Hoja 5: Evolución diaria
  const dailySheetRows = dailyRows.map(d => ({
    Fecha: d.date,
    Operaciones: d.ops,
    Aciertos: d.correct,
    Fallos: d.errors,
    'Precisión %': d.ops > 0 ? Math.round((d.correct / d.ops) * 100) : 0,
    'Tiempo activo (min)': Math.round(d.ms / 60000)
  })).sort((a, b) => a.Fecha.localeCompare(b.Fecha));
  if (dailySheetRows.length === 0) dailySheetRows.push({ Fecha: '(sin datos)' });
  const wsDaily = XLSX.utils.json_to_sheet(dailySheetRows);
  wsDaily['!cols'] = [{ wch: 14 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 18 }];
  XLSX.utils.book_append_sheet(wb, wsDaily, 'Evolución diaria');

  // Hoja 6: Sesiones
  const sessionRows = filteredSessions.map(s => ({
    ID: s.id,
    Fecha: new Date(s.startedAt).toLocaleString('es-ES'),
    Tema: s.topicName,
    'Duración total (s)': s.durationSec,
    'Duración activa (s)': s.activeSec,
    Operaciones: s.operations,
    Aciertos: s.correct,
    Fallos: s.errors,
    'Precisión %': s.accuracy,
    'ms/op': s.avgLatencyMs,
    Modos: (s.modes || []).join(',')
  }));
  if (sessionRows.length === 0) sessionRows.push({ ID: '(sin sesiones)' });
  const wsSessions = XLSX.utils.json_to_sheet(sessionRows);
  wsSessions['!cols'] = [{ wch: 20 }, { wch: 22 }, { wch: 14 }, { wch: 16 }, { wch: 16 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 10 }, { wch: 10 }];
  XLSX.utils.book_append_sheet(wb, wsSessions, 'Sesiones');

  // Hoja 7: Detalle ops
  const attemptRows = [];
  for (const s of filteredSessions) {
    for (const a of s.attempts || []) {
      attemptRows.push({
        Fecha: new Date(a.at).toLocaleString('es-ES'),
        Tema: s.topicName,
        Nivel: a.levelId,
        Pregunta: a.prompt,
        'Respuesta dada': a.given,
        'Respuesta correcta': a.answer,
        '¿Acertó?': a.ok ? 'Sí' : 'No',
        'Tiempo (ms)': a.ms,
        Modo: a.mode
      });
    }
  }
  if (attemptRows.length === 0) attemptRows.push({ Fecha: '(sin detalle)' });
  const wsAttempts = XLSX.utils.json_to_sheet(attemptRows);
  wsAttempts['!cols'] = [{ wch: 22 }, { wch: 14 }, { wch: 18 }, { wch: 40 }, { wch: 16 }, { wch: 20 }, { wch: 10 }, { wch: 12 }, { wch: 8 }];
  XLSX.utils.book_append_sheet(wb, wsAttempts, 'Detalle ops');

  // Hoja 8: Fallos
  const fallosRows = attemptRows.filter(r => r['¿Acertó?'] === 'No');
  if (fallosRows.length === 0) fallosRows.push({ Fecha: '(sin fallos)' });
  const wsFallos = XLSX.utils.json_to_sheet(fallosRows);
  wsFallos['!cols'] = [{ wch: 22 }, { wch: 14 }, { wch: 18 }, { wch: 40 }, { wch: 16 }, { wch: 20 }, { wch: 10 }, { wch: 12 }, { wch: 8 }];
  XLSX.utils.book_append_sheet(wb, wsFallos, 'Fallos');

  const displayName = (currentViewUid === currentUserId) ? 'progenitor' : 'hijo';
  const date = new Date().toISOString().slice(0, 10);
  const rangeTag = currentRange === 'todo' ? 'completo' : currentRange;
  XLSX.writeFile(wb, `MultiFlash_${displayName}_${date}_${rangeTag}.xlsx`);
}
