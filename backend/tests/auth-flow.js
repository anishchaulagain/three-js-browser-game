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
process.env.ADMIN_USERNAME = 'admin';
process.env.ADMIN_PASSWORD = 'admin1234';
process.env.MAX_PLAYERS = '3'; // routing tests use 3 players; default cap is 2

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

  // same account joins again → the NEW session takes over, the old is kicked
  const dup = connect(romeoToken);
  await once(dup, 'welcome');
  const oldKicked = once(s1, 'session_replaced');
  dup.emit('join', { x: 0, z: 3 });
  const dupJoined = await once(dup, 'joined');
  await oldKicked;
  assert(dupJoined.self.role === 'male' && dupJoined.self.name === 'Romie',
    'reconnecting replaces the old session (no ghost lockout)');
  s1.close();
  const s1b = dup; // romeo's live session from here on

  const s2 = connect(julietToken);
  await once(s2, 'welcome');
  const partnerJoined = once(s1b, 'player_joined');
  s2.emit('join', { x: 1, z: 3 });
  const j2 = await once(s2, 'joined');
  const seen = await partnerJoined;
  assert(j2.self.role === 'female' && j2.self.name === 'Jules' && j2.self.outfit === 1,
    'juliet joins as her account character');
  assert(seen.role === 'female' && seen.name === 'Jules', 'romeo sees juliet arrive');

  /* outfit changes persist to the account */
  s1b.emit('outfit', 2);
  await new Promise((r2) => setTimeout(r2, 200));
  r = await api('/api/auth/me', { token: romeoToken });
  assert(r.data.user.outfit === 2, 'outfit change is saved to the account');

  /* reconnect with a live ghost still works (newest session wins) */
  const s1c = connect(romeoToken);
  await once(s1c, 'welcome');
  s1c.emit('join', { x: 0, z: 3 });
  const rejoin = await once(s1c, 'joined');
  assert(rejoin.self.role === 'male', 'reconnect evicts your own ghost and enters');

  /* home-theater sync: state relays with a server timestamp */
  const theaterMsg = once(s2, 'theater');
  s1c.emit('theater', { v: 'dQw4w9WgXcQ', playing: true, t: 12 });
  const th = await theaterMsg;
  assert(th.v === 'dQw4w9WgXcQ' && th.playing === true && th.t === 12 && typeof th.at === 'number',
    'theater play state relays to the partner');
  s1c.emit('theater', { v: 'bad id!', playing: true, t: 0 });
  await new Promise((r2) => setTimeout(r2, 150)); // invalid ids are dropped server-side

  /* kitchen radio sync — its own channel, independent of the theater */
  const radioMsg = once(s2, 'radio');
  s1c.emit('radio', { v: 'kJQP7kiw5Fk', playing: true, t: 5 });
  const rad = await radioMsg;
  assert(rad.v === 'kJQP7kiw5Fk' && rad.playing === true && rad.t === 5,
    'kitchen radio state relays to the partner');

  /* shared web browsing relays too — and unsafe URLs are dropped */
  const webMsg = once(s2, 'theater');
  s1c.emit('theater', { mode: 'web', url: 'https://en.wikipedia.org/wiki/Love' });
  const web = await webMsg;
  assert(web.mode === 'web' && web.url === 'https://en.wikipedia.org/wiki/Love',
    'website state relays to the partner');
  let badWeb = false;
  s2.once('theater', () => { badWeb = true; });
  s1c.emit('theater', { mode: 'web', url: 'javascript:alert(1)' });
  await new Promise((r2) => setTimeout(r2, 200));
  assert(!badWeb, 'non-http(s) URLs are dropped server-side');
  // leave a movie as the final state for the late-joiner check below
  s1c.emit('theater', { v: 'dQw4w9WgXcQ', playing: true, t: 12 });
  await new Promise((r2) => setTimeout(r2, 150));

  /* ---- multiplayer: a THIRD account joins (two males may coexist) ---- */
  r = await api('/api/admin/users', {
    method: 'POST', token: adminToken,
    body: { username: 'paris', password: 'temp789', gender: 'male' },
  });
  assert(r.status === 201, 'admin created a third user (second male)');
  r = await api('/api/auth/login', { method: 'POST', body: { username: 'paris', password: 'temp789' } });
  const parisToken = r.data.token;
  await api('/api/auth/change-password', {
    method: 'POST', token: parisToken, body: { currentPassword: 'temp789', newPassword: 'parislove' },
  });

  const s3 = connect(parisToken);
  await once(s3, 'welcome');
  s3.emit('join', { x: 2, z: 3 });
  const j3 = await once(s3, 'joined');
  assert(j3.self.role === 'male' && j3.others.length === 2,
    'third player joins — same gender as romeo, sees 2 others');
  assert(j3.theaterState && j3.theaterState.v === 'dQw4w9WgXcQ',
    'late joiner receives the running movie state');
  assert(j3.radioState && j3.radioState.v === 'kJQP7kiw5Fk',
    'late joiner receives the running kitchen-music state');

  /* targeted E2E chat: juliet → romeo only; paris must NOT receive it */
  let parisGotChat = false;
  s3.on('chat', () => { parisGotChat = true; });
  const romeoChat = once(s1c, 'chat');
  s2.emit('chat', { to: rejoin.self.id, e: { n: 'bm9uY2U=', c: 'Y2lwaGVy' } });
  const chat = await romeoChat;
  await new Promise((r2) => setTimeout(r2, 250));
  assert(chat.name === 'Jules' && !parisGotChat, 'chat routes only to its recipient');

  /* targeted gift: paris → juliet only */
  let romeoGotGift = false;
  s1c.on('gift', () => { romeoGotGift = true; });
  const julietGift = once(s2, 'gift');
  s3.emit('gift', { to: j2.self.id, flower: 'rose' });
  const gift = await julietGift;
  await new Promise((r2) => setTimeout(r2, 250));
  assert(gift.flower === 'rose' && !romeoGotGift, 'gifts route only to their recipient');

  /* the cap holds: with the world full, a NEW account is turned away */
  r = await api('/api/admin/users', {
    method: 'POST', token: adminToken,
    body: { username: 'extra', password: 'temp000', gender: 'female' },
  });
  r = await api('/api/auth/login', { method: 'POST', body: { username: 'extra', password: 'temp000' } });
  const extra = connect(r.data.token);
  const outcome = await Promise.race([
    once(extra, 'world_full').then(() => 'turned_away'),
    new Promise((r2) => setTimeout(() => r2('timeout'), 3000)),
  ]);
  assert(outcome === 'turned_away', 'a new account beyond MAX_PLAYERS is turned away');
  extra.close();

  s1c.close(); s2.close(); s3.close();
  console.log('\nAUTH E2E PASSED');
  process.exit(0);
}

main().catch((e) => { console.error('✗ test crashed:', e); process.exit(1); });
