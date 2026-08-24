/**
 * กันอนิเมชันที่บังคับให้เบราว์เซอร์วาดใหม่ทุกเฟรม
 *
 *   node tests/check-anim.mjs [รากโฟลเดอร์]
 *
 * ทำไมต้องมี
 *   จอในนิทรรศการเป็นราสเบอร์รีพาย แรงไม่เท่าเครื่องที่ใช้เขียนงาน
 *   อนิเมชันที่ขยับได้เฉพาะ transform กับ opacity คอมโพสิตเตอร์รับไปทำเองได้
 *   ไม่ต้องวาดใหม่เลย ส่วนคุณสมบัติอื่น (background-position · width · left ·
 *   clip-path · filter · box-shadow ฯลฯ) บังคับให้วาดใหม่ทั้งชิ้นทุกเฟรม
 *
 *   ม่านเปิดงานเคยพลาดข้อนี้ — @keyframes cripple เลื่อน background-position
 *   ของผ้าที่กว้างราว 6000×2160px วัดแล้วได้ 0.4 fps บนเครื่องที่หน่วง CPU 12 เท่า
 *   เฟรมค้างยาวสุด 4.7 วินาที พอตัดออกได้ 11-24 fps ค้างยาวสุด 0.2 วินาที
 *
 * เทสต์นี้อ่าน @keyframes ทุกก้อนที่หน้าใช้จริง (ผ่าน CSSOM ไม่ใช่ regex กับ
 * ไฟล์ดิบ) แล้วดูว่าก้อนไหนขยับคุณสมบัติที่ไม่ปลอดภัย และก้อนนั้นถูกใช้กับ
 * ชิ้นที่ใหญ่หรือเปล่า — ชิ้นเล็ก ๆ อย่างจุดไฟกะพริบไม่ต้องห้าม
 */
import { chromium } from 'playwright';
import { resolve, join } from 'node:path';

const ROOT = resolve(process.argv[2] || process.cwd());

/* ขยับได้ฟรี ไม่ต้องวาดใหม่ */
const SAFE = new Set(['transform', 'opacity', 'visibility', 'offset-distance',
                      'animation-timing-function']);
/* ชิ้นที่ใหญ่กว่านี้ (ตร.พิกเซลบนเวทีจริง) ถือว่าแพงพอที่จะกระตุกให้เห็น
   1.2 ล้าน = ราว 1100×1100px — ใหญ่กว่าไอคอนหรือแถบเล็ก ๆ ชัดเจน */
const BIG = 1_200_000;

const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const fails = [];
const notes = [];

for (const [name, qs] of [['48:9 แบ่ง 3', '?ultra=1'], ['16:9', '']]) {
  const p = await b.newPage({ viewport:{ width:1600, height:900 } });
  await p.goto('file://' + join(ROOT, 'index.html') + qs + (qs ? '&' : '?') + 'sync=0&kiosk=1',
               { waitUntil:'load' });
  await p.waitForTimeout(800);
  // เปิดม่านค้างไว้ให้กฎของม่านมีผลจริง จะได้เห็นว่าชิ้นไหนโดนอนิเมชันอะไร
  await p.evaluate(() => {
    window.NORA.apply({ cmd:'deck', arg:'intro' });
    document.getElementById('curtain').classList.add('open');
  });
  await p.waitForTimeout(400);

  const scan = safeList => {
    const safe = new Set(safeList);
    /* รวบรวมว่า @keyframes ชื่อไหนขยับคุณสมบัติอะไรบ้าง */
    const moved = new Map();
    for (const sheet of document.styleSheets) {
      let rules; try { rules = sheet.cssRules; } catch (e) { continue; }
      for (const r of rules) {
        if (r.type !== CSSRule.KEYFRAMES_RULE) continue;
        const props = new Set();
        for (const kf of r.cssRules)
          for (const prop of kf.style) props.add(prop);
        moved.set(r.name, [...props]);
      }
    }
    /* แล้วดูว่าชิ้นไหนกำลังใช้ @keyframes ก้อนนั้นอยู่ และชิ้นนั้นใหญ่แค่ไหน */
    const out = [];
    document.querySelectorAll('*').forEach(el => {
      const cs = getComputedStyle(el);
      const names = cs.animationName;
      if (!names || names === 'none') return;
      for (const n of names.split(',').map(s => s.trim())) {
        const props = moved.get(n);
        if (!props) continue;
        const risky = props.filter(x => !safe.has(x));
        if (!risky.length) continue;
        // ขนาดบนเวทีจริง ไม่ใช่ขนาดหลังย่อลงจอ — offsetWidth ไม่โดน transform ของ #stage
        const area = el.offsetWidth * el.offsetHeight;
        out.push({ sel:el.className || el.tagName.toLowerCase(), anim:n, props:risky, area });
      }
    });
    return out;
  };

  // ดูม่านก่อน แล้วค่อยไล่ทุกหน้าในชุดหลัก — อนิเมชันของสไลด์ผูกกับ .slide.on
  // ถ้าดูแค่หน้าแรกจะพลาดหน้าที่ใช้เอฟเฟกต์อื่น
  const bad = await p.evaluate(scan, [...SAFE]);
  await p.evaluate(() => window.NORA.apply({ cmd:'deck', arg:'main' }));
  await p.waitForTimeout(300);
  const n = await p.evaluate(() => document.querySelectorAll('.slide').length);
  for (let i = 0; i < n; i++) {
    await p.evaluate(k => window.NORA.apply({ cmd:'goto', arg:String(k + 1) }), i);
    await p.waitForTimeout(40);
    bad.push(...await p.evaluate(scan, [...SAFE]));
  }

  for (const x of bad) {
    const line = `${name} · .${String(x.sel).split(' ')[0]} ใช้ @keyframes ${x.anim} `
      + `ขยับ ${x.props.join(', ')} · ขนาด ${(x.area / 1e6).toFixed(1)} ล้านพิกเซล`;
    if (x.area >= BIG) fails.push(line); else notes.push(line);
  }
  await p.close();
}
await b.close();

for (const n of notes) console.log('ผ่าน (ชิ้นเล็ก) ' + n);
for (const f of fails) console.log('พลาด ' + f);
if (fails.length) {
  console.error(`\nไม่ผ่าน ${fails.length} จุด — อนิเมชันบนชิ้นใหญ่ต้องขยับแค่ ${[...SAFE].slice(0,2).join('/')}`);
  console.error('ถ้าจำเป็นจริง ๆ ให้วัด fps บนเครื่องจริงก่อน แล้วค่อยแก้เกณฑ์ที่หัวไฟล์นี้');
  process.exit(1);
}
console.log('\nผ่าน — ไม่มีอนิเมชันบนชิ้นใหญ่ที่บังคับให้วาดใหม่ทุกเฟรม');
