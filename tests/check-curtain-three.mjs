/**
 * ตรวจ contract ของม่านแดง CSS กับ state เดิมของเด็ค
 *
 *   node tests/check-curtain-three.mjs [รากโฟลเดอร์]
 */
import { readFile } from 'node:fs/promises';
import { createReadStream, existsSync, statSync } from 'node:fs';
import http from 'node:http';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');

const ROOT = resolve(process.argv[2] || process.cwd());
const INDEX = join(ROOT, 'index.html');
const html = await readFile(INDEX, 'utf8');
const failures = [];
const ok = (value, label) => {
  if(value) console.log('ผ่าน ' + label);
  else { console.error('พลาด ' + label); failures.push(label); }
};

ok(!html.includes('id="curtain-canvas"'), 'ม่านแดงไม่มี canvas หรือ WebGL');
ok(!html.includes('assets/curtain/three.js') && !html.includes('assets/curtain/curtain3d.js'),
   'หน้าสไลด์ไม่โหลด Three.js สำหรับม่าน');
ok(html.includes('background-color:#C4132A'), 'ใช้สีแดงของม่านรุ่น cf53625');
ok(html.includes('@keyframes curtainL') && html.includes('@keyframes curtainR'),
   'ม่านสองบานใช้ animation เดิมจาก cf53625');
ok(!/@keyframes\s+cripple\s*\{/.test(html),
   'ไม่คืน animation background-position ที่ทำให้ Raspberry Pi กระตุก');

const mime = {'.html':'text/html','.js':'text/javascript','.svg':'image/svg+xml','.png':'image/png',
  '.jpg':'image/jpeg','.woff2':'font/woff2','.mp4':'video/mp4'};
const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(req.url.split('?')[0]);
  const file = join(ROOT, pathname === '/' ? 'index.html' : pathname.replace(/^\//, ''));
  if(!existsSync(file) || statSync(file).isDirectory()){ res.writeHead(404); res.end('not found'); return; }
  res.writeHead(200, {'content-type':mime[file.slice(file.lastIndexOf('.'))] || 'application/octet-stream'});
  createReadStream(file).pipe(res);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await browser.newPage({ viewport:{ width:1280, height:720 } });
await page.goto(base + '/index.html?sync=0&kiosk=1', { waitUntil:'load' });
await page.waitForTimeout(800);

await page.evaluate(() => window.NORA.apply({ cmd:'deck', arg:'intro' }));
await page.waitForTimeout(120);
const reset = await page.evaluate(() => ({
  curtainShown:getComputedStyle(document.getElementById('curtain')).display !== 'none',
  panels:[...document.querySelectorAll('#curtain .cpanel')].map(panel => ({
    animation:getComputedStyle(panel).animationName,
    color:getComputedStyle(panel.querySelector('.cfabric')).backgroundColor,
  })),
}));
ok(reset.curtainShown && reset.panels.length === 2, 'ตั้งม่านแล้วแสดงผ้าสองบานครบ');
ok(reset.panels.every(x => x.animation === 'none'), 'ตั้งม่านแล้วหยุดนิ่งที่เฟรมปิด');
ok(reset.panels.every(x => x.color === 'rgb(196, 19, 42)'),
   'ผ้าทั้งสองบานเป็นสีแดงจาก cf53625');

const curtainBox = await page.locator('#curtain').boundingBox();
const closedPng = await page.screenshot({ clip:curtainBox });
const closedPalette = await page.evaluate(async encoded => {
  const source = new Image();
  source.src = `data:image/png;base64,${encoded}`;
  await source.decode();
  const sample = document.createElement('canvas');
  sample.width = 160;
  sample.height = 90;
  const ctx = sample.getContext('2d', { willReadFrequently:true });
  ctx.drawImage(source, 0, 0, sample.width, sample.height);
  const px = ctx.getImageData(0, 0, sample.width, sample.height).data;
  let luminance = 0;
  let saturation = 0;
  let dark = 0;
  let red = 0;
  let green = 0;
  let blue = 0;
  const count = px.length / 4;
  for(let i = 0; i < px.length; i += 4){
    const r = px[i] / 255;
    const g = px[i + 1] / 255;
    const b = px[i + 2] / 255;
    const hi = Math.max(r, g, b);
    const lo = Math.min(r, g, b);
    const y = .2126 * r + .7152 * g + .0722 * b;
    luminance += y;
    saturation += hi ? (hi - lo) / hi : 0;
    dark += y < .25 ? 1 : 0;
    red += r;
    green += g;
    blue += b;
  }
  return {
    luminance:luminance / count,
    saturation:saturation / count,
    darkShare:dark / count,
    rgb:[red / count, green / count, blue / count],
  };
}, closedPng.toString('base64'));
ok(closedPalette.saturation > .60
   && closedPalette.rgb[0] > closedPalette.rgb[1] * 2.2
   && closedPalette.rgb[0] > closedPalette.rgb[2] * 1.8,
   `ม่านปิดเป็นสีแดงอิ่มตัว ไม่ใช่สีทอง (${JSON.stringify(closedPalette)})`);

await page.evaluate(() => window.NORA.apply({ cmd:'curtain' }));
await page.waitForTimeout(500);
const opening = await page.evaluate(() => ({
  animations:[...document.querySelectorAll('#curtain .cpanel')]
    .map(panel => getComputedStyle(panel).animationName),
  deckPlaying:window.NORA.state.playing,
  hasLogoLayer:!!document.getElementById('intro-logo-fx')
    || !!document.getElementById('intro-logo-canvas'),
}));
ok(opening.animations.includes('curtainL') && opening.animations.includes('curtainR'),
   'คำสั่งเปิดม่านเริ่ม animation ของผ้าทั้งสองบาน');
ok(opening.deckPlaying === true,
   'ม่าน CSS เบาพอให้สไลด์แรกเริ่มเล่นพร้อมการเปิดเหมือน cf53625');
ok(opening.hasLogoLayer === false,
   'ระหว่างเปิดม่านไม่มีชั้นโลโก้หรือฉากคั่นซ้อนอยู่');

await page.evaluate(() => window.NORA.apply({ cmd:'deck', arg:'intro' }));
await page.evaluate(() => window.NORA.apply({ cmd:'curtain', at:Date.now() - 4100 }));
await page.waitForTimeout(350);
const opened = await page.evaluate(() => ({
  curtainUp:document.documentElement.classList.contains('curtain-up'),
  deckPlaying:window.NORA.state.playing,
  curtainShown:getComputedStyle(document.getElementById('curtain')).display !== 'none',
}));
ok(opened.curtainUp && opened.deckPlaying && !opened.curtainShown,
   'เมื่อม่านเปิดครบแล้วเข้าสไลด์แรกทันทีโดยไม่มีฉากคั่น');

await page.evaluate(() => window.NORA.apply({ cmd:'deck', arg:'intro' }));
await page.waitForTimeout(100);
const resetAgain = await page.evaluate(() => ({
  animations:[...document.querySelectorAll('#curtain .cpanel')]
    .map(panel => getComputedStyle(panel).animationName),
}));
ok(resetAgain.animations.every(name => name === 'none'),
   'กดตั้งม่านระหว่างเปิดแล้วหยุดและคืนเฟรมแรก');

await browser.close();
server.close();
if(failures.length){
  console.error(`\nไม่ผ่าน ${failures.length} จุด`);
  process.exit(1);
}
console.log('\nผ่าน — ม่านแดง CSS จาก cf53625 เชื่อมกับ state เดิมครบ');
