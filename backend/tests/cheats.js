/* Verify the cheat console: ` opens it, "beast" summons the car to the player,
   unknown codes do nothing, Esc closes. */
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

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--window-size=1280,720'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  page.on('pageerror', (e) => { console.log('pageerror:', e.message); failures++; });
  await page.goto(URL, { waitUntil: 'networkidle2', timeout: 30000 });
  await sleep(1200);
  await page.click('.char-card[data-role="male"]');
  await page.click('#join-btn');
  await sleep(1500);
  await page.bringToFront();

  // walk far from the car so the summon is meaningful
  await page.evaluate(() => { window.__game.controller.pos.set(-20, 0, 60); });
  await sleep(400);

  // ` opens the console
  await page.keyboard.press('Backquote');
  await sleep(200);
  expect('` opens the cheat console', await page.evaluate(() =>
    !document.getElementById('cheat-input').classList.contains('hidden') &&
    document.activeElement.id === 'cheat-input'));

  // type beast + Enter → car appears in front of the player
  await page.keyboard.type('beast');
  await page.keyboard.press('Enter');
  await sleep(500);
  const s = await page.evaluate(() => {
    const car = window.__game.world.car.state;
    const p = window.__game.controller.pos;
    return {
      dist: +Math.hypot(car.x - p.x, car.z - p.z).toFixed(2),
      toast: document.getElementById('toast').textContent,
      consoleClosed: document.getElementById('cheat-input').classList.contains('hidden'),
    };
  });
  expect(`BEAST summoned the car beside the player (${s.dist}m away)`, s.dist < 4.5);
  expect(`toast confirms (${JSON.stringify(s.toast)})`, s.toast.includes('BEAST'));
  expect('console closed after entering', s.consoleClosed);

  // car is usable right away
  await page.keyboard.press('KeyE');
  await sleep(400);
  expect('player can hop straight in', await page.evaluate(() =>
    window.__game.game.carSeat === 'driver'));
  await page.keyboard.press('KeyE'); // back out
  await sleep(300);

  // unknown code → gentle nothing
  await page.keyboard.press('Backquote');
  await page.keyboard.type('moneyplease');
  await page.keyboard.press('Enter');
  await sleep(300);
  expect('unknown code does nothing', await page.evaluate(() =>
    document.getElementById('toast').textContent.includes('Nothing happened')));

  // Esc closes without running
  await page.keyboard.press('Backquote');
  await page.keyboard.type('beast');
  await page.keyboard.press('Escape');
  await sleep(200);
  expect('Esc cancels the console', await page.evaluate(() =>
    document.getElementById('cheat-input').classList.contains('hidden')));

  await browser.close();
  console.log(failures ? `\n${failures} FAILURE(S)` : '\nall good 💕');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error('test crashed:', e.message); process.exit(1); });
