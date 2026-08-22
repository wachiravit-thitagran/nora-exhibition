/**
 * ตรวจสไลด์นิทรรศการแบบ headless — ใช้ใน Jenkins ก่อน build image
 *
 *   node tests/check-deck.mjs [รากโฟลเดอร์ที่จะเสิร์ฟ]
 *
 * ตรวจ 4 อย่างต่อ 1 โหมดการแสดงผล
 *   1. ไม่มี JavaScript error
 *   2. จำนวนสไลด์เท่ากับที่คาดไว้ (EXPECT_SLIDES)
 *   3. ไม่มีการเลื่อนหน้าจอ  scrollHeight == innerHeight, scrollWidth == innerWidth
 *   4. pane ที่ต้องแสดงในโหมดนั้น ถูกแสดงจริง
 *
 * ออก exit code 1 ถ้ามีข้อไหนไม่ผ่าน — Jenkins จะหยุด pipeline เอง
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { chromium } from 'playwright';

const ROOT = resolve(process.argv[2] || process.cwd());
const EXPECT_SLIDES = Number(process.env.EXPECT_SLIDES || 65);

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.mp4': 'video/mp4', '.webm': 'video/webm', '.json': 'application/json',
};

/* เสิร์ฟไฟล์ static ในโฟลเดอร์ ROOT — ไม่พึ่ง dependency ภายนอก */
function serve() {
  const server = createServer(async (req, res) => {
    try {
      const url = decodeURIComponent(req.url.split('?')[0]);
      let p = normalize(join(ROOT, url));
      if (!p.startsWith(ROOT + sep) && p !== ROOT) { res.writeHead(403).end(); return; }
      if ((await stat(p)).isDirectory()) p = join(p, 'index.html');
      const body = await readFile(p);
      res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404).end('not found');
    }
  });
  return new Promise(ok => server.listen(0, '127.0.0.1', () => ok(server)));
}

const MODES = [
  { name: '16:9',        qs: '',          pane: 'pC'  },
  { name: '48:9 ยาว',    qs: '&wall=1',   pane: 'pW'  },
  { name: '48:9 แบ่ง 3', qs: '&ultra=1',  pane: 'pW'  },
  { name: 'จอ 2',        qs: '&panel=2',  pane: null  },  // หน้าไหนก็ได้ ขึ้นกับเวลาที่ซิงก์
];

const server = await serve();
const base = `http://127.0.0.1:${server.address().port}/index.html?nomotion=1&sync=0`;
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
});
const fails = [];

for (const m of MODES) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const errs = [];
  page.on('pageerror', e => errs.push(String(e.message).slice(0, 200)));
  await page.goto(base + m.qs, { waitUntil: 'load' });
  await page.waitForTimeout(1500);

  const r = await page.evaluate(() => {
    const de = document.documentElement;
    const on = document.querySelector('.slide.on');
    return {
      slides: document.querySelectorAll('.slide').length,
      overY: de.scrollHeight - innerHeight,
      overX: de.scrollWidth - innerWidth,
      panes: on ? [...on.querySelectorAll('.pane')].filter(p => p.offsetWidth > 0)
                    .map(p => p.className.replace('pane ', '')) : [],
    };
  });

  const bad = [];
  if (errs.length)                  bad.push(`JS error: ${errs[0]}`);
  if (r.slides !== EXPECT_SLIDES)   bad.push(`สไลด์ ${r.slides} หน้า (คาด ${EXPECT_SLIDES})`);
  if (r.overY > 0)                  bad.push(`เลื่อนแนวตั้งได้ ${r.overY}px`);
  if (r.overX > 0)                  bad.push(`เลื่อนแนวนอนได้ ${r.overX}px`);
  if (!r.panes.length)              bad.push('ไม่มี pane ที่แสดงผล');
  if (m.pane && !r.panes.includes(m.pane))
    bad.push(`ไม่พบ pane ${m.pane} (เห็น ${r.panes.join(',') || 'ไม่มี'})`);

  if (bad.length) { fails.push(`${m.name} — ${bad.join(' · ')}`); console.log(`FAIL  ${m.name}: ${bad.join(' · ')}`); }
  else            { console.log(`ok    ${m.name} — ${r.slides} หน้า, pane ${r.panes.join(',')}`); }
  await page.close();
}

await browser.close();
server.close();

if (fails.length) { console.error(`\nไม่ผ่าน ${fails.length} โหมด`); process.exit(1); }
console.log(`\nผ่านทั้ง ${MODES.length} โหมด (${EXPECT_SLIDES} หน้า)`);
