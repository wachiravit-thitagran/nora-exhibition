/**
 * ตรวจ contract ของม่าน Three.js กับ state เดิมของเด็ค
 *
 *   node tests/check-curtain-three.mjs [รากโฟลเดอร์]
 */
import { readFile } from 'node:fs/promises';
import { createReadStream, existsSync, readdirSync, statSync } from 'node:fs';
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

ok(html.includes('id="curtain-canvas"'), 'มี canvas สำหรับม่าน Three.js');
ok(html.includes('assets/curtain/three.js'), 'โหลด Three.js จากไฟล์ local');
ok(html.includes('assets/curtain/curtain3d.js'), 'โหลดตัวควบคุมม่านจากไฟล์ local');
ok(!/curtain[^\n]+https?:\/\//i.test(html), 'ม่านไม่พึ่ง CDN หรืออินเทอร์เน็ต');
const curtainDir = join(ROOT, 'assets/curtain');
const curtainAssets = readdirSync(curtainDir, { recursive:true }).map(String);
ok(!curtainAssets.some(name => /\.(?:mp4|webm|jpe?g|png|webp|gif|avif)$/i.test(name)),
   'ชุดม่านไม่มีวิดีโอหรือไฟล์ภาพ raster');
ok(!existsSync(join(curtainDir, 'logo-pure-code.js')),
   'ไม่มี runtime โลโก้หรือฉากคั่นหลังม่าน');
const curtainCode = await readFile(join(curtainDir, 'curtain3d.js'), 'utf8');
ok(!/TextureLoader|curtain-plate|sampler2D|texture2D/.test(curtainCode),
   'ม่าน Three.js ใช้ shader procedural โดยไม่มี texture ภาพ');

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

ok(await page.evaluate(() => !!window.__CURTAIN3D?.ready), 'WebGL renderer พร้อมใช้งาน');
await page.evaluate(() => window.NORA.apply({ cmd:'deck', arg:'intro' }));
await page.waitForTimeout(120);
const reset = await page.evaluate(() => ({
  progress:window.__CURTAIN3D?.progress,
  playing:window.__CURTAIN3D?.playing,
  shown:!!document.getElementById('curtain-canvas')
    && getComputedStyle(document.getElementById('curtain-canvas')).display !== 'none',
}));
ok(reset.shown, 'ตั้งม่านแล้วแสดง canvas');
ok(reset.progress === 0 && reset.playing === false, 'ตั้งม่านแล้วกลับเฟรมปิดและหยุดนิ่ง');

await page.evaluate(() => window.NORA.apply({ cmd:'curtain' }));
await page.waitForTimeout(500);
const opening = await page.evaluate(() => ({
  progress:window.__CURTAIN3D?.progress,
  playing:window.__CURTAIN3D?.playing,
  deckPlaying:window.NORA.state.playing,
  hasLogoLayer:!!document.getElementById('intro-logo-fx')
    || !!document.getElementById('intro-logo-canvas'),
}));
ok(opening.playing && opening.progress > 0 && opening.progress < 1,
   'คำสั่งเปิดม่านเริ่ม timeline ของ Three.js');
ok(opening.deckPlaying === false,
   'ระหว่างเปิดม่านยังไม่ถอดรหัสวิดีโอด้านหลังพร้อมกับ WebGL');
ok(opening.hasLogoLayer === false,
   'ระหว่างเปิดม่านไม่มีชั้นโลโก้หรือฉากคั่นซ้อนอยู่');

await page.evaluate(() => window.NORA.apply({ cmd:'deck', arg:'intro' }));
await page.evaluate(() => window.NORA.apply({ cmd:'curtain', at:Date.now() - 3300 }));
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
  progress:window.__CURTAIN3D?.progress,
  playing:window.__CURTAIN3D?.playing,
}));
ok(resetAgain.progress === 0 && resetAgain.playing === false,
   'กดตั้งม่านระหว่างเปิดแล้วหยุดและคืนเฟรมแรก');

await browser.close();
server.close();
if(failures.length){
  console.error(`\nไม่ผ่าน ${failures.length} จุด`);
  process.exit(1);
}
console.log('\nผ่าน — ม่าน Three.js เชื่อมกับ state เดิมครบ');
