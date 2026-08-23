/* ทดสอบ controller ครบวง — เปิดจอ 2 บาน + หน้า controller จริง
   แล้วสั่งจากหน้า controller ดูว่าจอขยับตามและรายงานสถานะกลับ

   โมเดลคือ "หนึ่งเครื่อง = หนึ่งชื่อจอ" — controller คุมทีละจอ
   ต้องกรอก (หรือกดเลือก) ชื่อจอก่อน ปุ่มสั่งงานถึงจะโผล่ */
import { chromium } from 'playwright';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { spawn } from 'node:child_process';

const ROOT = process.argv[2] || process.cwd();
const MIME = {'.html':'text/html','.png':'image/png','.jpg':'image/jpeg','.woff2':'font/woff2','.mp4':'video/mp4'};

// รีเลย์จริง
const relay = spawn(process.execPath, [path.join(ROOT,'control','server.mjs')],
  { env:{ ...process.env, PORT:'10197', CONTROL_TOKEN:'t0ken' }, stdio:['ignore','pipe','pipe'] });
relay.stdout.on('data', d => process.stdout.write('[relay] ' + d));
relay.stderr.on('data', d => process.stderr.write('[relay] ' + d));
await new Promise(r => setTimeout(r, 700));

// nginx จำลอง: static + proxy /exhibition/api/ ไปรีเลย์
const srv = http.createServer((req, res) => {
  const p0 = decodeURIComponent(req.url.split('?')[0]);
  if(p0.startsWith('/exhibition/api/')){
    const opt = { host:'127.0.0.1', port:10197, path:req.url, method:req.method, headers:req.headers };
    const up = http.request(opt, r2 => { res.writeHead(r2.statusCode, r2.headers); r2.pipe(res); });
    up.on('error', () => { try{ res.writeHead(502); res.end('bad'); }catch(e){} });
    // ลูกค้าปิดเบราว์เซอร์ = ต้องตัดสายฝั่ง upstream ด้วย ไม่งั้นรีเลย์ยังนึกว่าจอต่ออยู่
    // (nginx จริงทำให้อยู่แล้ว ที่นี่เป็น proxy ของเล่นจึงต้องเขียนเอง)
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
const port = srv.address().port;
const base = `http://127.0.0.1:${port}/exhibition`;

const fail = [];
const ok = (c, m) => { console.log((c ? 'ok   ' : 'พลาด ') + m); if(!c) fail.push(m); };

const b = await chromium.launch();
const mk = async q => { const pg = await b.newPage({ viewport:{width:900,height:520} });
  pg.on('pageerror', e => fail.push('js error: ' + e.message));
  await pg.goto(base + '/index.html' + q); await pg.waitForTimeout(1500); return pg; };

// ---- ชื่อจอมาจาก ?screen= อย่างเดียว ไม่ผูกกับโหมด ----
// ใส่ ?ctrl=0 ไม่ให้สองบานนี้ไปรายงานตัวกับรีเลย์ ไม่งั้นจะค้างเป็นจอชื่อ main
// ในรายการ แล้วไปทำให้ข้อที่นับจำนวนจอด้านล่างเพี้ยน
const dflt = await mk('?sync=0&ctrl=0');
ok(await dflt.evaluate(() => window.NORA.id) === 'main', 'ไม่ใส่ ?screen= ได้ชื่อ main');
const ultra = await mk('?ultra=1&sync=0&ctrl=0');
ok(await ultra.evaluate(() => window.NORA.id) === 'main', '48:9 ก็ยังชื่อ main — ชื่อไม่ผูกกับโหมด');
await dflt.close(); await ultra.close();

const s1 = await mk('?screen=hall-a&panel=1&sync=0');
const s2 = await mk('?screen=hall-b&panel=3&sync=0');
const ctl = await b.newPage({ viewport:{width:420,height:900} });
ctl.on('pageerror', e => fail.push('ctl js error: ' + e.message));
await ctl.goto(base + '/control.html');
await ctl.fill('#tok', 't0ken');
await ctl.waitForTimeout(1800);

const conn = await ctl.textContent('#conn');
ok(/จอออนไลน์ 2/.test(conn), 'controller เห็นจอครบ 2 จอ — "' + conn.trim() + '"');

// ---- ยังไม่เลือกจอ ปุ่มสั่งงานต้องยังไม่โผล่ ----
ok(!(await ctl.isVisible('#ctl')), 'ยังไม่เลือกจอ — ปุ่มสั่งงานยังไม่โผล่');
ok(await ctl.isVisible('#pick'),  'ยังไม่เลือกจอ — ขึ้นช่องกรอกชื่อจอ');

const slideOf = pg => pg.evaluate(() => window.NORA.state.slide);
const before1 = await slideOf(s1), before2 = await slideOf(s2);

// ---- กรอกชื่อจอเข้าควบคุม ----
await ctl.fill('#sid', 'hall-a');
await ctl.click('#enter');
await ctl.waitForTimeout(400);
ok(await ctl.isVisible('#ctl'), 'กรอกชื่อจอแล้ว — ปุ่มสั่งงานโผล่');
ok((await ctl.textContent('#nowId')).trim() === 'hall-a', 'การ์ดบนบอกว่ากำลังคุมจอ hall-a');

await ctl.click('button[data-cmd="next"]'); await ctl.waitForTimeout(900);
ok(await slideOf(s1) === before1 + 1, 'สั่ง next — hall-a ขยับ');
ok(await slideOf(s2) === before2,     'สั่ง next — hall-b ไม่ขยับ (คุมทีละจอ)');

await ctl.fill('#n', '5'); await ctl.click('#go'); await ctl.waitForTimeout(900);
ok(await slideOf(s1) === 5, 'สั่ง goto 5 — hall-a ไปหน้า 5');

// ---- กดเลือกจากรายการจอเพื่อสลับไปคุมอีกจอ ----
await ctl.click('#list button[data-pick="hall-b"]'); await ctl.waitForTimeout(400);
ok((await ctl.textContent('#nowId')).trim() === 'hall-b', 'กดจากรายการจอแล้วสลับมาคุม hall-b');
await ctl.click('button[data-cmd="toggle"]'); await ctl.waitForTimeout(700);
ok(await s2.evaluate(() => window.NORA.state.playing) === false, 'สั่ง toggle — hall-b หยุด');
ok(await s1.evaluate(() => window.NORA.state.playing) === true,  'สั่ง toggle — hall-a ยังเล่น');

// ---- สถานะกลับมาถึง controller ----
await ctl.waitForTimeout(1200);
const list = await ctl.textContent('#list');
ok(/hall-a/.test(list) && /hall-b/.test(list), 'controller เห็นสถานะทั้งสองจอ');
ok(/หน้า 5/.test(list), 'controller เห็นเลขหน้าที่อัปเดตแล้ว');

// ---- เปลี่ยนจอ กลับไปหน้ากรอกชื่อ ----
await ctl.click('#leave'); await ctl.waitForTimeout(300);
ok(await ctl.isVisible('#pick') && !(await ctl.isVisible('#ctl')), 'กดเปลี่ยนจอ — กลับไปหน้ากรอกชื่อ');

// ---- เปิดหน้า controller พร้อม ?screen= แล้วเข้าคุมได้เลย (ทำ QR ติดข้างเครื่อง) ----
const ctl2 = await b.newPage({ viewport:{width:420,height:900} });
ctl2.on('pageerror', e => fail.push('ctl2 js error: ' + e.message));
await ctl2.goto(base + '/control.html?screen=hall-b');
await ctl2.waitForTimeout(1200);
ok((await ctl2.textContent('#nowId')).trim() === 'hall-b'
   && await ctl2.isVisible('#ctl'), 'เปิดด้วย ?screen=hall-b เข้าคุมให้เลย');

// ---- สั่งได้ทุกอย่าง: โหมด wall · เส้นแบ่งจอ · ปุ่มไฮไลต์ตามสถานะจริง ----
await ctl2.fill('#tok', 't0ken');
await ctl2.click('[data-cmd="mode"][data-arg="wall"]'); await ctl2.waitForTimeout(800);
ok(await s2.evaluate(() => document.documentElement.classList.contains('wall')),
   'สั่งโหมด 48:9 ยาว (wall) จากมือถือได้ — เดิมมีแต่ ?wall=1');
await ctl2.click('[data-cmd="seam"]'); await ctl2.waitForTimeout(800);
ok(await s2.evaluate(() => document.documentElement.classList.contains('seam')),
   'สั่งเปิดเส้นแบ่งจอได้ — เดิมมีแต่ ?seam=1');
await ctl2.waitForTimeout(1400);
ok(await ctl2.evaluate(() => document.querySelector('[data-cmd="seam"]').classList.contains('on')),
   'ปุ่มไฮไลต์ตามสถานะที่จอรายงานกลับมา');

// ---- ชุด intro: ตั้งม่าน แล้วเปิดม่าน ----
await ctl2.click('[data-cmd="deck"][data-arg="intro"]'); await ctl2.waitForTimeout(900);
ok(await s2.evaluate(() => window.NORA.state.deck) === 'intro', 'สั่งตั้งม่าน — จอเข้าชุด intro');
ok(await s2.evaluate(() => getComputedStyle(document.getElementById('curtain')).display) === 'block',
   'ม่านขึ้นคลุมจอจริง');
ok(await s2.evaluate(() => window.NORA.state.playing) === false,
   'ตั้งม่านแล้วสไลด์ค้างรอใต้ม่าน ไม่เดินไปเอง');
await ctl2.waitForTimeout(1300);
ok(!(await ctl2.evaluate(() => document.querySelector('[data-cmd="curtain"]').disabled)),
   'ปุ่มเปิดม่านกดได้เมื่อจอปลายทางอยู่ในชุด intro');

await ctl2.click('[data-cmd="curtain"]'); await ctl2.waitForTimeout(3400);
ok(await s2.evaluate(() => window.NORA.state.deck) === 'main', 'เปิดม่านแล้วกลับเข้าชุดหลัก');
ok(await s2.evaluate(() => window.NORA.state.slide) === 1, 'เปิดม่านแล้วเริ่มที่หน้าแรกของชุดหลัก');
ok(await s2.evaluate(() => window.NORA.state.playing) === true, 'เปิดม่านแล้วสไลด์เริ่มเดิน');
ok(await s2.evaluate(() => getComputedStyle(document.getElementById('curtain')).display) === 'none',
   'ม่านหายไปหลังเปิดสุด');
await ctl2.waitForTimeout(1300);
ok(await ctl2.evaluate(() => document.querySelector('[data-cmd="curtain"]').disabled),
   'กลับเข้าชุดหลักแล้ว ปุ่มเปิดม่านถูกปิดไว้');

// ---- เปลี่ยนชื่อจอจากมือถือ ----
await ctl2.fill('#rn', 'hall-z'); await ctl2.click('#ren');
await ctl2.waitForTimeout(1800);
ok(await s2.evaluate(() => window.NORA.id) === 'hall-z', 'เปลี่ยนชื่อจอจากมือถือ — จอรับชื่อใหม่');
ok((await ctl2.textContent('#nowId')).trim() === 'hall-z', 'หน้า controller ย้ายเป้าไปชื่อใหม่ให้เอง');
const beforeZ = await slideOf(s2);
await ctl2.click('button[data-cmd="next"]'); await ctl2.waitForTimeout(1000);
ok(await slideOf(s2) === beforeZ + 1, 'ชื่อใหม่แล้วยังสั่งงานได้ (ต่อสาย SSE ใหม่สำเร็จ)');

// ---- จำค่าไว้ในเครื่อง เปิดใหม่ไม่ต้องมี query string ----
// ใช้ context แยกเพื่อให้ localStorage สะอาด ไม่ปนกับจอด้านบน
const ctx = await b.newContext();
const mkc = async q => { const pg = await ctx.newPage();
  pg.on('pageerror', e => fail.push('ctx js error: ' + e.message));
  await pg.goto(base + '/index.html' + q); await pg.waitForTimeout(1200); return pg; };

const p1 = await mkc('?screen=remembered&ctrl=0&sync=0');
await p1.evaluate(() => window.NORA.apply({ cmd:'mode', arg:'w' }));
await p1.waitForTimeout(400); await p1.close();

const p2 = await mkc('?ctrl=0&sync=0');
ok(await p2.evaluate(() => window.NORA.id) === 'remembered',
   'เปิดใหม่แบบไม่มี query string — จำชื่อจอไว้');
ok(await p2.evaluate(() => document.documentElement.classList.contains('ultra')),
   'เปิดใหม่แบบไม่มี query string — จำโหมด 48:9 ไว้');
await p2.close();

const p3 = await mkc('?screen=forced&panel=1&ctrl=0&sync=0');
ok(await p3.evaluate(() => window.NORA.id) === 'forced', 'query string ยังชนะค่าที่จำไว้');
ok(await p3.evaluate(() => document.querySelectorAll('.slide .pane.pC').length) > 0,
   'เปิดด้วย ?panel=1 ก็ยังสร้าง pane จอกลางไว้ครบ — สั่งสลับโหมดทีหลังได้จริง');
const p4 = await mkc('?deck=intro&ctrl=0&sync=0');
ok(await p4.evaluate(() => window.NORA.state.deck) === 'intro', '?deck=intro เข้าชุดม่านได้');
await p4.close();
const p5 = await mkc('?ctrl=0&sync=0');
ok(await p5.evaluate(() => window.NORA.state.deck) === 'intro',
   'เปิดใหม่แบบไม่มี query string — จำชุดม่านไว้ (ไฟดับก่อนพิธีเปิดก็ยังปิดม่านอยู่)');
await p5.close();

await ctx.close();

// ---- แถบของสไลด์ต้องบอกด้วยว่าต่อรีเลย์ติดหรือยัง ----
ok(!/ไม่ต่อรีเลย์/.test(await s2.textContent('#uiInfo')),
   'จอที่ต่อรีเลย์ติด — แถบล่างไม่ขึ้นคำเตือน');
const lone = await mk('?screen=lonely&sync=0&api=/exhibition/api-ไม่มีจริง');
ok(/ไม่ต่อรีเลย์/.test(await lone.textContent('#uiInfo')),
   'จอที่ต่อรีเลย์ไม่ติด — แถบล่างขึ้นว่า (ไม่ต่อรีเลย์) ให้เห็นตั้งแต่ที่ตัวจอ');
await lone.close();

// ---- ข้อความบอกสถานะต้องแยกสามกรณีให้ชัด ----
await ctl.fill('#sid', 'ไม่มีจอนี้'); await ctl.click('#enter'); await ctl.waitForTimeout(500);
ok(/ไม่มีจอชื่อนี้ในรีเลย์/.test(await ctl.textContent('#nowMeta')),
   'ชื่อจอที่ไม่มีอยู่จริง — บอกว่าไม่มีจอชื่อนี้ ไม่ใช่โทษรีเลย์');
await s1.close(); await ctl.waitForTimeout(2200);
await ctl.click('#leave'); await ctl.fill('#sid', 'hall-a');
await ctl.click('#enter'); await ctl.waitForTimeout(500);
ok(/ออฟไลน์/.test(await ctl.textContent('#nowMeta')),
   'จอที่ปิดไปแล้ว — ขึ้นว่าออฟไลน์ ไม่ใช่โชว์เลขหน้าเก่าค้างไว้');

// ---- โทเคนผิดต้องถูกปฏิเสธ ----
const bad = await ctl.evaluate(async api => {
  const r = await fetch(api, { method:'POST', headers:{'content-type':'application/json'},
    body:JSON.stringify({ cmd:'next', target:'hall-a', token:'ผิด' }) });
  return r.status;
}, base + '/api/cmd');
ok(bad === 401, 'โทเคนผิดถูกปฏิเสธ (ได้ ' + bad + ')');

// ---- ปิดรีเลย์แล้วสไลด์ต้องเล่นต่อได้ ----
relay.kill();
await new Promise(r => setTimeout(r, 800));
const s3 = await mk('?screen=solo&sync=0');
ok(await slideOf(s3) >= 1, 'รีเลย์ล่ม — สไลด์ยังเปิดและเล่นได้ปกติ');

await b.close(); srv.close();
console.log(fail.length ? `\nไม่ผ่าน ${fail.length} ข้อ` : '\nผ่านทั้งหมด');
process.exit(fail.length ? 1 : 0);
