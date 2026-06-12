/**
 * E2E auth test — run with:  npm run test:auth
 *
 * Boots the real server with the in-memory user store (MEMORY_DB=1) and
 * walks the entire flow: admin seed → admin creates the couple → first
 * sign-in password change + character setup → JWT-authenticated sockets →
 * authoritative join (server-side gender/name/outfit) → duplicate-login and
 * no-token rejections. Exits 0 on success, 1 on the first failure.
 */
process.env.MEMORY_DB = '1';
process.env.PORT = '3789';
process.env.JWT_SECRET = 'test-secret';
process.env.ADMIN_PASSWORD = 'admin1234';

const assert = (cond, label) => {
  if (!cond) { console.error('✗', label); process.exit(1); }
  console.log('✓', label);
};

async function api(path, { method = 'GET', token, body } = {}) {
  const res = await fetch('http://localhost:3789' + path, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

function connect(token) {
  const { io } = require('socket.io-client');
  return io('http://localhost:3789', token ? { auth: { token } } : {});
}

const once = (socket, event) => new Promise((r) => socket.once(event, r));

async function main() {
  require('../server.js');
  await new Promise((r) => setTimeout(r, 600)); // let it listen

  /* mode + admin seed */
  assert((await api('/api/auth/mode')).data.auth === true, 'auth mode is on');
  assert((await api('/api/auth/login', { method: 'POST', body: { username: 'admin', password: 'nope' } })).status === 401,
    'wrong password rejected');
  let r = await api('/api/auth/login', { method: 'POST', body: { username: 'admin', password: 'admin1234' } });
  assert(r.status === 200 && r.data.user.role === 'admin' && r.data.user.mustChangePassword === true,
    'seeded admin logs in with a temp password');
  let adminToken = r.data.token;

  /* admin first sign-in: change password */
  r = await api('/api/auth/change-password', {
    method: 'POST', token: adminToken,
    body: { currentPassword: 'admin1234', newPassword: 'supersafe1' },
  });
  assert(r.status === 200 && r.data.user.mustChangePassword === false, 'admin changed password');
  assert((await api('/api/auth/login', { method: 'POST', body: { username: 'admin', password: 'admin1234' } })).status === 401,
    'old admin password no longer works');

  /* admin creates the couple — username, password, gender */
  r = await api('/api/admin/users', {
    method: 'POST', token: adminToken,
    body: { username: 'romeo', password: 'temp123', gender: 'male' },
  });
  assert(r.status === 201 && r.data.user.gender === 'male', 'admin created him (male)');
  r = await api('/api/admin/users', {
    method: 'POST', token: adminToken,
    body: { username: 'juliet', password: 'temp456', gender: 'female', displayName: 'Jules' },
  });
  assert(r.status === 201 && r.data.user.gender === 'female', 'admin created her (female)');
  const julietId = r.data.user.id;
  assert((await api('/api/admin/users', {
    method: 'POST', token: adminToken, body: { username: 'x', password: 'temp123', gender: 'male' },
  })).status === 400, 'bad username rejected');

  /* player first sign-in: forced password change + character setup */
  r = await api('/api/auth/login', { method: 'POST', body: { username: 'romeo', password: 'temp123' } });
  assert(r.status === 200 && r.data.user.mustChangePassword === true, 'romeo logs in with temp password');
  let romeoToken = r.data.token;
  assert((await api('/api/admin/users', { token: romeoToken })).status === 403, 'player cannot use admin API');
  r = await api('/api/auth/change-password', {
    method: 'POST', token: romeoToken, body: { currentPassword: 'temp123', newPassword: 'romeolove' },
  });
  assert(r.status === 200, 'romeo set his own password');
  r = await api('/api/auth/profile', {
    method: 'POST', token: romeoToken, body: { displayName: 'Romie', outfit: 4 },
  });
  assert(r.status === 200 && r.data.user.firstLoginDone === true && r.data.user.outfit === 4,
    'romeo picked his character (name + outfit)');

  r = await api('/api/auth/login', { method: 'POST', body: { username: 'juliet', password: 'temp456' } });
  const julietToken = r.data.token;
  await api('/api/auth/change-password', {
    method: 'POST', token: julietToken, body: { currentPassword: 'temp456', newPassword: 'julietlove' },
  });
  await api('/api/auth/profile', { method: 'POST', token: julietToken, body: { outfit: 1 } });

  /* sockets: no token → rejected; with token → authoritative join */
  const anon = connect(null);
  const fail = await once(anon, 'auth_failed');
  assert(!!fail, 'socket without a token is rejected');
  anon.close();

  const s1 = connect(romeoToken);
  await once(s1, 'welcome');
  s1.emit('join', { role: 'female', name: 'Hacker', x: 0, z: 3 }); // lies about everything
  const j1 = await once(s1, 'joined');
  assert(j1.self.role === 'male' && j1.self.name === 'Romie' && j1.self.outfit === 4,
    'server enforces account gender, display name and saved outfit (client lies ignored)');

  const dup = connect(romeoToken);
  await once(dup, 'welcome');
  dup.emit('join', { x: 0, z: 3 });
  const denied = await once(dup, 'join_denied');
  assert(/already in the world/.test(denied.reason), 'same account cannot join twice');
  dup.close();

  const s2 = connect(julietToken);
  await once(s2, 'welcome');
  const partnerJoined = once(s1, 'player_joined');
  s2.emit('join', { x: 1, z: 3 });
  const j2 = await once(s2, 'joined');
  const seen = await partnerJoined;
  assert(j2.self.role === 'female' && j2.self.name === 'Jules' && j2.self.outfit === 1,
    'juliet joins as her account character');
  assert(seen.role === 'female' && seen.name === 'Jules', 'romeo sees juliet arrive');

  /* outfit changes persist to the account */
  s1.emit('outfit', 2);
  await new Promise((r2) => setTimeout(r2, 200));
  r = await api('/api/auth/me', { token: romeoToken });
  assert(r.data.user.outfit === 2, 'outfit change is saved to the account');

  s1.close(); s2.close();
  console.log('\nAUTH E2E PASSED');
  process.exit(0);
}

main().catch((e) => { console.error('✗ test crashed:', e); process.exit(1); });
