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
  // ส่ง CSP แบบเดียวกับ ainora.psu.ac.th ของจริง — ห้าม frame เด็ดขาด
  // ข้อทดสอบภาพตัวอย่างด้านล่างจึงพิสูจน์ว่าทางที่ใช้ (srcdoc) ไม่โดนกฎนี้
  res.writeHead(200, {'Content-Type': MIME[path.extname(f)] || 'application/octet-stream',
                      'Content-Security-Policy': "frame-ancestors 'none'"});
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

// ---- โหมดจอเรียงเหมือนแถบบนตัวสไลด์ · เส้นแบ่งจอ · ปุ่มไฮไลต์ตามสถานะจริง ----
await ctl2.fill('#tok', 't0ken');
await ctl2.click('[data-cmd="mode"][data-arg="w"]'); await ctl2.waitForTimeout(900);
ok(await s2.evaluate(() => document.documentElement.classList.contains('ultra')),
   'สั่งโหมด 48:9 แบ่ง 3 จากมือถือได้');
await ctl2.waitForTimeout(1400);
ok(await ctl2.evaluate(() => document.getElementById('panels').classList.contains('hide')),
   'อยู่โหมด 48:9 — แถวเลือกเลขจอถูกซ่อน เหมือนแถบบนตัวสไลด์');
await ctl2.click('[data-cmd="mode"][data-fam="s"]'); await ctl2.waitForTimeout(1800);
ok(!(await ctl2.evaluate(() => document.getElementById('panels').classList.contains('hide'))),
   'กลับมา 16:9 — แถวเลือกเลขจอโผล่ให้กดได้');

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

await ctl2.click('[data-cmd="curtain"]'); await ctl2.waitForTimeout(5400);   // .25s หน่วง + 4.2s รูด + เผื่อ
ok(await s2.evaluate(() => getComputedStyle(document.getElementById('curtain')).display) === 'none',
   'ม่านหายไปหลังเปิดสุด');
ok(await s2.evaluate(() => window.NORA.state.deck) === 'intro',
   'เปิดม่านแล้วยังอยู่ในชุด intro ไม่กระโดดเข้าชุดหลักเอง');
ok(await s2.evaluate(() => window.NORA.state.curtain) === 'up', 'สถานะม่านเป็น up');
ok(await s2.evaluate(() => window.NORA.state.slide) === 1, 'ค้างที่หน้าแรก');
ok(await s2.evaluate(() => window.NORA.state.playing) === true,
   'วิดีโอหน้าแรกเดินอยู่ (ปล่อยให้ loop ได้)');
await ctl2.waitForTimeout(1400);
ok(await ctl2.evaluate(() => document.querySelector('[data-cmd="curtain"]').disabled),
   'ม่านเปิดแล้ว ปุ่มเปิดม่านถูกปิดไว้');
ok(await ctl2.evaluate(() =>
     document.querySelector('[data-cmd="deck"][data-arg="main"]').classList.contains('next')),
   'ปุ่มชุดหลักถูกตีกรอบไว้ว่าเป็นขั้นต่อไป');

// หน้าแรกต้องไม่วิ่งต่อเอง แม้เวลาผ่านไปเกินความยาวของหน้า
const dwell = await s2.evaluate(() => durMs);
await s2.waitForTimeout(Math.min(dwell + 1200, 9000));
ok(await s2.evaluate(() => window.NORA.state.slide) === 1,
   'ปล่อยไว้จนเลยเวลาของหน้าแล้วก็ยังค้างหน้าแรก ไม่วิ่งต่อเอง');

// กดชุดหลักเองถึงจะเริ่มโชว์
await ctl2.click('[data-cmd="deck"][data-arg="main"]'); await ctl2.waitForTimeout(900);
ok(await s2.evaluate(() => window.NORA.state.deck) === 'main', 'กดชุดหลักแล้วเข้าชุดหลัก');
ok(await s2.evaluate(() => window.NORA.state.slide) === 1, 'ชุดหลักเริ่มที่หน้าแรก');
ok(await s2.evaluate(() => window.NORA.state.playing) === true, 'ชุดหลักเริ่มเดิน');

