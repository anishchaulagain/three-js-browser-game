/* Verify the couple car: E enters as driver, WASD drives it, the partner sees
   the car move (sync), can hop in as passenger and rides along, E exits. */
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

  async function openAndJoin(role, name) {
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

  const p1 = await openAndJoin('male', 'Alex');
  const p2 = await openAndJoin('female', 'Mia');

  const carOf = (p) => p.evaluate(() => ({
    x: +window.__game.world.car.state.x.toFixed(2),
    z: +window.__game.world.car.state.z.toFixed(2),
    v: +window.__game.world.car.state.v.toFixed(2),
  }));

  // Alex walks to the car (wherever it was left — the server remembers) and hops in
  await p1.bringToFront();
  const parked = await carOf(p1);
  await p1.evaluate((pos) => { window.__game.controller.pos.set(pos.x - 2.2, 0, pos.z); }, parked);
  await sleep(500);
  const prompt = await p1.evaluate(() => document.getElementById('prompt').textContent);
  expect(`car prompt shows (${JSON.stringify(prompt)})`, prompt.includes('car'));
  await p1.keyboard.press('KeyE');
  await sleep(400);
  const seat1 = await p1.evaluate(() => window.__game.game.carSeat);
  expect(`Alex is the driver (${seat1})`, seat1 === 'driver');

  // line the car up on the open road (no trees there), then drive forward
  await p1.evaluate(() => {
    const s = window.__game.world.car.state;
    s.x = 0; s.z = 8; s.ry = 0; s.v = 0;
  });
  await sleep(200);
  const before = await carOf(p1);
  await p1.keyboard.down('KeyW');
  await sleep(2000);
  await p1.keyboard.up('KeyW');
  await sleep(1200); // coast to a stop-ish
  const after = await carOf(p1);
  const driven = Math.hypot(after.x - before.x, after.z - before.z);
  expect(`car drove ${driven.toFixed(1)}m with WASD`, driven > 8);

  // Alex's avatar rides in the car
  const riding = await p1.evaluate(() => {
    const c = window.__game.controller.pos;
    const car = window.__game.world.car.state;
    return Math.hypot(c.x - car.x, c.z - car.z) < 1.5 && window.__game.controller.anim === 'sit';
  });
  expect('driver avatar is seated in the car', riding);

  // Mia's world shows the car at the same (synced) position — read it with her
  // tab foregrounded so her interpolation isn't background-throttled
  await p2.bringToFront();
  await sleep(1000);
  const mias = await carOf(p2);
  const syncErr = Math.hypot(mias.x - after.x, mias.z - after.z);
  expect(`car position synced to partner (off by ${syncErr.toFixed(2)}m)`, syncErr < 1.5);

  // Mia hops in — she should get the passenger seat
  await p2.evaluate((pos) => { window.__game.controller.pos.set(pos.x + 2.2, 0, pos.z); }, mias);
  await sleep(500);
  await p2.keyboard.press('KeyE');
  await sleep(500);
  const seat2 = await p2.evaluate(() => window.__game.game.carSeat);
  expect(`Mia is the passenger (${seat2})`, seat2 === 'passenger');

  // Alex hops out
  await p1.bringToFront();
  await sleep(300);
  await p1.keyboard.press('KeyE');
  await sleep(400);
  const out = await p1.evaluate(() => ({
    seat: window.__game.game.carSeat,
    anim: window.__game.controller.anim,
  }));
  expect(`Alex hopped out (seat ${out.seat}, anim ${out.anim})`, out.seat === null && out.anim !== 'sit');

  await browser.close();
  console.log(failures ? `\n${failures} FAILURE(S)` : '\nall good 💕');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error('test crashed:', e.message); process.exit(1); });
