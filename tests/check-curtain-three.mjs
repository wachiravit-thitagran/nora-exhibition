/**
 * ตรวจ contract ของม่าน Three.js กับ state เดิมของเด็ค
 *
 *   node tests/check-curtain-three.mjs [รากโฟลเดอร์]
 */
import { readFile } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
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
ok(html.includes('id="intro-logo-fx"'), 'มีเลเยอร์เอฟเฟกต์โลโก้ AI NORA หลังม่านเปิด');
ok(html.includes('id="intro-logo-video"'), 'มีวิดีโอเฟรมจริงของโลโก้ AI NORA');
ok(html.includes('assets/curtain/ainora-logo-reveal.mp4'), 'ใช้คลิปโลโก้ที่ถอดจากต้นฉบับแบบรายเฟรม');
const logoClip = join(ROOT, 'assets/curtain/ainora-logo-reveal.mp4');
ok(existsSync(logoClip) && statSync(logoClip).size > 100_000,
   'ไฟล์วิดีโอโลโก้ถูกจัดเก็บในชุดจัดแสดง');
const logoVideoTag = html.match(/<video\b[^>]*id="intro-logo-video"[^>]*>/)?.[0] || '';
ok(logoVideoTag && !/\sloop(?:\s|=|>)/.test(logoVideoTag),
   'วิดีโอโลโก้เล่นครั้งเดียวและค้างเฟรมจบ');

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
await page.evaluate(() => window.NORA.apply({ cmd:'curtain', at:Date.now() - 3300 }));
await page.waitForTimeout(300);
const logoReveal = await page.evaluate(() => {
  const fx = document.getElementById('intro-logo-fx');
  const video = document.getElementById('intro-logo-video');
  return {
    active:document.documentElement.classList.contains('logo-reveal'),
    visible:!!fx && Number(getComputedStyle(fx).opacity) > 0,
    playing:!!video && !video.paused,
    currentTime:video?.currentTime || 0,
  };
});
ok(logoReveal.active && logoReveal.visible, 'โลโก้เริ่มแสดงต่อจากจังหวะม่าน');
ok(logoReveal.playing && logoReveal.currentTime > .15,
   'วิดีโอโลโก้เล่นต่อจากเวลาคำสั่งที่เดินทางมาแล้ว');

await page.evaluate(() => window.NORA.apply({ cmd:'deck', arg:'intro' }));
await page.waitForTimeout(100);
const resetAgain = await page.evaluate(() => ({
  progress:window.__CURTAIN3D?.progress,
  playing:window.__CURTAIN3D?.playing,
}));
ok(resetAgain.progress === 0 && resetAgain.playing === false,
   'กดตั้งม่านระหว่างเปิดแล้วหยุดและคืนเฟรมแรก');
ok(await page.evaluate(() => !document.documentElement.classList.contains('logo-reveal')),
   'ตั้งม่านใหม่แล้วยกเลิกเอฟเฟกต์โลโก้รอบก่อน');
ok(await page.evaluate(() => {
  const video = document.getElementById('intro-logo-video');
  return !!video && video.paused && video.currentTime === 0;
}), 'ตั้งม่านใหม่แล้วกรอวิดีโอโลโก้กลับเฟรมแรก');

await browser.close();
if(failures.length){
  console.error(`\nไม่ผ่าน ${failures.length} จุด`);
  process.exit(1);
}
console.log('\nผ่าน — ม่าน Three.js เชื่อมกับ state เดิมครบ');
