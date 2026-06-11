/* Verify first-person POV: V toggles it, camera sits at head height, own
   avatar hides locally, body follows look direction, V/scroll-out restores. */
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

  const snap = () => page.evaluate(() => {
    const g = window.__game.game;
    const c = g.controller;
    return {
      fp: c.firstPerson,
      avatarVisible: g.selfAvatar.group.visible,
      camY: +g.camera.position.y.toFixed(2),
      headDist: +Math.hypot(
        g.camera.position.x - c.pos.x,
        g.camera.position.z - c.pos.z).toFixed(2),
      ry: c.ry, yaw: c.yaw,
    };
  });

  // third person baseline
  let s = await snap();
  expect(`starts in third person (cam ${s.headDist}m behind)`, !s.fp && s.avatarVisible && s.headDist > 3);

  // V → first person
  await page.keyboard.press('KeyV');
  await sleep(400);
  s = await snap();
  expect('V enters first person', s.fp);
  expect(`camera at head (y ${s.camY}, offset ${s.headDist}m)`, Math.abs(s.camY - 1.78) < 0.1 && s.headDist < 0.1);
  expect('own avatar hidden locally', !s.avatarVisible);

  // mouse look turns the body in first person
  await page.mouse.click(640, 400);
  await sleep(250);
  await page.mouse.move(640, 400);
  await page.mouse.move(880, 400, { steps: 6 });
  await sleep(250);
  s = await snap();
  expect(`body follows look direction (ry ${s.ry.toFixed(2)} == yaw ${s.yaw.toFixed(2)})`,
    Math.abs(s.ry - s.yaw) < 0.01);

  // V → back to third person
  await page.keyboard.press('KeyV');
  await sleep(800);
  s = await snap();
  expect(`V returns to third person (cam ${s.headDist}m back, avatar visible)`,
    !s.fp && s.avatarVisible && s.headDist > 1.5);

  await browser.close();
  console.log(failures ? `\n${failures} FAILURE(S)` : '\nall good 💕');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error('test crashed:', e.message); process.exit(1); });
