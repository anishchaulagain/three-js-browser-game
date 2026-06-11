/* Quick check: the server advertises the configured day length. */
const { io } = require('socket.io-client');
const { DAY_LENGTH_MS } = require('../src/config');

const s = io(process.env.GAME_URL || 'http://localhost:3000', { transports: ['websocket'] });
s.on('welcome', (d) => {
  const ok = d.dayLength === DAY_LENGTH_MS;
  console.log(`${ok ? '✔' : '✘'} server dayLength = ${d.dayLength} ms (${d.dayLength / 60000} min), config = ${DAY_LENGTH_MS} ms`);
  s.disconnect();
  process.exit(ok ? 0 : 1);
});
setTimeout(() => { console.error('✘ no welcome received'); process.exit(1); }, 5000);
