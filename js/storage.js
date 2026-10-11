import { db } from './firebase.js';
import { doc, getDoc, setDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

const cache = new Map();
const timers = new Map();

const MAX_SESSIONS = 50;

// ============ CARGA ============
export async function loadProgress(uid) {
  const snap = await getDoc(doc(db, 'progress', uid));
  let data = snap.exists() ? snap.data() : {};
  data = normalizeProgress(data);
  cache.set(uid, data);
  return data;
}

export async function reloadProgress(uid) {
  cache.delete(uid);
  return loadProgress(uid);
}

// Asegura que el documento tiene todas las secciones esperadas
function normalizeProgress(data) {
  if (!data.stats) data.stats = {};
  if (!data.plan) data.plan = { order: [], topics: {} };
  if (!data.kpis) data.kpis = {};
  if (!data.kpis.daily) data.kpis.daily = {};
  if (!data.kpis.byTopic) data.kpis.byTopic = {};
  if (!data.kpis.byLevel) data.kpis.byLevel = {};
  if (!Array.isArray(data.sessions)) data.sessions = [];
  return data;
}

// ============ GUARDADO ============
export function saveProgress(uid, data) {
  cache.set(uid, data);
  if (timers.has(uid)) clearTimeout(timers.get(uid));
  timers.set(uid, setTimeout(async () => {
    timers.delete(uid);
    try {
      await setDoc(doc(db, 'progress', uid), {
        stats: data.stats || {},
        plan: data.plan || { order: [], topics: {} },
        kpis: data.kpis || { daily: {}, byTopic: {}, byLevel: {} },
        sessions: data.sessions || [],
        updatedAt: serverTimestamp()
      });
    } catch (e) {
      console.warn('No se pudo guardar en Firestore', e);
    }
  }, 1500));
}

export async function flushProgress(uid) {
  const data = cache.get(uid);
  if (!data) return;
  if (timers.has(uid)) {
    clearTimeout(timers.get(uid));
    timers.delete(uid);
  }
  try {
    await setDoc(doc(db, 'progress', uid), {
      stats: data.stats || {},
      plan: data.plan || { order: [], topics: {} },
      kpis: data.kpis || { daily: {}, byTopic: {}, byLevel: {} },
      sessions: data.sessions || [],
      updatedAt: serverTimestamp()
    });
  } catch (e) {
    console.warn('No se pudo guardar en Firestore (flush)', e);
  }
}

export function invalidateCache(uid) { cache.delete(uid); }

// ============ SESIONES ============
// Añade una sesión al progreso y rota si excede MAX_SESSIONS.
// También actualiza los KPIs históricos (daily, byTopic, byLevel).
export function commitSession(progress, session) {
  if (!session || session.operations < 1) return progress;

  // 1. Añadir a la lista de sesiones
  if (!Array.isArray(progress.sessions)) progress.sessions = [];
  progress.sessions.push(session);

  // 2. Rotar (mantener las últimas MAX_SESSIONS)
  if (progress.sessions.length > MAX_SESSIONS) {
    progress.sessions = progress.sessions.slice(-MAX_SESSIONS);
  }

  // 3. Actualizar KPIs
  if (!progress.kpis) progress.kpis = { daily: {}, byTopic: {}, byLevel: {} };
  if (!progress.kpis.daily) progress.kpis.daily = {};
  if (!progress.kpis.byTopic) progress.kpis.byTopic = {};
  if (!progress.kpis.byLevel) progress.kpis.byLevel = {};

  // Daily
  const dayKey = dayStamp(session.startedAt);
  const day = progress.kpis.daily[dayKey] || { ops: 0, correct: 0, errors: 0, ms: 0 };
  day.ops += session.operations;
  day.correct += session.correct;
  day.errors += session.errors;
  day.ms += session.activeSec * 1000;
  progress.kpis.daily[dayKey] = day;

  // byTopic
  const topic = progress.kpis.byTopic[session.topicId] || { ops: 0, correct: 0, errors: 0, ms: 0 };
  topic.ops += session.operations;
  topic.correct += session.correct;
  topic.errors += session.errors;
  topic.ms += session.activeSec * 1000;
  progress.kpis.byTopic[session.topicId] = topic;

  // byLevel (a partir de los attempts de la sesión)
  for (const att of session.attempts || []) {
    const key = `${session.topicId}:${att.levelId}`;
    const lvl = progress.kpis.byLevel[key] || { ops: 0, correct: 0, errors: 0, ms: 0 };
    lvl.ops += 1;
    if (att.ok) lvl.correct += 1; else lvl.errors += 1;
    lvl.ms += att.ms || 0;
    progress.kpis.byLevel[key] = lvl;
  }

  return progress;
}

function dayStamp(ms) {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
