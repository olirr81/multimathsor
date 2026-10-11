import { listChildren, createChild, registerChildUnderParent } from '../auth.js';
import { loadProgress, saveProgress, invalidateCache } from '../storage.js';

export function initParentPanel({ getCurrentUser }) {
  document.getElementById('btn-parent-panel').addEventListener('click', () => {
    openParentPanel(getCurrentUser());
  });
  document.getElementById('add-child-cancel').addEventListener('click', () => {
    document.getElementById('add-child-modal').classList.add('hidden');
  });
  document.getElementById('modal-close').addEventListener('click', () => {
    document.getElementById('detail-modal').classList.add('hidden');
  });
  document.getElementById('add-child-form').addEventListener('submit', handleAddChild);
}

async function openParentPanel(user) {
  const sec = document.getElementById('section-PARENT');
  sec.classList.remove('hidden');
  document.querySelectorAll('section:not(#section-PARENT)').forEach(s => s.classList.add('hidden'));
  document.getElementById('game-hud').classList.add('hidden');

  const children = await listChildren(user.uid);
  const options = [
    { uid: user.uid, displayName: 'Yo (progenitor)', role: 'parent' },
    ...children
  ];

  sec.innerHTML = `
    <div class="bg-slate-900 border border-slate-800 rounded-3xl p-5 flex flex-col md:flex-row items-center justify-between gap-4">
      <div>
        <h2 class="text-xl font-bold text-white flex items-center gap-2">
          <i class="fa-solid fa-chart-line text-amber-400"></i> Panel de Padres
        </h2>
        <p class="text-xs text-slate-400 mt-0.5">Estadísticas, configuración y gestión de hijos.</p>
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
      <label class="text-[10px] font-bold uppercase text-slate-400 tracking-wider">Ver estadísticas de:</label>
      <select id="p-child-select" class="w-full mt-1 bg-slate-950 border border-slate-700 text-white text-sm font-bold rounded-xl px-3 py-2 outline-none">
        ${options.map(o => `<option value="${o.uid}">${o.displayName}${o.role === 'child' ? ' (hijo)' : ''}</option>`).join('')}
      </select>
    </div>

    <div id="p-stats-area" class="space-y-5"></div>
  `;

  document.getElementById('p-add-child').addEventListener('click', () => {
    document.getElementById('add-child-modal').classList.remove('hidden');
    document.getElementById('add-child-error').textContent = '';
  });
  document.getElementById('p-export').addEventListener('click', () => exportJSON(user));
  document.getElementById('p-import').addEventListener('click', () => importJSON(user));

  const sel = document.getElementById('p-child-select');
  sel.addEventListener('change', () => renderStats(user, sel.value));
  renderStats(user, sel.value);
}

async function handleAddChild(e) {
  e.preventDefault();
  const errEl = document.getElementById('add-child-error');
  errEl.textContent = '';
  const name = document.getElementById('child-name').value.trim();
  const user = document.getElementById('child-user').value.trim();
  const pass = document.getElementById('child-pass').value;

  const parentUid = window.__currentUid;
  try {
    const childUid = await createChild(parentUid, user, pass, name);
    await registerChildUnderParent(parentUid, childUid);
    document.getElementById('add-child-modal').classList.add('hidden');
    document.getElementById('add-child-form').reset();
    openParentPanel({ uid: parentUid });
  } catch (err) {
    errEl.textContent = err.code === 'auth/email-already-in-use'
      ? 'Ese usuario ya existe.'
      : (err.message || 'Error al crear la cuenta.');
  }
}

