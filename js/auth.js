import { auth, db, getApp, deleteApp } from './firebase.js';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  getAuth,
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import {
  doc, getDoc, setDoc, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

const DOMAIN = 'multimathsor.local';

export function toEmail(username) {
  if (username.includes('@')) return username;
  return `${username.trim().toLowerCase()}@${DOMAIN}`;
}

export function onAuth(cb) { return onAuthStateChanged(auth, cb); }

export async function signIn(username, password) {
  const cred = await signInWithEmailAndPassword(auth, toEmail(username), password);
  return cred.user;
}

export async function signOutUser() { await signOut(auth); }

export async function loadProfile(uid) {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? snap.data() : null;
}

export async function signUpParent(username, password, displayName) {
  const cred = await createUserWithEmailAndPassword(auth, toEmail(username), password);
  await setDoc(doc(db, 'users', cred.user.uid), {
    role: 'parent',
    displayName,
    children: [],
    createdAt: serverTimestamp()
  });
  return cred.user;
}

// Crea la cuenta del hijo usando una app secundaria para no perder la sesión del padre
export async function createChild(parentUid, username, password, displayName) {
  const secondaryName = `child-${Date.now()}`;
  const tmpApp = initializeApp(auth.app.options, secondaryName);
  const tmpAuth = getAuth(tmpApp);
  try {
    const cred = await createUserWithEmailAndPassword(tmpAuth, toEmail(username), password);
    const childUid = cred.user.uid;
    await signOut(tmpAuth);

    await setDoc(doc(db, 'users', childUid), {
      role: 'child',
      displayName,
      parentUid,
      createdAt: serverTimestamp()
    });
    await setDoc(doc(db, 'progress', childUid), {
      stats: {},
      plan: { order: [], topics: {} },
      kpis: { daily: {}, byTopic: {}, byLevel: {} },
      sessions: [],
      updatedAt: serverTimestamp()
    });

    return childUid;
  } finally {
    await deleteApp(tmpApp);
  }
}

// Cambia la contraseña del usuario actual
export async function changeOwnPassword(currentPassword, newPassword) {
  const user = auth.currentUser;
  if (!user) throw new Error('No hay usuario autenticado.');
  const cred = EmailAuthProvider.credential(user.email, currentPassword);
  await reauthenticateWithCredential(user, cred);
  await updatePassword(user, newPassword);
  return true;
}

// Cambia la contraseña de un hijo (el padre debe conocer la actual)
export async function changeChildPassword(childUsername, currentPassword, newPassword) {
  const secondaryName = `pwd-${Date.now()}`;
  const tmpApp = initializeApp(auth.app.options, secondaryName);
  const tmpAuth = getAuth(tmpApp);
  try {
    const cred = await signInWithEmailAndPassword(tmpAuth, toEmail(childUsername), currentPassword);
    await updatePassword(cred.user, newPassword);
    await signOut(tmpAuth);
    return true;
  } finally {
    await deleteApp(tmpApp);
  }
}

export async function listChildren(parentUid) {
  const snap = await getDoc(doc(db, 'users', parentUid));
  const data = snap.exists() ? snap.data() : null;
  const ids = data?.children || [];
  const profiles = await Promise.all(ids.map(async (uid) => {
    const s = await getDoc(doc(db, 'users', uid));
    return s.exists() ? { uid, ...s.data() } : null;
  }));
  return profiles.filter(Boolean);
}

export async function registerChildUnderParent(parentUid, childUid) {
  const ref = doc(db, 'users', parentUid);
  const snap = await getDoc(ref);
  const current = snap.exists() ? (snap.data().children || []) : [];
  if (!current.includes(childUid)) {
    await setDoc(ref, { children: [...current, childUid] }, { merge: true });
  }
}
