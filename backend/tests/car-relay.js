/* Fast socket-level check (no browser): driver's car_state reaches the partner. */
const { io } = require('socket.io-client');
const URL = process.env.GAME_URL || 'http://localhost:3000';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const expect = (label, cond) => { console.log(`${cond ? '✔' : '✘'} ${label}`); if (!cond) failures++; };

(async () => {
  const a = io(URL, { transports: ['websocket'] });
  await new Promise((r) => a.on('welcome', r));
  a.emit('join', { role: 'male', name: 'A' });
  await new Promise((r) => a.on('joined', r));

  const b = io(URL, { transports: ['websocket'] });
  const bCar = [];
  let bJoinedPayload = null;
  b.on('car_state', (s) => bCar.push(s));
  await new Promise((r) => b.on('welcome', r));
  b.emit('join', { role: 'female', name: 'B' });
  await new Promise((r) => b.on('joined', (d) => { bJoinedPayload = d; r(); }));

  // A takes the wheel and drives
  a.emit('car_seat', 'driver');
  await sleep(150);
  for (let i = 1; i <= 5; i++) {
    a.emit('car_state', { x: 9 + i * 2, z: -15 + i, ry: 0.2, v: 8 });
    await sleep(80);
  }
  await sleep(300);

  expect(`B received live car updates (${bCar.length} of 5)`, bCar.length === 5);
  expect(`last position correct (x=${bCar.at(-1)?.x})`, bCar.at(-1)?.x === 19);

  // a late joiner would find the car where it was left
  a.disconnect(); b.disconnect();
  await sleep(200);
  const c = io(URL, { transports: ['websocket'] });
  await new Promise((r) => c.on('welcome', r));
  c.emit('join', { role: 'male', name: 'C' });
  const cJoined = await new Promise((r) => c.on('joined', r));
  expect(`late joiner gets parked car position (x=${cJoined.carState?.x})`, cJoined.carState?.x === 19);
  c.disconnect();

  console.log(failures ? `\n${failures} FAILURE(S)` : '\nall good 💕 (both slots freed)');
  process.exit(failures ? 1 : 0);
})();
