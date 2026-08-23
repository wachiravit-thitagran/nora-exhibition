/* ทดสอบ controller ครบวง — เปิดจอ 2 บาน + หน้า controller จริง
   แล้วสั่งจากหน้า controller ดูว่าจอขยับตามและรายงานสถานะกลับ */
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
    up.on('error', () => { res.writeHead(502); res.end('bad'); });
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

const s1 = await mk('?screen=left&panel=1&sync=0');
const s2 = await mk('?screen=right&panel=3&sync=0');
const ctl = await b.newPage({ viewport:{width:420,height:800} });
ctl.on('pageerror', e => fail.push('ctl js error: ' + e.message));
await ctl.goto(base + '/control.html');
await ctl.fill('#tok', 't0ken');
await ctl.waitForTimeout(1800);

const conn = await ctl.textContent('#conn');
ok(/จอออนไลน์ 2/.test(conn), 'controller เห็นจอครบ 2 จอ — "' + conn.trim() + '"');

const slideOf = pg => pg.evaluate(() => window.NORA.state.slide);
const before1 = await slideOf(s1), before2 = await slideOf(s2);

// สั่งทุกจอ: ถัดไป
await ctl.click('button[data-cmd="next"]'); await ctl.waitForTimeout(900);
ok(await slideOf(s1) === before1 + 1, 'สั่ง next ทุกจอ — จอ left ขยับ');
ok(await slideOf(s2) === before2 + 1, 'สั่ง next ทุกจอ — จอ right ขยับ');

// เลือกเป้าหมายเฉพาะจอ left แล้วสั่ง goto 5
await ctl.click('#tgt button[data-t="left"]'); await ctl.waitForTimeout(200);
await ctl.fill('#n', '5'); await ctl.click('#go'); await ctl.waitForTimeout(900);
ok(await slideOf(s1) === 5, 'สั่งเฉพาะจอ left — left ไปหน้า 5');
ok(await slideOf(s2) === before2 + 1, 'สั่งเฉพาะจอ left — right ไม่ขยับ');

// หยุดเล่นเฉพาะ left
await ctl.click('button[data-cmd="toggle"]'); await ctl.waitForTimeout(700);
ok(await s1.evaluate(() => window.NORA.state.playing) === false, 'สั่ง toggle — left หยุด');
ok(await s2.evaluate(() => window.NORA.state.playing) === true,  'สั่ง toggle — right ยังเล่น');

// สถานะกลับมาถึง controller
await ctl.waitForTimeout(1200);
const list = await ctl.textContent('#list');
ok(/left/.test(list) && /right/.test(list), 'controller เห็นสถานะทั้งสองจอ');
ok(/หน้า 5/.test(list), 'controller เห็นเลขหน้าที่อัปเดตแล้ว');

// โทเคนผิดต้องถูกปฏิเสธ
const bad = await ctl.evaluate(async api => {
  const r = await fetch(api, { method:'POST', headers:{'content-type':'application/json'},
    body:JSON.stringify({ cmd:'next', target:'*', token:'ผิด' }) });
  return r.status;
}, base + '/api/cmd');
ok(bad === 401, 'โทเคนผิดถูกปฏิเสธ (ได้ ' + bad + ')');

// ปิดรีเลย์แล้วสไลด์ต้องเล่นต่อได้
relay.kill();
await new Promise(r => setTimeout(r, 800));
const s3 = await mk('?screen=solo&sync=0');
ok(await slideOf(s3) >= 1, 'รีเลย์ล่ม — สไลด์ยังเปิดและเล่นได้ปกติ');

await b.close(); srv.close();
console.log(fail.length ? `\nไม่ผ่าน ${fail.length} ข้อ` : '\nผ่านทั้งหมด');
process.exit(fail.length ? 1 : 0);
