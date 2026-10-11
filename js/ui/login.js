import { signIn, signUpParent, loadProfile } from '../auth.js';

export function initLogin({ onSuccess }) {
  const screen   = document.getElementById('screen-login');
  const form     = document.getElementById('login-form');
  const userIn   = document.getElementById('login-user');
  const passIn   = document.getElementById('login-pass');
  const errEl    = document.getElementById('login-error');
  const submit   = document.getElementById('login-submit');

  const setupWrap = document.getElementById('setup-link-wrap');
  const showBtn   = document.getElementById('show-signup');
  const signForm  = document.getElementById('signup-form');
  const signErr   = document.getElementById('signup-error');

  const urlSetup = new URLSearchParams(location.search).get('setup') === '1';
  if (urlSetup) setupWrap.classList.remove('hidden');

  showBtn?.addEventListener('click', () => {
    signForm.classList.toggle('hidden');
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errEl.textContent = '';
    submit.disabled = true;
    submit.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i>';
    try {
      const user = await signIn(userIn.value, passIn.value);
      const profile = await loadProfile(user.uid);
      if (!profile) {
        errEl.textContent = 'Cuenta sin configurar. Contacta con el administrador.';
        return;
      }
      onSuccess(user, profile);
    } catch (err) {
      errEl.textContent = traducirError(err.code);
    } finally {
      submit.disabled = false;
      submit.textContent = 'Entrar';
    }
  });

  signForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    signErr.textContent = '';
    const name = document.getElementById('signup-name').value.trim();
    const user = document.getElementById('signup-user').value.trim();
    const pass = document.getElementById('signup-pass').value;
    try {
      const u = await signUpParent(user, pass, name);
      const profile = await loadProfile(u.uid);
      onSuccess(u, profile);
    } catch (err) {
      signErr.textContent = traducirError(err.code);
    }
  });
}

export function showLogin() {
  document.getElementById('screen-login').classList.remove('hidden');
  document.getElementById('app-content').classList.add('hidden');
  document.getElementById('screen-loading').classList.add('hidden');
  document.getElementById('login-pass').value = '';
}

export function hideLogin() {
  document.getElementById('screen-login').classList.add('hidden');
}

export function showLoading() {
  document.getElementById('screen-loading').classList.remove('hidden');
}

export function hideLoading() {
  document.getElementById('screen-loading').classList.add('hidden');
}

function traducirError(code) {
  const map = {
    'auth/invalid-email': 'Usuario no válido.',
    'auth/user-not-found': 'Usuario no encontrado.',
    'auth/wrong-password': 'Contraseña incorrecta.',
    'auth/invalid-credential': 'Usuario o contraseña incorrectos.',
    'auth/email-already-in-use': 'Ese usuario ya existe.',
    'auth/weak-password': 'Contraseña demasiado corta (mín. 6).',
    'auth/too-many-requests': 'Demasiados intentos. Espera un momento.'
  };
  return map[code] || 'Error al iniciar sesión.';
}