async function renderStats(parentUser, uid) {
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
      <h3 class="text-sm font-bold text-white mb-3 flex items-center gap-2">
        <i class="fa-solid fa-sliders text-indigo-400"></i> Tablas activas
      </h3>
      <div id="p-tables" class="flex flex-wrap gap-2"></div>
    </div>

    <div class="bg-slate-900 border border-slate-800 rounded-3xl p-5">
      <h3 class="text-sm font-bold text-white mb-1 flex items-center gap-2">
        <i class="fa-solid fa-fire text-amber-400"></i> Mapa de calor
      </h3>
      <p class="text-xs text-slate-400 mb-4">Toca cualquier celda para ver detalle.</p>
      <div class="overflow-x-auto">
        <div id="p-heatmap" class="grid grid-cols-10 gap-1.5 min-w-[320px]"></div>
      </div>
    </div>

    <div class="bg-slate-900 border border-slate-800 rounded-3xl p-5">
      <h3 class="text-sm font-bold text-white mb-3 flex items-center gap-2">
        <i class="fa-solid fa-triangle-exclamation text-rose-400"></i> Top 5 más atascadas
      </h3>
      <div id="p-bottlenecks" class="space-y-2"></div>
    </div>
  `;

  renderTableToggles(uid, prog);
  renderHeatmap(uid, prog);
  renderBottlenecks(prog);
}

function renderTableToggles(uid, prog) {
  const cont = document.getElementById('p-tables');
  cont.innerHTML = '';
  const active = prog.activeTables || [];
  for (let i = 1; i <= 10; i++) {
    const on = active.includes(i);
    const btn = document.createElement('button');
    btn.textContent = `Tabla ${i}`;
    btn.className = `px-3 py-1.5 rounded-xl text-xs font-bold transition ${
      on ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
         : 'bg-slate-950 text-slate-500 border border-slate-800'
    }`;
    btn.onclick = () => {
      if (active.includes(i)) {
        if (active.length > 1) prog.activeTables = active.filter(t => t !== i);
      } else {
        prog.activeTables = [...active, i].sort((a, b) => a - b);
      }
      saveProgress(uid, prog);
      renderTableToggles(uid, prog);
    };
    cont.appendChild(btn);
  }
}

function renderHeatmap(uid, prog) {
  const grid = document.getElementById('p-heatmap');
  grid.innerHTML = '';
  const stats = prog.stats || {};
  for (let i = 1; i <= 10; i++) {
    for (let j = 1; j <= 10; j++) {
      const s = stats[`${i}-${j}`] || { attempts: 0, correct: 0, errors: 0, totalFirstTouchMs: 0 };
      let cls = 'bg-slate-950 border-slate-800 text-slate-600';
      if (s.attempts > 0) {
        const avgL = (s.totalFirstTouchMs / s.attempts) / 1000;
        const errRate = s.errors / s.attempts;
        if (errRate > 0.3) cls = 'bg-rose-950/60 border-rose-800/60 text-rose-300';
        else if (avgL > 2.5) cls = 'bg-amber-950/60 border-amber-800/60 text-amber-300';
        else cls = 'bg-emerald-950/60 border-emerald-800/60 text-emerald-300';
      }
      const cell = document.createElement('div');
      cell.className = `aspect-square rounded-lg border flex items-center justify-center text-[10px] font-bold cursor-pointer transition hover:scale-110 ${cls}`;
      cell.textContent = `${i}×${j}`;
      cell.onclick = () => openOpModal(i, j, stats[`${i}-${j}`]);
      grid.appendChild(cell);
    }
  }
}

function renderBottlenecks(prog) {
  const cont = document.getElementById('p-bottlenecks');
  cont.innerHTML = '';
  const stats = prog.stats || {};
  const items = [];
  for (const [k, s] of Object.entries(stats)) {
    if (!s.attempts) continue;
    const [a, b] = k.split('-');
    const avgL = (s.totalFirstTouchMs / s.attempts) / 1000;
    items.push({ op: `${a} × ${b}`, errors: s.errors, latency: avgL.toFixed(1), score: s.errors * 25 + avgL });
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

function openOpModal(a, b, s) {
  if (!s) s = { attempts: 0, correct: 0, errors: 0, totalFirstTouchMs: 0 };
  const avg = s.attempts > 0 ? Math.round(s.totalFirstTouchMs / s.attempts) : 0;
  document.getElementById('modal-op-title').textContent = `${a} × ${b}`;
  document.getElementById('modal-op-attempts').textContent = s.attempts;
  document.getElementById('modal-op-correct').textContent = s.correct;
  document.getElementById('modal-op-errors').textContent = s.errors;
  document.getElementById('modal-op-latency').textContent = `${avg} ms`;
  let status = 'Por aprender';
  if (s.attempts > 0) {
    const errRate = s.errors / s.attempts;
    status = errRate > 0.3 ? 'Dificultad alta'
           : avg > 2500 ? 'Proceso lento'
           : 'Dominada';
  }
  document.getElementById('modal-op-status').textContent = status;
  document.getElementById('detail-modal').classList.remove('hidden');
}

async function exportJSON() {
  const sel = document.getElementById('p-child-select');
  const uid = sel.value;
  const prog = await loadProgress(uid);
  const blob = new Blob([JSON.stringify({ uid, progress: prog }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `multiflash_${uid.slice(0, 6)}_${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

async function importJSON() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json';
  input.onchange = async () => {
    const file = input.files[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      const sel = document.getElementById('p-child-select');
      const uid = sel.value;
      const prog = { stats: data.progress?.stats || {}, activeTables: data.progress?.activeTables || [1,2,3,4,5] };
      invalidateCache(uid);
      saveProgress(uid, prog);
      setTimeout(() => renderStats(null, uid), 2000);
      alert('Progreso importado. Se subirá a la nube en unos segundos.');
    } catch (e) {
      alert('JSON inválido.');
    }
  };
  input.click();
}