// ---- ภาพตัวอย่างของจอที่กำลังคุม ----
await ctl2.click('#pvtoggle'); await ctl2.waitForTimeout(4500);
const pv = await ctl2.evaluate(() => {
  try{ return document.getElementById('pv').contentWindow.NORA.state; }catch(e){ return null; }
});
ok(!!pv, 'ภาพตัวอย่างโหลดสไลด์ขึ้นมาจริง แม้เซิร์ฟเวอร์ส่ง CSP frame-ancestors none');
ok(pv && pv.slide === (await slideOf(s2)), 'ภาพตัวอย่างอยู่หน้าเดียวกับจอจริง');
ok(pv && pv.deck === 'main', 'ภาพตัวอย่างตามชุดสไลด์ของจอจริง');
ok(await ctl2.evaluate(() => {
  try{ return document.getElementById('pv').contentWindow.NORA.state.screen; }catch(e){ return '?'; }
}) !== 'hall-b', 'ภาพตัวอย่างไม่ได้แอบใช้ชื่อจอจริง');
ok(!(await ctl2.textContent('#conn')).includes('จาก 3'),
   'ภาพตัวอย่างไม่ไปรายงานตัวกับรีเลย์จนกลายเป็นจออีกตัว');
await ctl2.click('#pvtoggle'); await ctl2.waitForTimeout(400);
ok(await ctl2.evaluate(() => !document.getElementById('pv').getAttribute('srcdoc')),
   'ปิดภาพตัวอย่างแล้วหยุดโหลดจริง');
ok(await ctl2.evaluate(() => (document.getElementById('pvmsg').textContent || '').trim() === ''),
   'ไม่มีข้อความแจ้งพลาดค้างอยู่ที่กล่องภาพตัวอย่าง');

// ---- เปลี่ยนชื่อจอจากมือถือ ----
await ctl2.fill('#rn', 'hall-z'); await ctl2.click('#ren');
await ctl2.waitForTimeout(1800);
ok(await s2.evaluate(() => window.NORA.id) === 'hall-z', 'เปลี่ยนชื่อจอจากมือถือ — จอรับชื่อใหม่');
ok((await ctl2.textContent('#nowId')).trim() === 'hall-z', 'หน้า controller ย้ายเป้าไปชื่อใหม่ให้เอง');
const beforeZ = await slideOf(s2);
await ctl2.click('button[data-cmd="next"]'); await ctl2.waitForTimeout(1000);
ok(await slideOf(s2) === beforeZ + 1, 'ชื่อใหม่แล้วยังสั่งงานได้ (ต่อสาย SSE ใหม่สำเร็จ)');

/* ---- ผนังจำลอง 48:9 ด้วย 3 แท็บ -----------------------------------
   สามแท็บ ?group=wall&panel=1|2|3 = จอสามตัวในสายตารีเลย์ แต่หน้า controller
   ยุบให้เหลือแถวเดียวชื่อ wall แล้วสั่งทีเดียวถึงพร้อมกันทั้งสามช่อง

   ใช้ context แยก เพราะข้อสำคัญที่สุดของฟีเจอร์นี้คือ "แท็บกลุ่มต้องไม่แตะ
   localStorage" — สามแท็บอยู่ origin เดียวกัน ถ้าเขียน แท็บหลังจะทับโหมด
   ของแท็บหน้าจนผนังพังทั้งชุด ต้องเริ่มจากที่เก็บสะอาดถึงจะพิสูจน์ได้ */
const gctx = await b.newContext();
const mkg = async q => { const pg = await gctx.newPage({ viewport:{width:900,height:520} });
  pg.on('pageerror', e => fail.push('group js error: ' + e.message));
  await pg.goto(base + '/index.html' + q); await pg.waitForTimeout(1200); return pg; };

const w1 = await mkg('?group=wall&panel=1&sync=0');
const w2 = await mkg('?group=wall&panel=2&sync=0');
const w3 = await mkg('?group=wall&panel=3&sync=0');
const gid = pg => pg.evaluate(() => window.NORA.id);
ok(await gid(w1) === 'wall-1' && await gid(w2) === 'wall-2' && await gid(w3) === 'wall-3',
   'แท็บกลุ่มตั้งชื่อเองเป็น wall-1 wall-2 wall-3');
ok(await w2.evaluate(() => window.NORA.state.group) === 'wall', 'แท็บกลุ่มรายงานชื่อกลุ่มกลับมา');
ok(await w2.evaluate(() => window.NORA.state.mode) === '2', 'แท็บที่สองครอปเฉพาะช่องกลาง');
ok(await w1.evaluate(() => document.documentElement.classList.contains('ultra')),
   'แท็บกลุ่มอยู่บนเวทีกว้าง 48:9 แล้วครอปเอา ไม่ใช่ 16:9');

