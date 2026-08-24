/* วัดว่า "สามช่องเล่นพร้อมกันแค่ไหน" เป็นตัวเลข ไม่ใช่ดูด้วยตา

   สองอย่างที่วัด
     1 เวลาในหน้า (t0) ต่างกันกี่ ms — ตัวนี้กำหนดว่าจะพลิกหน้าพร้อมกันไหม
     2 ตำแหน่งวิดีโอต่างกันกี่ ms — ตัวนี้คือสิ่งที่ตาเห็นจริงบนผนัง

   ก่อนแก้: t0 ต่างกันตามจังหวะที่คำสั่งเดินทางไปถึงแต่ละแท็บ แล้วค้างอยู่อย่างนั้น
   ทั้งหน้า (คลิปตั้ง loop ความต่างจึงวนตามไปทุกรอบ ไม่มีอะไรมาดึงกลับ) */
import { chromium } from 'playwright';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { spawn } from 'node:child_process';

const ROOT = process.argv[2] || process.cwd();
const MIME = {'.html':'text/html','.png':'image/png','.jpg':'image/jpeg','.woff2':'font/woff2','.mp4':'video/mp4','.webm':'video/webm'};
const relay = spawn(process.execPath, [path.join(ROOT,'control','server.mjs')],
  { env:{ ...process.env, PORT:'10198' }, stdio:['ignore','ignore','pipe'] });
relay.stderr.on('data', d => process.stderr.write('[relay] ' + d));
await new Promise(r => setTimeout(r, 700));

const srv = http.createServer((req, res) => {
  const p0 = decodeURIComponent(req.url.split('?')[0]);
  if(p0.startsWith('/exhibition/api/')){
    const up = http.request({ host:'127.0.0.1', port:10198, path:req.url, method:req.method, headers:req.headers },
      r2 => { res.writeHead(r2.statusCode, r2.headers); r2.pipe(res); });
    up.on('error', () => { try{ res.writeHead(502); res.end('x'); }catch(e){} });
    res.on('close', () => { try{ up.destroy(); }catch(e){} });
    req.pipe(up); return;
  }
  let p = p0.startsWith('/exhibition') ? p0.slice(11) : p0;
  if(p === '/' || p === '') p = '/index.html';
  const f = path.join(ROOT, p);
  if(!fs.existsSync(f) || fs.statSync(f).isDirectory()){ res.writeHead(404); return res.end('nf'); }
  res.writeHead(200, {'Content-Type': MIME[path.extname(f)] || 'application/octet-stream'});
  fs.createReadStream(f).pipe(res);
});
await new Promise(r => srv.listen(0, r));
const base = `http://127.0.0.1:${srv.address().port}/exhibition`;

const fail = [];
const ok = (c, m) => { console.log((c ? 'ok   ' : 'พลาด ') + m); if(!c) fail.push(m); };

const b = await chromium.launch();
const ctx = await b.newContext({ viewport:{ width:640, height:200 } });
const tabs = [];
for(const p of [1,2,3]){
  const pg = await ctx.newPage();
  pg.on('pageerror', e => fail.push('js error: ' + e.message));
  await pg.goto(`${base}/index.html?group=wall&panel=${p}&kiosk=1`);
  tabs.push(pg);
}
await tabs[0].waitForTimeout(2500);

const cmd = (c, a) => tabs[0].evaluate(async ([api, c, a]) => {
  await fetch(api, { method:'POST', headers:{'content-type':'application/json'},
    body:JSON.stringify({ cmd:c, arg:a, target:'wall' }) });
}, [base + '/api/cmd', c, a]);

/* t0 เป็นเวลาของ performance.now() ซึ่งนับจากตอนแท็บนั้นเปิด เทียบกันตรง ๆ ไม่ได้
   แปลงเป็นเวลาโลกก่อน: Date.now() - (performance.now() - t0) = "หน้านี้เริ่มเมื่อไหร่" */
const startedAt = () => Promise.all(tabs.map(t => t.evaluate(() =>
  ({ slide: NORA.state.slide, at: Date.now() - (performance.now() - t0) }))));
const spread = xs => Math.round(Math.max(...xs) - Math.min(...xs));

