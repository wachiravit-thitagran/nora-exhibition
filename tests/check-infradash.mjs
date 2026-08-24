/* ทดสอบจอวนแดชบอร์ด /infradash

   ข้อสำคัญที่สุดคือ "ตรวจจับหน้าที่ถูกปฏิเสธการฝังได้จริงไหม"
   เพราะ ifdash.psu.ac.th อยู่คนละ origin กับ ainora.psu.ac.th
   ถ้าปลายทางส่ง X-Frame-Options หรือ CSP frame-ancestors มา เฟรมจะว่างเปล่า
   โดยไม่มี error ให้จับ — จอหน้างานจะขึ้นเป็นช่องดำเฉย ๆ แล้วไม่มีใครรู้ว่าทำไม

   จึงจำลองเซิร์ฟเวอร์ปลายทางขึ้นมาสามแบบ: ฝังได้ · โดน CSP · โดน XFO
   แล้วดูว่าหน้าเว็บแยกออกและขึ้นคำอธิบายที่ถูกต้อง                        */
import { chromium } from 'playwright';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { spawn } from 'node:child_process';

const ROOT = process.argv[2] || process.cwd();

/* ---- เซิร์ฟเวอร์ "ปลายทาง" จำลอง ifdash (คนละพอร์ต = คนละ origin) ---- */
const page = (title, extra) => (req, res) => {
  const body = `<!doctype html><meta charset="utf-8"><title>${title}</title>
    <body style="margin:0;background:#123;color:#fff;font:20px sans-serif">
    <div id="who" style="padding:40px">${title}</div>`;
  res.writeHead(200, { 'content-type':'text/html; charset=utf-8', ...extra });
  res.end(body);
};
const far = http.createServer((req, res) => {
  const p = req.url.split('?')[0];
  if(p === '/ok1')  return page('ฝังได้ 1', {})(req, res);
  if(p === '/ok2')  return page('ฝังได้ 2', {})(req, res);
  if(p === '/csp')  return page('โดน CSP', { 'content-security-policy':"frame-ancestors 'none'" })(req, res);
  if(p === '/xfo')  return page('โดน XFO', { 'x-frame-options':'DENY' })(req, res);
  if(p === '/slow'){ setTimeout(() => page('ช้ามาก', {})(req, res), 60000); return; }
  res.writeHead(404); res.end('nf');
});
await new Promise(r => far.listen(0, r));
const FAR = `http://127.0.0.1:${far.address().port}`;

/* ---- รีเลย์จริง (ตัวเดียวกับที่ /exhibition ใช้) ----
   ต้องบอกให้ยอมยิงไปโฮสต์ปลายทางจำลองด้วย ไม่งั้น /probe จะตอบ 403 */
const relay = spawn(process.execPath, [path.join(ROOT, 'control', 'server.mjs')],
  { env:{ ...process.env, PORT:'10199', PROBE_HOSTS:'127.0.0.1' }, stdio:['ignore','ignore','pipe'] });
relay.stderr.on('data', d => process.stderr.write('[relay] ' + d));
await new Promise(r => setTimeout(r, 700));

/* ---- เซิร์ฟเวอร์ที่โฮสต์ /infradash เอง ---- */
const own = http.createServer((req, res) => {
  if(req.url.startsWith('/infradash/api/')){
    const up = http.request({ host:'127.0.0.1', port:10199, path:req.url,
      method:req.method, headers:req.headers },
      r2 => { res.writeHead(r2.statusCode, r2.headers); r2.pipe(res); });
    up.on('error', () => { try{ res.writeHead(502); res.end('x'); }catch(e){} });
    res.on('close', () => { try{ up.destroy(); }catch(e){} });
    req.pipe(up); return;
  }
  let p = decodeURIComponent(req.url.split('?')[0]);
  if(p === '/infradash' || p === '/infradash/') p = '/infradash/index.html';
  const f = path.join(ROOT, p);
  if(!fs.existsSync(f) || fs.statSync(f).isDirectory()){ res.writeHead(404); return res.end('nf'); }
  res.writeHead(200, { 'content-type':'text/html; charset=utf-8' });
  fs.createReadStream(f).pipe(res);
});
await new Promise(r => own.listen(0, r));
const OWN = `http://127.0.0.1:${own.address().port}`;

const fail = [];
const ok = (c, m) => { console.log((c ? 'ok   ' : 'พลาด ') + m); if(!c) fail.push(m); };

