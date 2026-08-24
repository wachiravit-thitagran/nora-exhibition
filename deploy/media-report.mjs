/**
 * รายงานว่ายังขาดภาพ/วิดีโอตรงไหนบ้าง
 *
 *   node deploy/media-report.mjs [รากโฟลเดอร์]
 *
 * เปิดสไลด์จริงด้วย Playwright ทีละโหมด ทีละหน้า แล้วเทียบว่าไฟล์ที่หน้านั้น
 * เรียกหา มีอยู่ใน assets/ จริงหรือเปล่า — ไม่ได้ไล่เดาจากโค้ด จึงตรงกับที่
 * คนดูเห็นบนจอเสมอ แม้จะมีการเพิ่มหน้าใหม่ทีหลัง
 *
 * วิธีเก็บข้อมูล
 *   ดักที่ชั้นเน็ตเวิร์กแล้วตอบ 404 ให้ทุกไฟล์ สื่อทุกชิ้นจึงกลายเป็นกล่อง
 *   "อยู่ระหว่างจัดเตรียม" ครบทุกชิ้นในรอบเดียว ได้ทั้งชื่อไฟล์ (จาก ?dev=1
 *   ที่พิมพ์ path ไว้ในกล่อง) และหน้าที่มันอยู่ พร้อมกัน
 *
 *   อ่านจาก DOM ตรง ๆ ไม่ได้ เพราะ attachFallback เอากล่องมาแทนโหนดเดิม
 *   ในจังหวะเดียวกับที่สร้าง DOM — data-srcs หายไปก่อนที่จะตามอ่านทัน
 *
 * ออก exit 0 เสมอ นี่คือรายงาน ไม่ใช่ข้อสอบ — สื่อยังไม่ครบไม่ใช่ความผิดพลาด
 * ของโค้ด (ใส่ --strict ถ้าอยากให้ CI ตกเมื่อมีสื่อขาด)
 */