await cmd('goto', 30);
await tabs[0].waitForTimeout(1500);
const s1 = await startedAt();
ok(s1.every(x => x.slide === 30), 'ทุกช่องไปหน้า 30 พร้อมกัน');
const skew = spread(s1.map(x => x.at));
ok(skew <= 30, `เวลาเริ่มหน้าห่างกัน ${skew}ms (ต้องไม่เกิน 30ms)`);

/* ตำแหน่งวิดีโอ — วัดจากคลิปในช่องที่มองเห็นของแต่ละแท็บ
   สามแท็บครอปคนละช่องจึงเล่นคนละคลิป เทียบ "เวลาในหน้า" ของแต่ละอันแทน
   คือ currentTime ควรตรงกับ (เวลาในหน้า mod ความยาวคลิป) */
const vidErr = () => Promise.all(tabs.map(t => t.evaluate(() => {
  const off = (performance.now() - t0) / 1000;
  const out = [];
  for(const v of SLIDES[cur].el.querySelectorAll('video')){
    const pn = v.closest('.pane');
    if(pn && pn.offsetWidth === 0) continue;
    if(v.paused || v.readyState < 2 || !isFinite(v.duration) || v.duration <= 0.2) continue;
    let d = v.currentTime - (off % v.duration);
    if(d >  v.duration/2) d -= v.duration;
    if(d < -v.duration/2) d += v.duration;
    out.push(Math.round(Math.abs(d) * 1000));
  }
  return out;
})));

/* คลิปทดสอบยาว 2 วินาที วางลงในช่องที่มองเห็นของทุกแท็บ
   ไม่พึ่ง assets/ จริง ซึ่งไม่ได้อยู่ใน repo (วิดีโองานจริงถูกใส่ตอน build) */
const vinfo = await Promise.all(tabs.map(t => t.evaluate(async () => {
  const pane = [...SLIDES[cur].el.querySelectorAll('.pane')].find(p => p.offsetWidth > 0);
  if(!pane) return { err:'ไม่มี pane ที่มองเห็น' };
  const v = document.createElement('video');
  v.src = 'tests/fixtures/loop2s.webm';
  v.muted = true; v.loop = true; v.playsInline = true;
  v.style.cssText = 'position:absolute;left:0;top:0;width:2px;height:2px;opacity:.01';
  pane.appendChild(v);
  await new Promise(r => {
    if(v.readyState >= 2) return r();
    v.addEventListener('loadeddata', r, { once:true });
    v.addEventListener('error', r, { once:true });
    setTimeout(r, 6000);                      // ห้ามค้างรอตลอดกาลถ้าไฟล์มีปัญหา
  });
  await v.play().catch(()=>{});
  return { rs:v.readyState, err:v.error && v.error.code, dur:+v.duration.toFixed(2) };
})));
console.log('     คลิปทดสอบ: ' + JSON.stringify(vinfo));
await tabs[0].waitForTimeout(4000);        // เพิ่งยัดคลิปเข้าไปกลางหน้า ให้เวลาดึงเข้าที่ก่อน
const e0 = (await vidErr()).flat();
ok(e0.length >= 3, 'มีคลิปให้วัดครบทุกแท็บ');
ok(e0.length > 0 && Math.max(...e0) <= 120,
   `วิดีโอตรงกับจังหวะของหน้า ห่างมากสุด ${Math.max(...e0)}ms (ต้องไม่เกิน 120ms)`);

// จงใจดันวิดีโอของแท็บกลางให้เพี้ยน แล้วดูว่าระบบดึงกลับเองไหม
// เดิมไม่มีอะไรมาดึง คลิปตั้ง loop ไว้ ความต่างจึงวนตามไปจนหมดหน้า
await tabs[1].evaluate(() => {
  for(const v of SLIDES[cur].el.querySelectorAll('video')){
    const pn = v.closest('.pane');
    if(pn && pn.offsetWidth === 0) continue;
    try{ v.currentTime = (v.currentTime + v.duration - 0.40) % v.duration; }catch(e){}
  }
});
/* ระหว่างกระโดด readyState ตกต่ำกว่า 2 ชั่วครู่ วัดตอนนั้นจะได้อาเรย์ว่าง
   ต้องวนรออ่านจนกว่าจะมีค่า ไม่งั้นข้อทดสอบจะพลาดแบบสุ่มโดยไม่ได้แปลว่าโค้ดพัง */