const b = await chromium.launch();
const pg = await b.newPage({ viewport:{ width:1280, height:720 } });
pg.on('pageerror', e => fail.push('js error: ' + e.message));

const urls = [`${FAR}/ok1`, `${FAR}/csp`, `${FAR}/ok2`, `${FAR}/xfo`].join(',');
await pg.goto(`${OWN}/infradash/?sync=0&dwell=3&nomotion=1&urls=${encodeURIComponent(urls)}`);
await pg.waitForTimeout(2000);

const S = () => pg.evaluate(() => window.INFRA.state);

/* ---- หน้าที่ฝังได้ ---- */
let s = await S();
ok(s.page === 1 && s.total === 4, `เริ่มที่หน้า 1 จาก 4 (ได้ ${s.page}/${s.total})`);
ok(s.blocked === false, 'หน้าที่ปลายทางยอมให้ฝัง — ไม่ขึ้นการ์ดแจ้งเตือน');
ok(await pg.evaluate(() => {
  const fr = document.querySelector('.scrbox.on iframe');
  try{ fr.contentWindow.location.href; return false; }catch(e){ return true; }
}), 'เฟรมที่โหลดสำเร็จอ่าน location ไม่ได้ (ข้าม origin จริง)');

/* ---- หน้าที่โดน CSP frame-ancestors ---- */
await pg.evaluate(() => window.INFRA.goto(2));
await pg.waitForTimeout(1800);
s = await S();
ok(s.page === 2, 'ไปหน้า 2 แล้ว');
ok(s.blocked === true, 'หน้าที่โดน CSP frame-ancestors — ตรวจจับได้ว่าฝังไม่ได้');
const txt = await pg.textContent('.scrbox.on .err');
ok(/ฝังหน้านี้ไม่ได้/.test(txt), 'ขึ้นหัวข้อบอกว่าฝังไม่ได้ ไม่ใช่ปล่อยจอว่าง');
ok(/frame-ancestors/.test(txt), 'บอกชื่อ header ที่เป็นต้นเหตุ');
ok(txt.includes('/csp'), 'บอก URL ของหน้าที่มีปัญหา');
ok(/add_header Content-Security-Policy/.test(txt), 'บอกวิธีแก้เป็นบรรทัด nginx ที่ก๊อปไปใช้ได้เลย');

/* ---- หน้าที่โดน X-Frame-Options ---- */
await pg.evaluate(() => window.INFRA.goto(4));
await pg.waitForTimeout(1800);
s = await S();
ok(s.blocked === true, 'หน้าที่โดน X-Frame-Options — ตรวจจับได้เหมือนกัน');

/* ---- กลับมาหน้าที่ฝังได้ การ์ดต้องหายไป ---- */
await pg.evaluate(() => window.INFRA.goto(3));
await pg.waitForTimeout(1800);
s = await S();
ok(s.blocked === false, 'กลับมาหน้าที่ฝังได้ — การ์ดแจ้งเตือนหายไป ไม่ค้าง');

/* ---- จุดสีในแถบล่างต้องบอกว่าหน้าไหนมีปัญหา ---- */
const dots = await pg.evaluate(() =>
  [...document.querySelectorAll('#dots .dot')].map(d => d.classList.contains('bad')));
ok(dots[1] === true && dots[3] === true, 'จุดของหน้าที่ฝังไม่ได้ถูกทำเครื่องหมายไว้');
ok(dots[0] === false && dots[2] === false, 'จุดของหน้าที่ปกติไม่ถูกทำเครื่องหมาย');

/* ---- ตัว /probe เองตอบถูกต้องไหม ---- */
const probe = async (u2, as) => pg.evaluate(async ([api, u2, as]) => {
  const r = await fetch(`${api}/probe?url=${encodeURIComponent(u2)}&as=${encodeURIComponent(as)}`);
  return { status:r.status, body:await r.json() };
}, [`${OWN}/infradash/api`, u2, as || OWN]);

