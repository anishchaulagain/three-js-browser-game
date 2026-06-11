/* Verify click-to-lock mouse look: lock on click, camera turns on bare mouse
   movement (no button held), and the lock releases when the closet opens. */
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

  // click the world → pointer should lock
  await page.mouse.click(640, 400);
  await sleep(300);
  const locked = await page.evaluate(() => document.pointerLockElement?.tagName === 'CANVAS');
  expect('clicking the world locks the pointer', locked);

  // bare mouse movement (no button) should rotate the camera
  const yaw0 = await page.evaluate(() => window.__game.controller.yaw);
  await page.mouse.move(640, 400);
  await page.mouse.move(900, 400, { steps: 8 });
  await sleep(200);
  const yaw1 = await page.evaluate(() => window.__game.controller.yaw);
  expect(`moving the mouse turns the camera (yaw ${yaw0.toFixed(2)} → ${yaw1.toFixed(2)})`,
    Math.abs(yaw1 - yaw0) > 0.1);

  // opening the closet must release the cursor
  await page.evaluate(() => { window.__game.controller.pos.set(-5.3, 0, -22.6); });
  await sleep(300);
  await page.keyboard.press('KeyE');
  await sleep(300);
  const releasedForCloset = await page.evaluate(() =>
    document.pointerLockElement === null &&
    !document.getElementById('closet-modal').classList.contains('hidden'));
  expect('opening the closet releases the cursor', releasedForCloset);

  // while the closet is open, clicking must NOT re-lock (so outfits stay clickable)
  await page.mouse.click(640, 600);
  await sleep(300);
  const stillFree = await page.evaluate(() => document.pointerLockElement === null);
  expect('cursor stays free while closet is open', stillFree);

  await browser.close();
  console.log(failures ? `\n${failures} FAILURE(S)` : '\nall good 💕');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error('test crashed:', e.message); process.exit(1); });