let eBad = [];
for(let i = 0; i < 12 && !eBad.length; i++){
  await tabs[0].waitForTimeout(80);
  eBad = (await vidErr())[1];
}
ok(eBad.length > 0 && Math.max(...eBad) > 250,
   `ดันให้เพี้ยนแล้ววัดได้จริงว่าเพี้ยน (${eBad.length ? Math.max(...eBad) : 'วัดไม่ได้'}ms)`);
await tabs[0].waitForTimeout(4000);
const e1 = (await vidErr()).flat();
ok(e1.length >= 3 && Math.max(...e1) <= 120,
   `ปล่อยไว้ 4 วินาที ระบบดึงกลับเข้าที่เอง (เหลือ ${e1.length ? Math.max(...e1) : '?'}ms)`);

/* คำสั่งพก at มาด้วย จอต้องนับเวลาในหน้าจาก at ไม่ใช่จากตอนที่คำสั่งมาถึง
   ทดสอบตรง ๆ ด้วยการยิงคำสั่งที่ "ออกจากรีเลย์มาแล้ว 400ms" เข้าไป
   (บน loopback คำสั่งถึงเกือบทันที ความต่างจริงจึงวัดไม่ออก ต้องจำลองเอา)

   ค่าที่วัดคือ "หน้านี้เริ่มเมื่อไหร่ในเวลาโลก" ต้องเท่ากับเวลาที่คำสั่งออกจากรีเลย์
   ไม่ใช่เวลาที่จอได้รับ — เทียบกับ at ที่ส่งไป ไม่ใช่กับ Date.now() ตอนอ่านค่า */
const sentAt = await tabs[0].evaluate(() => {
  const at = Date.now() - 400;
  window.NORA.apply({ cmd:'goto', arg:12, at });
  return at;
});
await tabs[0].waitForTimeout(300);
const lagged = await tabs[0].evaluate(() => Date.now() - (performance.now() - t0));
const lagErr = Math.round(Math.abs(sentAt - lagged));
ok(lagErr <= 60, `คำสั่งที่เดินทางมา 400ms ถูกหักออกให้ตรง (คลาดเคลื่อน ${lagErr}ms)`);

/* กดตรงกับเครื่องอื่นแล้วต้องเข้าที่ทันที ไม่ใช่รอเปลี่ยนหน้า */
await cmd('sync');
await tabs[0].waitForTimeout(1200);
const s2 = await startedAt();
ok(s2.every(x => x.slide === s2[0].slide), 'กดตรงกับเครื่องอื่น — ทุกช่องมาอยู่หน้าเดียวกันทันที');
ok(await tabs[0].evaluate(() => NORA.state.sync) === true, 'กลับเข้าโหมดตามนาฬิกาแล้ว');
const skew2 = spread(s2.map(x => x.at));
ok(skew2 <= 30, `หลังกดตรงกับเครื่องอื่น เวลาเริ่มหน้าห่างกัน ${skew2}ms`);

/* ม่านต้องรูดพร้อมกัน — เทียบ progress ของอนิเมชันกลางคัน */
await cmd('deck', 'intro');
await tabs[0].waitForTimeout(1200);
await cmd('curtain');
await tabs[0].waitForTimeout(1600);            // อยู่กลางอนิเมชัน 4.2 วิ
const pos = await Promise.all(tabs.map(t => t.evaluate(() => {
  const el = document.querySelector('#curtain .cpanel.l');
  const m = new DOMMatrixReadOnly(getComputedStyle(el).transform);
  return m.m41;                                 // ระยะที่ม่านซ้ายรูดไปแล้ว (px)
})));
const cs = Math.round(Math.max(...pos) - Math.min(...pos));
ok(cs <= 60, `ม่านสามช่องรูดไปพร้อมกัน ต่างกัน ${cs}px จากเวทีกว้าง 11520px`);

await b.close(); srv.close(); relay.kill();
console.log(fail.length ? `\nไม่ผ่าน ${fail.length} ข้อ` : '\nผ่านทั้งหมด');
process.exit(fail.length ? 1 : 0);