let pr = await probe(`${FAR}/ok1`);
ok(pr.body.framable === true, 'probe: หน้าที่ไม่มี header ห้าม → ฝังได้');
pr = await probe(`${FAR}/csp`);
ok(pr.body.framable === false, 'probe: frame-ancestors none → ฝังไม่ได้');
ok(/frame-ancestors/.test(pr.body.csp || ''), 'probe: ส่งค่า header จริงกลับมาให้วินิจฉัย');
pr = await probe(`${FAR}/xfo`);
ok(pr.body.framable === false, 'probe: X-Frame-Options DENY → ฝังไม่ได้');
ok(/deny/i.test(pr.body.xfo || ''), 'probe: ส่งค่า X-Frame-Options กลับมาด้วย');
pr = await probe('https://example.com/');
ok(pr.status === 403, 'probe: โฮสต์นอกรายการที่อนุญาตถูกปฏิเสธ (ได้ ' + pr.status + ')');

/* ---- วนหน้าเองตามเวลา ---- */
await pg.evaluate(() => window.INFRA.goto(1));
await pg.waitForTimeout(500);
const before = (await S()).page;
await pg.waitForTimeout(3600);            // dwell 3 วิ + เผื่อ
const after = (await S()).page;
ok(after === before + 1, `ครบเวลาแล้ววนไปหน้าถัดไปเอง (${before} → ${after})`);

/* ---- โหลดหน้าถัดไปไว้ล่วงหน้า ไม่ให้จอขาวตอนสลับ ---- */
ok(await pg.evaluate(() => {
  const boxes = [...document.querySelectorAll('.scrbox')];
  const back = boxes.find(x => !x.classList.contains('on'));
  return !!(back && back.querySelector('iframe').src);
}), 'ช่องสำรองมีหน้าถัดไปโหลดรออยู่แล้ว (สลับแล้วไม่เห็นจอขาว)');

/* ---- ปุ่มหยุด/เล่น ---- */
await pg.keyboard.press('Space');
await pg.waitForTimeout(300);
ok((await S()).playing === false, 'กด space แล้วหยุดวน');
const held = (await S()).page;
await pg.waitForTimeout(4200);
ok((await S()).page === held, 'หยุดแล้วไม่วนต่อเอง');
await pg.keyboard.press('Space');
await pg.waitForTimeout(300);
ok((await S()).playing === true, 'กด space อีกทีเล่นต่อ');

/* ---- นาฬิกากลาง: สองจอเปิดคนละเวลาต้องอยู่หน้าเดียวกัน ---- */
const two = await Promise.all([0, 1].map(async () => {
  const p2 = await b.newPage({ viewport:{ width:800, height:450 } });
  await p2.goto(`${OWN}/infradash/?dwell=6&nomotion=1&urls=${encodeURIComponent(urls)}`);
  await p2.waitForTimeout(1500);
  return p2;
}));
await two[0].waitForTimeout(1200);        // เปิดห่างกัน แล้วต้องยังตรงกัน
const pages = await Promise.all(two.map(p => p.evaluate(() => window.INFRA.state.page)));
ok(pages[0] === pages[1], `สองจอเปิดคนละเวลา อยู่หน้าเดียวกัน (${pages.join(' กับ ')})`);
ok(await two[0].evaluate(() => window.INFRA.state.sync) === true, 'ค่าเริ่มต้นคือตามนาฬิกากลาง');
for(const p of two) await p.close();

/* ---- หน้าที่ไม่ตอบเลย ต้องไม่ทำให้จอค้าง ---- */
const pg2 = await b.newPage({ viewport:{ width:900, height:500 } });
pg2.on('pageerror', e => fail.push('js error 2: ' + e.message));
/* หน้าหลักจะไม่ยิง event load ตราบใดที่เฟรมลูกยังโหลดค้าง จึงรอแค่ domcontentloaded
   (ถ้ารอ load จะ timeout ทั้งที่หน้าเว็บทำงานถูกต้องแล้ว) */
await pg2.goto(`${OWN}/infradash/?sync=0&dwell=3&nomotion=1&urls=${encodeURIComponent(`${FAR}/slow,${FAR}/ok1`)}`,
  { waitUntil:'domcontentloaded' });
await pg2.waitForTimeout(4200);
ok(await pg2.evaluate(() => window.INFRA.state.page) === 2,
   'หน้าที่ปลายทางไม่ตอบ — จอยังวนไปหน้าถัดไปตามเวลา ไม่ค้างรอ');
await pg2.close();

await b.close(); own.close(); far.close(); relay.kill();
if(fail.length){ console.log('\n--- รายการที่ไม่ผ่าน ---'); fail.forEach(f => console.log('  ' + f)); }
console.log(fail.length ? `\nไม่ผ่าน ${fail.length} ข้อ` : '\nผ่านทั้งหมด');
process.exit(fail.length ? 1 : 0);
