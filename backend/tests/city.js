/* Verify the city expansion: cars drive their loops, the minimap renders with
   both players' pins, secret places exist, and no page errors. */
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
  await p1.bringToFront();

  // --- cars exist and actually drive ---
  const carsBefore = await p1.evaluate(() => {
    const out = [];
    window.__game.game.scene.traverse((o) => {
      if (o.name && o.name.startsWith('car-')) out.push({ n: o.name, x: o.position.x, z: o.position.z });
    });
    return out;
  });
  expect(`6 cars in the scene (found ${carsBefore.length})`, carsBefore.length === 6);
  await sleep(2000);
  const carsAfter = await p1.evaluate(() => {
    const out = {};
    window.__game.game.scene.traverse((o) => {
      if (o.name && o.name.startsWith('car-')) out[o.name] = { x: o.position.x, z: o.position.z };
    });
    return out;
  });
  const moved = carsBefore.filter((c) => {
    const a = carsAfter[c.n];
    return a && Math.hypot(a.x - c.x, a.z - c.z) > 4;
  });
  expect(`cars are driving (${moved.length}/6 moved >4m in 2s)`, moved.length === 6);

  // --- minimap renders with content and both pins ---
  const mapStats = await p1.evaluate(() => {
    const c = document.getElementById('minimap');
    const g = c.getContext('2d');
    const img = g.getImageData(0, 0, c.width, c.height).data;
    let colored = 0, white = 0;
    for (let i = 0; i < img.length; i += 4) {
      if (img[i + 3] > 100) {
        colored++;
        if (img[i] > 230 && img[i + 1] > 230 && img[i + 2] > 230) white++;
      }
    }
    return { colored, white, w: c.width };
  });
  expect(`minimap is rendered (${mapStats.colored} colored px)`, mapStats.colored > 10000);
  expect(`self pin drawn (white-ringed dot: ${mapStats.white} white px)`, mapStats.white > 10);

  // partner pin tracks movement: move Mia to the plaza, check p1's map state
  await p2.bringToFront();
  await p2.evaluate(() => { window.__game.controller.pos.set(0, 0, 70); });
  await sleep(600);
  await p1.bringToFront();
  await sleep(600);
  const partnerOnMap = await p1.evaluate(() =>
    window.__game.game.partner && Math.abs(window.__game.game.partner.avatar.group.position.z - 70) < 3);
  expect('partner position synced for the map pin (Mia at plaza)', partnerOnMap);

  // --- secret places + city interactables registered ---
  const labels = await p1.evaluate(() =>
    window.__game.world.interactables.map((i) => i.label).join('|'));
  expect('secret grotto exists', labels.includes('secret wish'));
  expect("lovers' lookout exists", labels.includes('telescope'));
  expect('secret rose garden exists', labels.includes('swing'));
  expect('city date spots exist', labels.includes('fountain') && labels.includes('movie') && labels.includes('candlelit'));

  // --- screenshots for visual review ---
  await p1.evaluate(() => {
    const c = window.__game.controller;
    c.pos.set(0, 0, 52);
    c.ry = 0; c.yaw = Math.PI; c.pitch = 0.45; c.dist = 12;
  });
  await sleep(1500);
  await p1.screenshot({ path: 'screenshot-city.png' });
  await p1.evaluate(() => {
    const c = window.__game.controller;
    c.pos.set(-126, 0, -110);
    c.yaw = -Math.PI / 2; c.pitch = 0.35; c.dist = 9;
  });
  await sleep(1500);
  await p1.screenshot({ path: 'screenshot-secret.png' });

  await browser.close();
  console.log(failures ? `\n${failures} FAILURE(S)` : '\nall good 💕');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error('test crashed:', e.message); process.exit(1); });
