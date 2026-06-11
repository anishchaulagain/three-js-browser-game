/* Verify the picking garden + pocket + gifting: E picks a flower into the
   pocket, the plant disappears, F hands it to the partner over the network. */
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

  // Mia stands next to the first garden row, near Alex's picking spot
  await p2.bringToFront();
  await p2.evaluate(() => { window.__game.controller.pos.set(-46.5, 0, 15.8); });
  await sleep(400);

  // Alex walks to a plant and picks it
  await p1.bringToFront();
  await p1.evaluate(() => { window.__game.controller.pos.set(-47.5, 0, 15.6); });
  await sleep(500);
  const prompt = await p1.evaluate(() => document.getElementById('prompt').textContent);
  expect(`pick prompt shows (${JSON.stringify(prompt)})`, /pick a \w+/.test(prompt));
  await p1.keyboard.press('KeyE');
  await sleep(500);
  const afterPick = await p1.evaluate(() => ({
    pocket: window.__game.game.pocket.slice(),
    plantUp: window.__game.world.interactables.find((i) => i.type === 'pick' && !i.available()) ? 'one-down' : 'all-up',
    pocketUI: document.getElementById('pocket').textContent,
  }));
  expect(`flower in pocket (${afterPick.pocket.join(',') || 'none'})`, afterPick.pocket.length === 1);
  expect('plant disappeared (regrowing)', afterPick.plantUp === 'one-down');
  expect(`pocket UI shows count (${JSON.stringify(afterPick.pocketUI)})`, afterPick.pocketUI.includes('×1'));

  // F too far away → flower stays
  await p1.evaluate(() => { window.__game.controller.pos.set(-30, 0, 15.6); });
  await sleep(300);
  await p1.keyboard.press('KeyF');
  await sleep(300);
  const farPocket = await p1.evaluate(() => window.__game.game.pocket.length);
  expect('giving from far away is blocked', farPocket === 1);

  // walk back next to Mia and give it
  await p1.evaluate(() => { window.__game.controller.pos.set(-47, 0, 15.8); });
  await sleep(400);
  await p1.keyboard.press('KeyF');
  await sleep(800);
  const p1Pocket = await p1.evaluate(() => window.__game.game.pocket.length);
  const p2State = await p2.evaluate(() => ({
    pocket: window.__game.game.pocket.slice(),
    toast: document.getElementById('toast').textContent,
    pocketUI: document.getElementById('pocket').textContent,
  }));
  expect('flower left Alex\'s pocket', p1Pocket === 0);
  expect(`flower arrived in Mia's pocket (${p2State.pocket.join(',') || 'none'})`, p2State.pocket.length === 1);
  expect(`Mia saw the gift toast (${JSON.stringify(p2State.toast)})`, /gave you a/.test(p2State.toast));
  expect('Mia\'s pocket UI updated', p2State.pocketUI.includes('×1'));

  await browser.close();
  console.log(failures ? `\n${failures} FAILURE(S)` : '\nall good 💕');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error('test crashed:', e.message); process.exit(1); });
