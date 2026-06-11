/**
 * Functional test of the socket layer (run with the server already up):
 * two players join (with role-conflict resolution), chat/outfit relay works,
 * and a third connection is rejected.
 *
 *   npm run test:net
 */
const { io } = require('socket.io-client');
const URL = process.env.GAME_URL || 'http://localhost:3000';

let failures = 0;
function expect(label, cond) {
  console.log(`${cond ? '✔' : '✘'} ${label}`);
  if (!cond) failures++;
}

function client(label) {
  const s = io(URL, { transports: ['websocket'] });
  s.events = {};
  for (const ev of ['welcome', 'joined', 'player_joined', 'world_full', 'chat', 'outfit', 'roles']) {
    s.on(ev, (d) => { (s.events[ev] = s.events[ev] || []).push(d); });
  }
  s.label = label;
  return s;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const a = client('A');
  await new Promise((r) => a.on('welcome', r));
  a.emit('join', { role: 'male', name: 'Alex', x: -1.2, z: 3 });

  const b = client('B');
  await new Promise((r) => b.on('welcome', r));
  b.emit('join', { role: 'male', name: 'Mia', x: 1.2, z: 3 }); // also asks for male

  await sleep(400);
  expect('A joined as male', a.events.joined?.[0]?.self.role === 'male');
  expect('B was handed female (conflict resolved)', b.events.joined?.[0]?.self.role === 'female');
  expect('A saw B join', a.events.player_joined?.[0]?.name === 'Mia');

  a.emit('chat', 'hi love');
  a.emit('outfit', 3);
  await sleep(300);
  expect('chat relayed to both', a.events.chat?.length === 1 && b.events.chat?.length === 1);
  expect('outfit change relayed to B', b.events.outfit?.[0]?.outfit === 3);

  const c = client('C');
  await sleep(600);
  expect('third wheel rejected (world_full)', (c.events.world_full || []).length === 1);

  a.disconnect(); b.disconnect(); c.disconnect();
  console.log(failures ? `\n${failures} FAILURE(S)` : '\nall good 💕');
  process.exit(failures ? 1 : 0);
})();
