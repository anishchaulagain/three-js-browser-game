/* Verify the chat popup: T opens it, sent message shows as a bubble over the
   sender's head on BOTH screens, quick chips send, Esc closes. */
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

  // T opens the popup
  await p1.keyboard.press('KeyT');
  await sleep(250);
  expect('T opens the chat popup with focus', await p1.evaluate(() =>
    !document.getElementById('chat-popup').classList.contains('hidden') &&
    document.activeElement.id === 'chat-input'));

  // type + Enter → bubble over own head, popup closes
  await p1.keyboard.type('hello my love');
  await p1.keyboard.press('Enter');
  await sleep(600);
  const sender = await p1.evaluate(() => ({
    popupClosed: document.getElementById('chat-popup').classList.contains('hidden'),
    ownBubble: window.__game.game.selfAvatar.bubbleAnchor.children.length,
    log: document.getElementById('chat-log').textContent,
  }));
  expect('popup closed after sending', sender.popupClosed);
  expect('bubble shows over the sender\'s own head', sender.ownBubble === 1);
  expect(`message in sender's log (${JSON.stringify(sender.log)})`, sender.log.includes('hello my love'));

  // partner sees the bubble over Alex's head + log entry
  const receiver = await p2.evaluate(() => ({
    partnerBubble: window.__game.game.partner.avatar.bubbleAnchor.children.length,
    log: document.getElementById('chat-log').textContent,
  }));
  expect('bubble shows over the sender\'s head on the PARTNER\'s screen', receiver.partnerBubble === 1);
  expect('message in partner\'s log', receiver.log.includes('hello my love'));

  // quick chip sends instantly
  await p2.keyboard.press('KeyT');
  await sleep(250);
  await p2.click('.chat-chip[data-msg="I love you ❤️"]');
  await sleep(600);
  expect('quick chip sent from Mia', await p1.evaluate(() =>
    document.getElementById('chat-log').textContent.includes('I love you')));
  expect('chip bubble over Mia on Alex\'s screen', await p1.evaluate(() =>
    window.__game.game.partner.avatar.bubbleAnchor.children.length === 1));

  // Esc closes without sending
  await p1.keyboard.press('KeyT');
  await sleep(200);
  await p1.keyboard.type('never sent');
  await p1.keyboard.press('Escape');
  await sleep(300);
  expect('Esc closes without sending', await p1.evaluate(() =>
    document.getElementById('chat-popup').classList.contains('hidden') &&
    !document.getElementById('chat-log').textContent.includes('never sent')));

  await Promise.all([b1.close(), b2.close()]);
  console.log(failures ? `\n${failures} FAILURE(S)` : '\nall good 💕');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error('test crashed:', e.message); process.exit(1); });
