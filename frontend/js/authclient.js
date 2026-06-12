/**
 * Client-side auth flow. Runs before the game boots:
 *
 *   accounts off  → resolves null (legacy open mode, pick-a-character screen)
 *   accounts on   → sign-in screen → on FIRST sign-in: set your own password
 *                   and style your character (gender is set by your admin)
 *                 → resolves { token, profile }
 */
import { OUTFITS } from './avatar/outfits.js';

const $ = (id) => document.getElementById(id);
const TOKEN_KEY = 'cw_token';

async function jfetch(url, { method = 'GET', token, body } = {}) {
  const res = await fetch(url, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `request failed (${res.status})`);
  return data;
}

function loginScreen() {
  return new Promise((resolve) => {
    const screen = $('login-screen');
    screen.classList.remove('hidden');
    const err = $('login-error');
    const btn = $('login-btn');
    const submit = async () => {
      err.classList.add('hidden');
      btn.disabled = true;
      btn.textContent = 'Signing in…';
      try {
        const username = $('login-username').value.trim();
        const password = $('login-password').value;
        const d = await jfetch('/api/auth/login', { method: 'POST', body: { username, password } });
        localStorage.setItem(TOKEN_KEY, d.token);
        screen.classList.add('hidden');
        resolve({ token: d.token, user: d.user, loginPassword: password });
      } catch (e) {
        err.textContent = e.message;
        err.classList.remove('hidden');
        btn.disabled = false;
        btn.textContent = 'Sign in 🔐';
      }
    };
    btn.onclick = submit;
    for (const id of ['login-username', 'login-password']) {
      $(id).addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
    }
    $('login-username').focus();
  });
}

function renderOutfitPicker(gender, selected, onPick) {
  const grid = $('setup-outfits');
  grid.innerHTML = '';
  const hex = (c) => '#' + c.toString(16).padStart(6, '0');
  (OUTFITS[gender] || []).forEach((o, i) => {
    const card = document.createElement('div');
    card.className = 'outfit-card' + (i === selected ? ' selected' : '');
    card.innerHTML = `
      <div class="outfit-icon">${o.icon}</div>
      <div class="outfit-name">${o.name}</div>
      <div class="outfit-swatches">
        <span class="swatch" style="background:${hex(o.top)}"></span>
        <span class="swatch" style="background:${hex(o.bottom)}"></span>
        <span class="swatch" style="background:${hex(o.shoes)}"></span>
      </div>`;
    card.onclick = () => {
      grid.querySelectorAll('.outfit-card').forEach((c) => c.classList.remove('selected'));
      card.classList.add('selected');
      onPick(i);
    };
    grid.appendChild(card);
  });
}

function setupScreen(token, user, loginPassword) {
  return new Promise((resolve) => {
    const screen = $('setup-screen');
    screen.classList.remove('hidden');
    const err = $('setup-error');
    const needsPassword = user.mustChangePassword;
    $('setup-password-block').classList.toggle('hidden', !needsPassword);
    // a resumed session may need the old password again (e.g. admin reset)
    $('setup-current').classList.toggle('hidden', !needsPassword || !!loginPassword);
    $('setup-name').value = user.displayName || '';
    $('setup-sub').textContent = needsPassword
      ? 'First sign-in — set your own password and style your character 💞'
      : 'Style your character 💞';

    let outfit = user.outfit || 0;
    renderOutfitPicker(user.gender || 'male', outfit, (i) => { outfit = i; });

    $('setup-btn').onclick = async () => {
      err.classList.add('hidden');
      try {
        let updated = user;
        if (needsPassword) {
          const p1 = $('setup-pass1').value, p2 = $('setup-pass2').value;
          if (p1.length < 6) throw new Error('password must be at least 6 characters');
          if (p1 !== p2) throw new Error('passwords do not match');
          const current = loginPassword ?? $('setup-current').value;
          updated = (await jfetch('/api/auth/change-password', {
            method: 'POST', token, body: { currentPassword: current, newPassword: p1 },
          })).user;
        }
        updated = (await jfetch('/api/auth/profile', {
          method: 'POST', token,
          body: { displayName: $('setup-name').value.trim(), outfit },
        })).user;
        screen.classList.add('hidden');
        resolve(updated);
      } catch (e) {
        err.textContent = e.message;
        err.classList.remove('hidden');
      }
    };
  });
}

export async function runAuthFlow() {
  const mode = await jfetch('/api/auth/mode');
  if (!mode.auth) return null; // open mode — the classic select screen takes over

  $('select-screen').classList.add('hidden'); // your character comes from your account
  let token = localStorage.getItem(TOKEN_KEY);
  let user = null, loginPassword = null;

  if (token) {
    try {
      user = (await jfetch('/api/auth/me', { token })).user;
    } catch {
      localStorage.removeItem(TOKEN_KEY);
      token = null;
    }
  }
  if (!user) ({ token, user, loginPassword } = await loginScreen());

  // admins don't have an in-game character — their place is the dashboard
  if (user.role === 'admin') {
    location.href = '/admin';
    return new Promise(() => {}); // navigation takes over
  }

  if (user.mustChangePassword || !user.firstLoginDone) {
    user = await setupScreen(token, user, loginPassword);
  }
  return { token, profile: user };
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}
