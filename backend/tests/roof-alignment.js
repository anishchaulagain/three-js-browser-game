/* Verify the roof's footprint is a centered, axis-aligned rectangle over the walls. */
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
  await page.goto(URL, { waitUntil: 'networkidle2', timeout: 30000 });
  await sleep(1200);
  await page.click('.char-card[data-role="male"]');
  await page.click('#join-btn');
  await sleep(1500);
  await page.bringToFront();

  // measure roof corners in world space (bounding box of the scaled mesh)
  const box = await page.evaluate(() => {
    const THREE_Box = window.__game.game.scene; // traverse to find roof
    let roof = null;
    THREE_Box.traverse((o) => {
      if (o.isMesh && o.geometry.type === 'ConeGeometry' && o.material.color.getHex() === 0xc14953) roof = o;
    });
    roof.geometry.computeBoundingBox();
    const bb = roof.geometry.boundingBox;
    // apply mesh transform to bbox corners
    const min = bb.min.clone().multiply(roof.scale).add(roof.position);
    const max = bb.max.clone().multiply(roof.scale).add(roof.position);
    return {
      minX: +min.x.toFixed(2), maxX: +max.x.toFixed(2),
      minZ: +min.z.toFixed(2), maxZ: +max.z.toFixed(2),
    };
  });
  console.log('roof footprint:', JSON.stringify(box), '— walls: x ∈ [-7.15, 7.15], z ∈ [-30.15, -19.85]');
  const cx = (box.minX + box.maxX) / 2, cz = (box.minZ + box.maxZ) / 2;
  expect(`roof centered on the house (center x ${cx.toFixed(2)}, z ${cz.toFixed(2)})`,
    Math.abs(cx) < 0.05 && Math.abs(cz + 25) < 0.05);
  expect('roof covers walls in x with a small eave', box.minX < -7.15 && box.maxX > 7.15 && box.maxX < 8.5);
  expect('roof covers walls in z with a small eave', box.minZ < -30.15 && box.maxZ > -19.85 && box.maxZ < -18.5);

  // visual check from the front
  await page.evaluate(() => {
    const c = window.__game.controller;
    c.pos.set(0, 0, -13);
    c.ry = Math.PI;
    c.yaw = 0;
    c.pitch = 0.25;
    c.dist = 11;
  });
  await sleep(1500);
  await page.screenshot({ path: 'screenshot-roof.png' });

  await browser.close();
  console.log(failures ? `\n${failures} FAILURE(S)` : '\nall good 💕');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error('test crashed:', e.message); process.exit(1); });
