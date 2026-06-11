/* Verify chat E2E encryption: the wire payload contains only ciphertext (no
   plaintext), the partner decrypts it correctly, and both see the same
   key-fingerprint "love seal". */
const puppeteer = require('puppeteer-core');
const fs = require('fs');

const URL = process.env.GAME_URL || 'http://localhost:3100';
const CHROME = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find((p) => fs.existsSync(p));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const expect = (label, cond) => { console.log(`${cond ? '✔' : '✘'} ${label}`); if (!cond) failures++; };

const SECRET = 'meet me at the grotto at midnight';

async function launch() {
  return puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--window-size=1280,720'],
  });
}

async function openAndJoin(browser, role, name) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  page.on('pageerror', (e) => { console.log(`pageerror [${name}]:`, e.message); failures++; });
  await page.goto(URL, { waitUntil: 'networkidle2', timeout: 30000 });
  await sleep(1200);
  await page.click(`.char-card[data-role="${role}"]`);
  await page.type('#name-input', name);
  await page.click('#join-btn');
  await sleep(1800);
  return page;
}

(async () => {
  const [b1, b2] = await Promise.all([launch(), launch()]);
  const p1 = await openAndJoin(b1, 'male', 'Alex');
  const p2 = await openAndJoin(b2, 'female', 'Mia');

  // secure channel established on both sides, fingerprints match
  const [seal1, seal2] = await Promise.all([p1, p2].map((p) =>
    p.evaluate(() => ({
      ready: window.__game.game.secure.ready,
      seal: window.__game.game.secure.fingerprint,
    }))));
  expect('secure channel ready on both sides', seal1.ready && seal2.ready);
  expect(`love seals match (${seal1.seal} == ${seal2.seal})`, seal1.seal === seal2.seal && seal1.seal.length > 0);

  // tap Alex's socket so we can inspect the actual outgoing wire payload
  await p1.evaluate(() => {
    window.__wire = [];
    const s = window.__game.net.socket;
    const orig = s.emit.bind(s);
    s.emit = (ev, ...args) => {
      if (ev === 'chat') window.__wire.push(JSON.stringify(args));
      return orig(ev, ...args);
    };
  });

  // Alex sends the secret
  await p1.keyboard.press('KeyT');
  await sleep(250);
  await p1.keyboard.type(SECRET);
  await p1.keyboard.press('Enter');
  await sleep(700);

  const wire = await p1.evaluate(() => window.__wire);
  expect('exactly one chat packet on the wire', wire.length === 1);
  expect('wire payload contains NO plaintext', !wire[0].includes('grotto') && !wire[0].includes('midnight'));
  expect('wire payload is a nonce+ciphertext envelope', wire[0].includes('"n":') && wire[0].includes('"c":'));

  // Mia decrypts and reads it; her bubble + log show plaintext
  const mia = await p2.evaluate(() => ({
    log: document.getElementById('chat-log').textContent,
    bubble: window.__game.game.partner.avatar.bubbleAnchor.children.length,
  }));
  expect('partner decrypted the message', mia.log.includes(SECRET));
  expect('bubble over sender on partner screen', mia.bubble === 1);

  // sender saw their own message locally (never echoed through the server)
  expect('sender sees own message locally', await p1.evaluate(() =>
    document.getElementById('chat-log').textContent.includes('grotto')));

  // a tampered envelope must NOT decrypt into anything
  const tampered = await p2.evaluate(() => {
    const env = window.__game.game.secure.encrypt('test');
    env.c = env.c.slice(0, -4) + 'AAAA'; // corrupt the ciphertext
    return window.__game.game.secure.decrypt(env);
  });
  expect('tampered ciphertext rejected (authenticated encryption)', tampered === null);

  await Promise.all([b1.close(), b2.close()]);
  console.log(failures ? `\n${failures} FAILURE(S)` : '\nall good 💕');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error('test crashed:', e.message); process.exit(1); });