import { chromium } from 'playwright';
import { readdirSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';

const ROOT   = resolve(process.argv.find(a => !a.startsWith('-') && a !== process.argv[0]
                       && !a.endsWith('media-report.mjs')) || process.cwd());
const STRICT = process.argv.includes('--strict');

/* ---- ไฟล์ที่มีอยู่จริง ---- */
const have = new Set();
const adir = join(ROOT, 'assets');
if (existsSync(adir)) {
  for (const d of readdirSync(adir, { withFileTypes:true })) {
    if (!d.isDirectory()) continue;
    for (const f of readdirSync(join(adir, d.name))) {
      if (f !== '.gitkeep') have.add(`assets/${d.name}/${f}`);
    }
  }
}

/* ---- เดินดูทุกหน้าทุกโหมด ---- */
const MODES = [['จอ 1', '&panel=1'], ['จอ 2', '&panel=2'], ['จอ 3', '&panel=3'],
               ['16:9', ''], ['48:9 แบ่ง 3', '&ultra=1'], ['48:9 ยาว', '&wall=1']];
const at   = new Map();        // ชื่อไฟล์ (หรือกลุ่ม) -> Set(เลขหน้า) — ใช้บอกว่าอยู่หน้าไหน
const askd = new Set();        // ทุก path ที่สไลด์ยิงขอจริง — ใช้นับจำนวนไฟล์ที่ต้องเติม
let titles = [];

const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
for (const [, qs] of MODES) {
  const p = await b.newPage({ viewport:{ width:1600, height:900 } });
  await p.route('**/assets/**', r => {
    askd.add(decodeURIComponent(r.request().url())
      .replace(/^.*?(assets\/)/, '$1').split('?')[0]);
    r.fulfill({ status:404, body:'' });
  });
  await p.goto('file://' + join(ROOT, 'index.html') + '?dev=1&nomotion=1&sync=0' + qs,
               { waitUntil:'load' });
  await p.waitForTimeout(1200);
  const n = await p.evaluate(() => document.querySelectorAll('.slide').length);
  if (!titles.length) titles = await p.evaluate(() =>
    [...document.querySelectorAll('.slide')].map(el => {
      const h = el.querySelector('.title,h1,h2,.t');
      return (h ? h.textContent : '').replace(/\s+/g, ' ').trim();
    }));
  for (let i = 0; i < n; i++) {
    await p.evaluate(k => window.NORA.apply({ cmd:'goto', arg:String(k + 1) }), i);
    await p.waitForTimeout(90);
    const files = await p.evaluate(() => {
      const on = document.querySelector('.slide.on');
      if (!on) return [];
      // pane ที่ซ่อนอยู่ในโหมดนี้ไม่นับ ไม่งั้นจะรายงานของที่คนดูไม่เห็น
      const vis = el => { const pn = el.closest('.pane'); return !pn || pn.offsetWidth > 0; };
      const out = [...on.querySelectorAll('.ph-box code')].filter(vis)
        .map(c => c.textContent.trim() || '(หน้านี้ตั้งใจเว้นไว้ — ยังไม่มีภาพที่ตรงกับท่าในหนังสือ)');
      // เฟรมท่ารำใช้กล่องอีกแบบที่ไม่พิมพ์ path
      out.push(...[...on.querySelectorAll('.newmark')].filter(vis)
        .filter(el => /อยู่ระหว่างจัดเตรียม/.test(el.textContent))
        .map(() => 'assets/poses/ (เฟรมท่ารำที่ตัดจากวิดีโอ)'));
      return out;
    });
    for (const f of files) {
      const k = decodeURIComponent(f).replace(/^.*?(assets\/)/, '$1');
      if (have.has(k)) continue;
      if (!at.has(k)) at.set(k, new Set());
      at.get(k).add(i + 1);
    }
  }
  await p.close();
}
await b.close();

/* ---- สรุป ---- */
const bySlide = new Map();
for (const [f, ss] of at) for (const s of ss) {
  if (!bySlide.has(s)) bySlide.set(s, new Set());
  bySlide.get(s).add(f.startsWith('assets/') ? f.split('/')[1] : 'อื่น ๆ');
}
const pad = (s, n) => { s = String(s); let w = 0;
  for (const c of s) w += /[ัิ-ฺ็-๎]/.test(c) ? 0 : 1;
  return s + ' '.repeat(Math.max(0, n - w)); };

if (!bySlide.size) {
  console.log('สื่อครบทุกหน้าแล้ว — ไม่มีหน้าไหนขึ้นกล่อง "อยู่ระหว่างจัดเตรียม"');
} else {
  console.log(`ยังขาดสื่อ ${bySlide.size} หน้า จาก ${titles.length} หน้า\n`);
  console.log(pad('หน้า', 6) + pad('ชื่อหน้า', 40) + 'ยังขาด');
  console.log('─'.repeat(66));
  for (const s of [...bySlide.keys()].sort((x, y) => x - y))
    console.log(pad(s, 6) + pad((titles[s - 1] || '').slice(0, 38), 40)
                + [...bySlide.get(s)].sort().join(', '));

  // นับจากที่ยิงขอจริง ไม่ใช่จากตารางข้างบน — เฟรมท่ารำหลายสิบไฟล์ใช้กล่องแบบ
  // ที่ไม่พิมพ์ path ถ้านับจากตารางจะเหลือบรรทัดเดียวทั้งที่ขาดหลายไฟล์
  const need = [...askd].filter(f => !have.has(f)).sort();
  const byDir = new Map();
  for (const f of need) {
    const d = f.split('/')[1];
    byDir.set(d, (byDir.get(d) || 0) + 1);
  }
  console.log('\nไฟล์ที่ต้องเติม');
  for (const [d, c] of [...byDir].sort())
    console.log(`  assets/${pad(d + '/', 12)} ${c} ไฟล์`);
  console.log('\nรายชื่อไฟล์');
  for (const f of need) console.log('  ' + f);
}
process.exit(STRICT && bySlide.size ? 1 : 0);
