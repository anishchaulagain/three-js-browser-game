/**
 * Verify Roblox-style camera behavior:
 *  - the roof NEVER disappears, even with the player inside
 *  - indoors, the camera pulls in under the roof instead of sitting outside it
 *  - the camera never sinks below the ground at low pitch angles
 */
const puppeteer = require('puppeteer-core');
const fs = require('fs');

const URL = process.env.GAME_URL || 'http://localhost:3000';
const CHROME = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find((p) => fs.existsSync(p));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const expect = (label, cond) => { console.log(`${cond ? '✔' : '✘'} ${label}`); if (!cond) failures++; };

const snapshot = `(() => {
  let roof = null;
  window.__game.game.scene.traverse((o) => {
    if (o.isMesh && o.geometry.type === 'ConeGeometry' && o.material.color.getHex() === 0xc14953) roof = o;
  });
  const cam = window.__game.game.camera.position;
  return {
    roofVisible: roof.visible,
    roofOpacity: roof.material.opacity,
    cam: { x: +cam.x.toFixed(2), y: +cam.y.toFixed(2), z: +cam.z.toFixed(2) },
  };
})()`;

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

  // --- inside the house: roof stays, camera pulls in under it ---
  await page.evaluate(() => {
    const c = window.__game.controller;
    c.pos.set(-3, 0, -23); // bedroom area
    c.pitch = 1.2;          // camera wants to go high above — must clamp under the roof
    c.dist = 8;
  });
  await sleep(2000);
  let s = await page.evaluate(snapshot);
  expect(`inside → roof still visible (visible ${s.roofVisible}, opacity ${s.roofOpacity})`,
    s.roofVisible && s.roofOpacity === 1);
  expect(`inside, high pitch → camera clamped under the roof (cam.y ${s.cam.y})`, s.cam.y < 3.3);
  expect(`inside → camera stayed within the house (z ${s.cam.z})`, s.cam.z > -30.5 && s.cam.z < -19.4);

  // --- outside at the lowest pitch: camera must not sink below the ground ---
  await page.evaluate(() => {
    const c = window.__game.controller;
    c.pos.set(0, 0, 5);
    c.pitch = -0.5; // lowest allowed angle
    c.dist = 10;
  });
  await sleep(2000);
  s = await page.evaluate(snapshot);
  expect(`low angle → camera stays above ground (cam.y ${s.cam.y})`, s.cam.y >= 0.29);
  expect('roof still visible from outside', s.roofVisible);

  await browser.close();
  console.log(failures ? `\n${failures} FAILURE(S)` : '\nall good 💕');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error('test crashed:', e.message); process.exit(1); });
