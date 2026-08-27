/**
 * ตรวจ contract ของม่าน Three.js กับ state เดิมของเด็ค
 *
 *   node tests/check-curtain-three.mjs [รากโฟลเดอร์]
 */
import { readFile } from 'node:fs/promises';
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

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await browser.newPage({ viewport:{ width:1280, height:720 } });
await page.goto('file://' + INDEX + '?sync=0&kiosk=1', { waitUntil:'load' });
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
}));
ok(opening.playing && opening.progress > 0 && opening.progress < 1,
   'คำสั่งเปิดม่านเริ่ม timeline ของ Three.js');
ok(opening.deckPlaying === false,
   'ระหว่างเปิดม่านยังไม่ถอดรหัสวิดีโอด้านหลังพร้อมกับ WebGL');

await page.evaluate(() => window.NORA.apply({ cmd:'deck', arg:'intro' }));
await page.waitForTimeout(100);
const resetAgain = await page.evaluate(() => ({
  progress:window.__CURTAIN3D?.progress,
  playing:window.__CURTAIN3D?.playing,
}));
ok(resetAgain.progress === 0 && resetAgain.playing === false,
   'กดตั้งม่านระหว่างเปิดแล้วหยุดและคืนเฟรมแรก');

await browser.close();
if(failures.length){
  console.error(`\nไม่ผ่าน ${failures.length} จุด`);
  process.exit(1);
}
console.log('\nผ่าน — ม่าน Three.js เชื่อมกับ state เดิมครบ');