const ctl3 = await b.newPage({ viewport:{width:420,height:900} });
ctl3.on('pageerror', e => fail.push('ctl3 js error: ' + e.message));
await ctl3.goto(base + '/control.html');
await ctl3.fill('#tok', 't0ken');
await ctl3.waitForTimeout(1800);

ok(await ctl3.evaluate(() => !!document.querySelector('#list button[data-pick="wall"]')),
   'รายการจอมีแถวชื่อ wall แถวเดียวแทนสามช่อง');
ok(await ctl3.evaluate(() => !document.querySelector('#list button[data-pick="wall-1"]')),
   'ช่องย่อย wall-1 ไม่โผล่เป็นแถวแยกซ้ำอีก');
ok(/ผนังจำลอง 3\/3 ช่อง/.test(await ctl3.textContent('#list')),
   'แถวผนังบอกว่าออนไลน์ครบ 3 ช่อง');

await ctl3.click('#list button[data-pick="wall"]'); await ctl3.waitForTimeout(400);
await ctl3.click('button[data-cmd="toggle"]'); await ctl3.waitForTimeout(900);   // หยุดทั้งชุดก่อน
ok(await ctl3.evaluate(() => document.getElementById('modeBox').classList.contains('hide')),
   'คุมผนังอยู่ — ปุ่มเปลี่ยนโหมดถูกซ่อน (สั่งไปจะทำให้สามแท็บกลายเป็นช่องเดียวกัน)');
ok(await ctl3.evaluate(() => document.getElementById('renameCard').classList.contains('hide')),
   'คุมผนังอยู่ — ปุ่มเปลี่ยนชื่อถูกซ่อน (ชื่อจะชนกันจนเหลือสายเดียว)');
ok(await ctl3.isVisible('#modeNote'), 'มีคำอธิบายแทนที่ว่าทำไมเปลี่ยนโหมดไม่ได้');

await ctl3.fill('#n', '7'); await ctl3.click('#go'); await ctl3.waitForTimeout(1000);
const gslides = [await slideOf(w1), await slideOf(w2), await slideOf(w3)];
ok(gslides.join(',') === '7,7,7', 'สั่งครั้งเดียวถึงครบสามช่อง — ทุกช่องไปหน้า 7 (ได้ ' + gslides + ')');
await ctl3.click('button[data-cmd="next"]'); await ctl3.waitForTimeout(1000);
ok([await slideOf(w1), await slideOf(w2), await slideOf(w3)].join(',') === '8,8,8',
   'สั่ง next แล้วทั้งสามช่องเดินพร้อมกัน');
ok(await w1.evaluate(() => window.NORA.state.mode) === '1'
   && await w3.evaluate(() => window.NORA.state.mode) === '3',
   'เดินหน้าพร้อมกันแล้วแต่ละช่องยังครอปส่วนของตัวเองไว้เหมือนเดิม');

// สั่ง mode / name ตรง ๆ ผ่าน API — ตัวสไลด์เองต้องปฏิเสธ ไม่ใช่แค่ซ่อนปุ่ม
const raw = async (cmd, arg) => ctl3.evaluate(async ([api, cmd, arg]) => {
  await fetch(api, { method:'POST', headers:{'content-type':'application/json'},
    body:JSON.stringify({ cmd, arg, target:'wall', token:'t0ken' }) });
}, [base + '/api/cmd', cmd, arg]);
await raw('mode', '0'); await ctl3.waitForTimeout(800);
ok(await w2.evaluate(() => window.NORA.state.mode) === '2',
   'ยิงคำสั่งเปลี่ยนโหมดตรง ๆ ก็ไม่ผ่าน — แท็บกลุ่มล็อกช่องของตัวเอง');
await raw('name', 'โดนเปลี่ยน'); await ctl3.waitForTimeout(800);
ok(await gid(w2) === 'wall-2', 'ยิงคำสั่งเปลี่ยนชื่อตรง ๆ ก็ไม่ผ่าน');

