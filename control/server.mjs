/* รีเลย์คำสั่งสำหรับจอนิทรรศการ AI NORA
 *
 * สไลด์เป็นไฟล์ static ล้วน ๆ จอกับ controller จึงคุยกันเองไม่ได้
 * ตัวนี้เป็นตัวกลางเล็ก ๆ ที่รับคำสั่งจาก controller แล้วส่งต่อไปยังจอที่ระบุ
 *
 * ทำไมใช้ SSE ไม่ใช่ WebSocket
 *   - จอต้องการแค่ "รับ" คำสั่ง ส่วนสถานะส่งกลับด้วย POST ธรรมดาก็พอ
 *   - SSE เป็น HTTP ปกติ ผ่าน nginx ได้โดยไม่ต้องตั้ง proxy upgrade
 *   - ไม่ต้องพึ่ง dependency ภายนอกเลย ใช้โมดูล http ที่มากับ Node
 *
 * ตัวแปรสภาพแวดล้อม
 *   PORT           พอร์ตที่ฟัง (ค่าเริ่มต้น 10097)
 *   CONTROL_TOKEN  โทเคนสำหรับสั่งงาน ถ้าเว้นว่าง = ใครก็สั่งได้ (ควรตั้งบน production)
 *   STALE_MS       ไม่ได้ยินจากจอนานเท่านี้ถือว่าหลุด (ค่าเริ่มต้น 45000)
 */
import http from 'node:http';

const PORT   = Number(process.env.PORT || 10097);
const TOKEN  = process.env.CONTROL_TOKEN || '';
const STALE  = Number(process.env.STALE_MS || 45000);
// หายไปนานเท่านี้และไม่มีสายเปิดค้าง = ลืมไปเลย
// จำเป็นเพราะชื่อจอเปลี่ยนได้จากมือถือ ชื่อเก่าจะกลายเป็นซากค้างในรายการตลอดไป
const FORGET = Number(process.env.FORGET_MS || 3600000);
const MAXBODY = 16 * 1024;

/** จอที่ต่ออยู่: id -> { id, res, state, seen } */
const screens = new Map();
/** controller ที่ต่ออยู่: Set<res> */
const controllers = new Set();

const now = () => Date.now();
const json = (res, code, obj) => {
  const b = Buffer.from(JSON.stringify(obj));
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8',
    'content-length': b.length, 'cache-control': 'no-store' });
  res.end(b);
};
/* online ต้องดูทั้งสองอย่าง
     s.res  = ยังมีสาย SSE เปิดค้างอยู่จริง — จอปิดหน้าเมื่อไหร่ สายปิดทันที
     seen   = เผื่อกรณีสายตายเงียบ ๆ โดยไม่มี event close (เน็ตหลุดกลางทาง)
   ถ้าดูแค่ seen อย่างเดียว จอที่เพิ่งปิดไปจะยังขึ้นว่าออนไลน์ต่ออีก 45 วินาที
   พร้อมเลขหน้าเก่าค้างอยู่ เหมือนยังเล่นอยู่ทั้งที่ดับไปแล้ว */
const snapshot = () => [...screens.values()]
  .map(s => ({ id: s.id, seen: s.seen, online: !!s.res && now() - s.seen < STALE, ...s.state }))
  .sort((a, b) => a.id.localeCompare(b.id));

function sse(res, event, data){
  try{ res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); }catch(e){}
}
function pushScreens(){
  const snap = snapshot();
  for(const c of controllers) sse(c, 'screens', snap);
}

function readBody(req){
  return new Promise((resolve, reject) => {
    let n = 0; const chunks = [];
    req.on('data', d => {
      n += d.length;
      if(n > MAXBODY){ reject(new Error('body ใหญ่เกินไป')); req.destroy(); return; }
      chunks.push(d);
    });
    req.on('end', () => {
      try{ resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); }
      catch(e){ reject(e); }
    });
    req.on('error', reject);
  });
}

const authed = (req, body) => !TOKEN
  || body.token === TOKEN
  || req.headers['x-control-token'] === TOKEN;

