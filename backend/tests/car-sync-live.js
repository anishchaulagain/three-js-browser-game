/* Live car sync test using TWO browser instances (so both run at full fps):
   while the driver drives, the partner's view must show the car moving AND
   the driver's avatar glued to the seat — no trailing-behind-the-car lag. */
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

  // Alex finds the car, lines it up on the open road, hops in
  const parked = await p1.evaluate(() => ({
    x: window.__game.world.car.state.x, z: window.__game.world.car.state.z,
  }));
  await p1.evaluate((pos) => { window.__game.controller.pos.set(pos.x - 2.2, 0, pos.z); }, parked);
  await sleep(400);
  await p1.keyboard.press('KeyE');
  await sleep(300);
  await p1.evaluate(() => {
    const s = window.__game.world.car.state;
    s.x = 0; s.z = 8; s.ry = 0; s.v = 0;
  });
  // Mia stands near the road so her tab definitely renders the action
  await p2.evaluate(() => { window.__game.controller.pos.set(6, 0, 20); });
  await sleep(600);

  // drive for 3 seconds while sampling Mia's view live every 250 ms
  await p1.keyboard.down('KeyW');
  const samples = [];
  for (let i = 0; i < 12; i++) {
    await sleep(250);
    samples.push(await p2.evaluate(() => {
      const car = window.__game.world.car;
      const partnerG = window.__game.game.partner.avatar.group;
      const seat = car.seatWorld(window.__game.game.partnerCarSeat || 'driver');
      return {
        carX: +car.state.x.toFixed(2), carZ: +car.state.z.toFixed(2),
        seatGap: +Math.hypot(partnerG.position.x - seat.x, partnerG.position.z - seat.z).toFixed(2),
        anim: window.__game.game.partner.avatar.anim,
        seatKnown: window.__game.game.partnerCarSeat,
      };
    }));
  }
  await p1.keyboard.up('KeyW');

  const totalMoved = Math.hypot(
    samples.at(-1).carX - samples[0].carX,
    samples.at(-1).carZ - samples[0].carZ);
  const movingSteps = samples.slice(1).filter((s, i) =>
    Math.hypot(s.carX - samples[i].carX, s.carZ - samples[i].carZ) > 0.5).length;
  const maxGap = Math.max(...samples.map((s) => s.seatGap));
  const seated = samples.every((s) => s.anim === 'sit' && s.seatKnown === 'driver');

  expect(`car moved live on partner's screen (${totalMoved.toFixed(1)}m over ${movingSteps}/11 steps)`,
    totalMoved > 15 && movingSteps >= 8);
  expect(`driver avatar glued to the seat the whole ride (max gap ${maxGap}m)`, maxGap < 0.5);
  expect('partner shown seated with seat known', seated);

  await Promise.all([b1.close(), b2.close()]);
  console.log(failures ? `\n${failures} FAILURE(S)` : '\nall good 💕');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error('test crashed:', e.message); process.exit(1); });