// ม่านเปิดงานต้องสั่งพร้อมกันได้ทั้งผืน ไม่งั้นม่านจะแยกกันเปิดคนละจังหวะ
await ctl3.click('[data-cmd="deck"][data-arg="intro"]'); await ctl3.waitForTimeout(1000);
ok([await w1.evaluate(() => window.NORA.state.deck),
    await w2.evaluate(() => window.NORA.state.deck),
    await w3.evaluate(() => window.NORA.state.deck)].join(',') === 'intro,intro,intro',
   'สั่งตั้งม่านทีเดียว ม่านขึ้นครบทั้งสามช่อง');
await ctl3.waitForTimeout(1300);
ok(/ม่านเปิดงาน/.test(await ctl3.textContent('#nowMeta')), 'สรุปสถานะของผนังตามช่องที่ตรงกัน');
await ctl3.click('[data-cmd="deck"][data-arg="main"]'); await ctl3.waitForTimeout(1000);

// ช่องไหนหลุดออกไปคนละหน้า ต้องเตือน ไม่ใช่โชว์เลขหน้าของช่องใดช่องหนึ่งมั่ว ๆ
await w2.evaluate(() => window.NORA.apply({ cmd:'goto', arg:20 }));
await ctl3.waitForTimeout(1400);
ok(/ช่องไม่ตรงกัน/.test(await ctl3.textContent('#nowMeta')),
   'ช่องหลุดไปคนละหน้า — ขึ้นเตือนว่าไม่ตรงกัน');
await ctl3.click('button[data-cmd="restart"]'); await ctl3.waitForTimeout(1400);
ok(!/ช่องไม่ตรงกัน/.test(await ctl3.textContent('#nowMeta')),
   'สั่งไปหน้าเดียวกันแล้วดึงกลับเข้าแถว คำเตือนหาย');

// ภาพตัวอย่างของผนังต้องเป็นกล่อง 48:9 ไม่ใช่ 16:9 ของช่องเดียว
await ctl3.click('#pvtoggle'); await ctl3.waitForTimeout(4500);
ok(await ctl3.evaluate(() => document.getElementById('pvbox').style.aspectRatio) === '48 / 9',
   'ภาพตัวอย่างของผนังเป็นกล่อง 48:9 เต็มผืน');
ok(await ctl3.evaluate(() => {
  try{ return document.getElementById('pv').contentWindow.NORA.state.mode; }catch(e){ return '?'; }
}) === 'w', 'ภาพตัวอย่างแสดงทั้งผืน ไม่ได้ครอปเหลือช่องเดียว');
await ctl3.click('#pvtoggle'); await ctl3.waitForTimeout(300);

// ปุ่มเปิดผนังประกอบลิงก์ครบสามช่อง (ทดสอบตัว URL ไม่ต้องเด้งป๊อปอัปจริง)
await ctl3.fill('#gid', 'ห้องโถง'); await ctl3.waitForTimeout(200);
const links = await ctl3.evaluate(() =>
  [...document.querySelectorAll('#wallLinks a')].map(a => a.getAttribute('href')));
ok(links.length === 3, 'การ์ดจำลองผนังทำลิงก์ครบสามช่อง');
ok(links.every((h, i) => h.includes('panel=' + (i + 1)) && h.includes('kiosk=1')
     && h.includes('group=' + encodeURIComponent('ห้องโถง'))),
   'ลิงก์แต่ละช่องพก group · panel · kiosk ครบ');

// ข้อสำคัญที่สุด: แท็บกลุ่มต้องไม่ทิ้งร่องรอยไว้ในเครื่อง
const clean = await mkg('?ctrl=0&sync=0');
ok(await clean.evaluate(() => window.NORA.id) === 'main',
   'เปิดหน้าเปล่าในเครื่องเดิม — ยังชื่อ main ไม่ใช่ wall-3 (แท็บกลุ่มไม่เขียนค่าที่จำไว้)');
ok(!(await clean.evaluate(() => document.documentElement.classList.contains('ultra'))),
   'เปิดหน้าเปล่าในเครื่องเดิม — ยังเป็น 16:9 ไม่ติดโหมดครอปของแท็บกลุ่ม');
await clean.close();

await w1.close(); await w2.close(); await w3.close();
await ctl3.waitForTimeout(2200);
ok(/ออฟไลน์ทั้งหมด/.test(await ctl3.textContent('#nowMeta')),
   'ปิดทั้งสามแท็บแล้ว แถวผนังขึ้นว่าออฟไลน์ทั้งหมด');
await ctl3.close(); await gctx.close();

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
