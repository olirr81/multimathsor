import { initializeApp, getApp, deleteApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey: "AIzaSyD7ccrwPTB3nV_30bY6LsqBkTn5K-ypSl8",
  authDomain: "multimathsor.firebaseapp.com",
  projectId: "multimathsor",
  storageBucket: "multimathsor.firebasestorage.app",
  messagingSenderId: "969020324432",
  appId: "1:969020324432:web:69cf9032c4f29cfcf52f55"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export { getApp, deleteApp };