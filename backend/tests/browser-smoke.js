/**
 * Headless browser smoke test (run with the server already up):
 * loads the game in two pages, joins as both characters, walks through the
 * front door, opens the closet, and checks for page errors.
 *
 *   npm run test:browser
 *
 * Needs a local Chrome/Edge — adjust CHROME below if yours lives elsewhere.
 */
const puppeteer = require('puppeteer-core');
const fs = require('fs');

const URL = process.env.GAME_URL || 'http://localhost:3000';
const CHROME = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].find((p) => fs.existsSync(p));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
function expect(label, cond) {
  console.log(`${cond ? '✔' : '✘'} ${label}`);
  if (!cond) failures++;
}

(async () => {
  if (!CHROME) { console.error('no Chrome/Edge found — set CHROME path'); process.exit(1); }
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--window-size=1280,720'],
  });
  const errors = [];

  async function openAndJoin(role, name) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });
    page.on('pageerror', (e) => errors.push(`[${name}] ${e.message}`));
    await page.goto(URL, { waitUntil: 'networkidle2', timeout: 30000 });
    await sleep(1200);
    await page.click(`.char-card[data-role="${role}"]`);
    await page.type('#name-input', name);
    await page.click('#join-btn');
    await sleep(2000);
    return page;
  }

  const p1 = await openAndJoin('male', 'Alex');
  const p2 = await openAndJoin('female', 'Mia');

  // p2: walk through the front door (foreground tab so rAF runs)
  await p2.bringToFront();
  await p2.evaluate(() => {
    const c = window.__game.controller;
    c.pos.set(0, 0, -16);
    c.yaw = 0;
  });
  await p2.keyboard.down('KeyW');
  await sleep(1600);
  await p2.keyboard.up('KeyW');
  const inside = await p2.evaluate(() => window.__game.world.isInsideHouse(window.__game.controller.pos));
  expect('walked through the front door', inside);

  // p2: open the closet, pick an outfit
  await p2.evaluate(() => { window.__game.controller.pos.set(-5.3, 0, -22.6); });
  await sleep(400);
  await p2.keyboard.press('KeyE');
  await sleep(400);
  expect('closet modal opened', await p2.evaluate(() =>
    !document.getElementById('closet-modal').classList.contains('hidden')));
  expect('6 outfits listed', await p2.evaluate(() =>
    document.querySelectorAll('.outfit-card').length === 6));
  await p2.evaluate(() => document.querySelectorAll('.outfit-card')[1].click());
  await sleep(500);

  // p1 should have seen the outfit toast and have a partner
  await p1.bringToFront();
  await sleep(400);
  const p1Hud = await p1.evaluate(() => ({
    partner: document.getElementById('partner-status').textContent,
    canvas: !!document.querySelector('canvas'),
  }));
  expect('p1 sees partner status', p1Hud.partner.includes('Mia'));
  expect('p1 has a rendering canvas', p1Hud.canvas);
  expect('no page errors', errors.length === 0);
  if (errors.length) errors.slice(0, 10).forEach((e) => console.log('   ' + e));

  await browser.close();
  console.log(failures ? `\n${failures} FAILURE(S)` : '\nall good 💕');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error('test crashed:', e.message); process.exit(1); });
