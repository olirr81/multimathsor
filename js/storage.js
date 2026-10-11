import { db } from './firebase.js';
import { doc, getDoc, setDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

const cache = new Map();
const timers = new Map();

export async function loadProgress(uid) {
  if (cache.has(uid)) return cache.get(uid);
  const snap = await getDoc(doc(db, 'progress', uid));
  const data = snap.exists()
    ? snap.data()
    : { stats: {}, activeTables: [1, 2, 3, 4, 5] };
  cache.set(uid, data);
  return data;
}

export function saveProgress(uid, data) {
  cache.set(uid, data);
  if (timers.has(uid)) clearTimeout(timers.get(uid));
  timers.set(uid, setTimeout(async () => {
    timers.delete(uid);
    try {
      await setDoc(doc(db, 'progress', uid), {
        stats: data.stats,
        activeTables: data.activeTables,
        updatedAt: serverTimestamp()
      });
    } catch (e) {
      console.warn('No se pudo guardar en Firestore', e);
    }
  }, 1500));
}

export function invalidateCache(uid) { cache.delete(uid); }