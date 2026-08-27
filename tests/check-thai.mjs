/* ตรวจว่าสระบน + วรรณยุกต์ไทยไม่โดนตัดหัว
   ========================================
   ฟอนต์ Anuphan วางหมึกของสระซ้อนวรรณยุกต์ (ที่ · นิ่ง · เคลื่อน · ครั้ง)
   สูงถึง 1.119 em เหนือเส้นฐาน ขณะที่ ascent ของฟอนต์คือ 1.025 em
   หมึกส่วนบนจึง "ล้นออกนอกกล่องของตัวอักษร" เสมอ

   ปกติไม่เป็นไร เบราว์เซอร์วาดทะลุออกไปได้ แต่จะหายไปจริง ๆ สองกรณี
     1) ตัวมันเองระบายสีด้วย background-clip:text
        พื้นหลังวาดได้แค่ในกล่องตัวเอง หมึกที่ล้นจึงไม่มีสีมาลง
     2) มีบรรพบุรุษที่ overflow:hidden และขอบบนสูงกว่าหมึกที่ล้น

   สคริปต์นี้เดินดูทุก element ในชุดสไลด์ คำนวณว่าหมึกล้นกี่พิกเซล
   แล้วเทียบกับ padding ของตัวเอง / ขอบของกล่องที่ตัด
   ถ้าเจอที่ไหนล้นเกิน = ฟ้อง ไม่ต้องรอให้คนไปเห็นวรรณยุกต์แหว่งหน้างาน */
import { chromium } from 'playwright';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';

const ROOT = process.argv[2] || process.cwd();
const MIME = {'.html':'text/html','.png':'image/png','.jpg':'image/jpeg','.woff2':'font/woff2','.mp4':'video/mp4'};

const srv = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  p = p.startsWith('/exhibition') ? p.slice(11) : p;
  if(p === '/' || p === '') p = '/index.html';
  const f = path.join(ROOT, p);
  if(!fs.existsSync(f) || fs.statSync(f).isDirectory()){ res.writeHead(404); return res.end('nf'); }
  res.writeHead(200, {'Content-Type': MIME[path.extname(f)] || 'application/octet-stream'});
  fs.createReadStream(f).pipe(res);
});
await new Promise(r => srv.listen(0, r));
const base = `http://127.0.0.1:${srv.address().port}/exhibition`;

const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
let bad = 0;

for(const [label, q] of [['16:9', ''], ['48:9 แบ่ง 3', '&ultra=1']]){
  const p = await b.newPage({ viewport:{ width:1920, height:1080 } });
  await p.goto(base + '/index.html?ctrl=0&nomotion=1&sync=0&kiosk=1' + q);
  await p.waitForTimeout(2500);

  const hits = await p.evaluate(() => {
    const INK = 1.119, ASC = 1.025, CONTENT = 1.300;   // เมตริกจริงของ Anuphan-var
    const STACK = /[ัิ-ื็][่-๋์]/;                      // สระบน ตามด้วยวรรณยุกต์
    const TOL = 1.5;                                    // เผื่อ sub-pixel
    const out = [];
    for(const el of document.querySelectorAll('.slide *')){
      const own = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('');
      if(!STACK.test(own)) continue;
      const cs = getComputedStyle(el);
      const fsz = parseFloat(cs.fontSize);
      const lh = cs.lineHeight === 'normal' ? CONTENT * fsz : parseFloat(cs.lineHeight);
      const over = INK * fsz - (ASC * fsz + (lh - CONTENT * fsz) / 2);
      if(over <= TOL) continue;
      const r = el.getBoundingClientRect();
      if(!r.width || !r.height) continue;
      const why = [];

      // 1) ระบายด้วย background-clip:text — padding ของตัวเองต้องคลุมหมึกที่ล้น
      if((cs.webkitBackgroundClip || cs.backgroundClip) === 'text'
         && parseFloat(cs.paddingTop) + TOL < over)
        why.push(`background-clip:text แต่ padding-top ${cs.paddingTop} < หมึกล้น ${Math.round(over)}px`);

      // 2) มีกล่องที่ตัด และขอบบนของมันสูงกว่าหมึกที่ล้น
      let n = el.parentElement;
      while(n && n !== document.documentElement){
        const s = getComputedStyle(n);
        if(s.overflow !== 'visible'){
          const rr = n.getBoundingClientRect();
          if(rr.top > r.top - over + TOL)
            why.push(`ถูก .${(n.className||n.tagName).split(' ').join('.')} ตัด (เหลือที่ ${Math.round(r.top-rr.top)}px แต่หมึกล้น ${Math.round(over)}px)`);
          break;
        }
        n = n.parentElement;
      }
      if(why.length) out.push({
        sel: '.' + String(el.className || el.tagName).split(' ').join('.'),
        text: own.trim().slice(0, 30), fs: Math.round(fsz), why });
    }
    // ยุบให้เหลือแบบละหนึ่ง จะได้อ่านออก
    const seen = new Set(); const uniq = [];
    for(const h of out){ const k = h.sel + '|' + h.why.join(); if(!seen.has(k)){ seen.add(k); uniq.push(h); } }
    return uniq;
  });

  if(hits.length){
    bad += hits.length;
    console.log(`พลาด ${label} — เจอ ${hits.length} จุดที่วรรณยุกต์จะโดนตัด`);
    for(const h of hits) console.log(`     ${h.sel} (${h.fs}px) "${h.text}" — ${h.why.join(' · ')}`);
  } else {
    console.log(`ok   ${label} — สระบนกับวรรณยุกต์ไม่โดนตัดสักจุด`);
  }
  await p.close();
}

await b.close(); srv.close();
console.log(bad ? `\nไม่ผ่าน ${bad} จุด` : '\nผ่านทั้งหมด');
process.exit(bad ? 1 : 0);
