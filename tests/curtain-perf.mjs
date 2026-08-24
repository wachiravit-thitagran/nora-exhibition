/**
 * วัด fps ตอนเปิดม่าน — ใช้เทียบก่อน/หลังแก้ ไม่ใช่ข้อสอบ
 *
 *   node tests/curtain-perf.mjs
 *   RATE=12 MODES='&panel=2,&ultra=1' node tests/curtain-perf.mjs
 *
 * ทำไมต้องหน่วง CPU
 *   จอในนิทรรศการเป็นราสเบอร์รีพาย ช้ากว่าเครื่องที่ใช้เขียนงานราวสิบเท่า
 *   ของที่ลื่นบนโน้ตบุ๊กจึงไม่ได้แปลว่าลื่นหน้างาน `Emulation.setCPUThrottlingRate`
 *   หน่วงเมนเธรดให้ช้าลงตามที่สั่ง จะได้เห็นปัญหาก่อนไปเจอที่หน้างาน
 *
 * อ่านผลอย่างไร
 *   ตัวเลขนี้ไม่ใช่ fps ที่จะได้บนพายเป๊ะ ๆ — คอนเทนเนอร์ที่รันเทสต์ไม่มี GPU
 *   วาดด้วยซีพียูล้วน ค่าที่ได้จึงต่ำกว่าของจริง ใช้ **เทียบกันเอง** เท่านั้น
 *   (แก้แล้วดีขึ้นกี่เท่า) ไม่ใช่เอาไปอ้างว่าพายจะได้เท่านี้
 *
 *   ส่วนที่เทียบได้ตรง ๆ คือภาระของเมนเธรด — อนิเมชันที่บังคับให้วาดใหม่
 *   ทุกเฟรมกินเมนเธรดเหมือนกันทุกเครื่อง มี GPU หรือไม่มีก็ตาม
 *
 * ตัวเลขอ้างอิง (หน่วง 12 เท่า จอ 1080p)
 *   ตอนที่ม่านยังเลื่อนลายจีบด้วย background-position   0.4 fps · ค้างยาวสุด 4.7 วิ
 *   หลังตัดออก                                        11-28 fps · ค้างยาวสุด 0.2 วิ
 */
import { chromium } from 'playwright';
import { resolve, join } from 'node:path';

const ROOT  = resolve(process.env.ROOT || process.cwd());
const RATE  = Number(process.env.RATE || 12);
const WIN   = Number(process.env.WIN || 5000);
const VW    = Number(process.env.VW || 1920);
const VH    = Number(process.env.VH || 1080);
const MODES = (process.env.MODES || '&panel=2,&ultra=1,').split(',');

const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
console.log(`หน่วง CPU ${RATE} เท่า · จอ ${VW}x${VH} · วัด ${WIN / 1000} วินาทีต่อรอบ\n`);
console.log('โหมด'.padEnd(12) + 'fps'.padStart(6) + 'p95'.padStart(9) + 'ค้างยาวสุด'.padStart(14));
console.log('─'.repeat(44));

for (const MODE of MODES) {
  const p = await b.newPage({ viewport:{ width:VW, height:VH } });
  const cdp = await p.context().newCDPSession(p);
  await p.goto('file://' + join(ROOT, 'index.html') + '?sync=0&kiosk=1' + MODE,
               { waitUntil:'load' });
  await p.waitForTimeout(1000);
  await p.evaluate(() => window.NORA.apply({ cmd:'deck', arg:'intro' }));
  await p.waitForTimeout(800);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: RATE });
  await p.waitForTimeout(500);

  /* นับ rAF ตลอดหน้าต่างเวลาที่กำหนด แล้วคิด fps จากหน้าต่างนั้น ไม่ใช่จาก
     เฟรมแรก-เฟรมสุดท้าย — ถ้าเฟรมหยุดยิงไปเลย ค่าต้องได้ต่ำตามความจริง
     ไม่ใช่ได้ 60 จากสองเฟรมที่ติดกัน */
  await p.evaluate(w => {
    window.__ts = []; const t0 = performance.now();
    const tick = t => { window.__ts.push(t);
      if (performance.now() - t0 < w) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
    setTimeout(() => window.NORA.apply({ cmd:'curtain' }), 300);
  }, WIN);
  await p.waitForTimeout(WIN + 1500);

  const r = await p.evaluate(w => {
    const ts = window.__ts, g = [];
    for (let i = 1; i < ts.length; i++) g.push(ts[i] - ts[i - 1]);
    g.sort((a, c) => a - c);
    return { fps:+(ts.length / (w / 1000)).toFixed(1),
             p95: g.length ? Math.round(g[Math.floor(g.length * 0.95)]) : -1,
             worst: g.length ? Math.round(g[g.length - 1]) : -1 };
  }, WIN);

  const warn = r.fps < 10 ? '  ← กระตุกจนเห็น' : '';
  console.log((MODE || '16:9').padEnd(12)
    + String(r.fps).padStart(6)
    + (r.p95 + 'ms').padStart(9)
    + (r.worst + 'ms').padStart(12) + warn);
  await p.close();
}
await b.close();