const srv = http.createServer(async (req, res) => {
  // ตัด prefix /exhibition/api ออก รองรับทั้งเรียกตรงและเรียกผ่าน nginx
  const u = new URL(req.url, 'http://x');
  const path = u.pathname.replace(/^\/exhibition\/api/, '') || '/';

  if(req.method === 'OPTIONS'){
    res.writeHead(204, { 'access-control-allow-origin': '*',
      'access-control-allow-headers': 'content-type,x-control-token',
      'access-control-allow-methods': 'GET,POST,OPTIONS' });
    return res.end();
  }
  res.setHeader('access-control-allow-origin', '*');

  /* ---- จอเปิดสายรอรับคำสั่ง ---- */
  if(path === '/events' && req.method === 'GET'){
    const role = u.searchParams.get('role') === 'controller' ? 'controller' : 'screen';
    const id   = (u.searchParams.get('screen') || '').slice(0, 40);
    if(role === 'screen' && !id) return json(res, 400, { error: 'ต้องระบุ screen' });

    res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform', connection: 'keep-alive',
      'x-accel-buffering': 'no' });          // กัน nginx บัฟเฟอร์จนคำสั่งไม่ถึงจอ
    res.write(': ok\n\n');

    if(role === 'controller'){
      controllers.add(res);
      sse(res, 'screens', snapshot());
      req.on('close', () => controllers.delete(res));
    } else {
      const old = screens.get(id);
      if(old && old.res && old.res !== res){ try{ old.res.end(); }catch(e){} }
      screens.set(id, { id, res, seen: now(), state: old?.state || {} });
      pushScreens();
      req.on('close', () => {
        const cur = screens.get(id);
        if(cur && cur.res === res){ cur.res = null; pushScreens(); }
      });
    }
    return;
  }

  /* ---- controller สั่งงาน ---- */
  if(path === '/cmd' && req.method === 'POST'){
    let body; try{ body = await readBody(req); }catch(e){ return json(res, 400, { error: String(e.message) }); }
    if(!authed(req, body)) return json(res, 401, { error: 'โทเคนไม่ถูกต้อง' });
    const target = body.target || '*';
    const msg = { cmd: body.cmd, arg: body.arg, at: now() };
    if(!msg.cmd) return json(res, 400, { error: 'ต้องระบุ cmd' });
    let sent = 0;
    for(const s of screens.values()){
      // target ตรงกับ "ชื่อจอ" หรือ "ชื่อกลุ่ม" ก็ได้
      // กลุ่มคือหลายแท็บที่จำลองผนังเดียวกัน สั่งทีเดียวต้องถึงทุกช่อง
      if(target !== '*' && s.id !== target && (s.state && s.state.group) !== target) continue;
      if(!s.res) continue;
      sse(s.res, 'cmd', msg); sent++;
    }
    return json(res, 200, { ok: true, sent, target });
  }

  /* ---- จอรายงานสถานะกลับมา ---- */
  if(path === '/state' && req.method === 'POST'){
    let body; try{ body = await readBody(req); }catch(e){ return json(res, 400, { error: String(e.message) }); }
    const id = (body.screen || '').slice(0, 40);
    if(!id) return json(res, 400, { error: 'ต้องระบุ screen' });
    const cur = screens.get(id) || { id, res: null };
    cur.seen = now();
    // คัดเฉพาะฟิลด์ที่รู้จัก ไม่รับก้อนที่จอส่งมาทั้งดุ้น
    // เพิ่มสถานะใหม่ที่จอรายงาน ต้องมาเพิ่มบรรทัดนี้ด้วยเสมอ
    // ไม่งั้นหน้า controller จะไม่เห็นค่านั้นเลย (ปุ่มไฮไลต์ไม่ติด)
    cur.state = { slide: body.slide, total: body.total, playing: !!body.playing,
                  mode: body.mode, title: body.title, sync: !!body.sync,
                  deck: body.deck, curtain: body.curtain, group: body.group,
                  seam: !!body.seam, motion: !!body.motion, full: !!body.full,
                  farm: !!body.farm };
    screens.set(id, cur);
    pushScreens();
    return json(res, 200, { ok: true });
  }

  if(path === '/screens' && req.method === 'GET') return json(res, 200, snapshot());
  if(path === '/healthz') return json(res, 200, { ok: true, screens: screens.size, auth: !!TOKEN });

  return json(res, 404, { error: 'ไม่พบปลายทาง' });
});

/* กันสายตายเงียบ ๆ ระหว่างทาง — ส่งคอมเมนต์ทุก 15 วินาที
   และเก็บกวาดชื่อจอที่ไม่มีใครใช้แล้วออกจากรายการ */
setInterval(() => {
  for(const s of screens.values()) if(s.res){ try{ s.res.write(': ping\n\n'); }catch(e){} }
  for(const c of controllers){ try{ c.write(': ping\n\n'); }catch(e){} }
  for(const [id, s] of screens) if(!s.res && now() - s.seen > FORGET) screens.delete(id);
  pushScreens();
}, 15000).unref?.();

/* ผูกกับ 127.0.0.1 อย่างเดียว — nginx อยู่ในคอนเทนเนอร์เดียวกันแล้ว จึงไม่ต้อง
   ให้ใครนอกเครื่องต่อเข้ามาตรง ๆ ทุกคนต้องผ่าน /exhibition/api/ เท่านั้น
   (ตั้ง HOST=0.0.0.0 ถ้าวันหนึ่งย้ายรีเลย์ออกไปอยู่คอนเทนเนอร์ของตัวเองอีก) */
const HOST = process.env.HOST || '127.0.0.1';
srv.listen(PORT, HOST, () => {
  console.log(`รีเลย์คำสั่ง AI NORA ฟังที่ ${HOST}:${PORT}` + (TOKEN ? ' (มีโทเคน)' : ' (ไม่มีโทเคน)'));
});
