import { db } from './firebase.js';
import { doc, getDoc, setDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

const cache = new Map();
const timers = new Map();

// Lee el progreso SIEMPRE desde Firestore (sin usar caché de memoria)
export async function loadProgress(uid) {
  const snap = await getDoc(doc(db, 'progress', uid));
  const data = snap.exists()
    ? snap.data()
    : { stats: {}, plan: { order: [], topics: {} } };
  if (!data.stats) data.stats = {};
  if (!data.plan) data.plan = { order: [], topics: {} };
  cache.set(uid, data);
  return data;
}

// Fuerza recargar desde Firestore la próxima vez
export async function reloadProgress(uid) {
  cache.delete(uid);
  return loadProgress(uid);
}

// Guarda con debounce (espera 1.5s desde el último cambio)
export function saveProgress(uid, data) {
  cache.set(uid, data);
  if (timers.has(uid)) clearTimeout(timers.get(uid));
  timers.set(uid, setTimeout(async () => {
    timers.delete(uid);
    try {
      await setDoc(doc(db, 'progress', uid), {
        stats: data.stats || {},
        plan: data.plan || { order: [], topics: {} },
        updatedAt: serverTimestamp()
      });
    } catch (e) {
      console.warn('No se pudo guardar en Firestore', e);
    }
  }, 1500));
}

// Guarda AHORA MISMO, sin esperar el debounce
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
      updatedAt: serverTimestamp()
    });
  } catch (e) {
    console.warn('No se pudo guardar en Firestore (flush)', e);
  }
}

export function invalidateCache(uid) { cache.delete(uid); }
