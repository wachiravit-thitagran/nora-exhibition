/**
 * ตรวจสไลด์นิทรรศการแบบ headless — ใช้ใน Jenkins ก่อน build image
 *
 *   node tests/check-deck.mjs [รากโฟลเดอร์ที่จะเสิร์ฟ]
 *
 * ตรวจ 4 อย่างต่อ 1 โหมดการแสดงผล
 *   1. ไม่มี JavaScript error
 *   2. จำนวนสไลด์เท่ากับที่คาดไว้สำหรับโหมด 16:9 / 48:9
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
const EXPECT_SINGLE_SLIDES = Number(process.env.EXPECT_SINGLE_SLIDES || 50);
const EXPECT_WIDE_SLIDES = Number(process.env.EXPECT_WIDE_SLIDES || 46);

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
  { name: '16:9',        qs: '',          pane: 'pC', slides:EXPECT_SINGLE_SLIDES },
  { name: '48:9 ยาว',    qs: '&wall=1',   pane: 'pW', slides:EXPECT_WIDE_SLIDES },
  { name: '48:9 แบ่ง 3', qs: '&ultra=1',  pane: 'pW', slides:EXPECT_WIDE_SLIDES },
  { name: 'จอ 2',        qs: '&panel=2',  pane: null, slides:EXPECT_WIDE_SLIDES },
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
    const studentSlides = SLIDES.filter(s => s.step === 4 && s.el.querySelector('video'));
    const studentSources = studentSlides.map(s => [...s.el.querySelectorAll('.pane')]
      .filter(p => getComputedStyle(p).display !== 'none')
      .flatMap(p => [...p.querySelectorAll('video')])
      .map(v => decodeURIComponent(v.getAttribute('src') || '')));
    const centerStudentAi = SLIDES[42]?.el.querySelector('.pane.pCU .student-pair video');
    const centerStudentAiBody = centerStudentAi?.parentElement;
    return {
      slides: document.querySelectorAll('.slide').length,
      colorSlides: SLIDES.filter(s => s.section?.includes('(ลงสี)')).length,
      studentSlides: studentSlides.length,
      studentSources,
      studentText: studentSlides.map(s => s.el.textContent).join('\n'),
      centerStudentAiHeightFill: centerStudentAi && centerStudentAiBody
        ? centerStudentAi.getBoundingClientRect().height / centerStudentAiBody.getBoundingClientRect().height
        : null,
      overY: de.scrollHeight - innerHeight,
      overX: de.scrollWidth - innerWidth,
      panes: on ? [...on.querySelectorAll('.pane')].filter(p => p.offsetWidth > 0)
                    .map(p => p.className.replace('pane ', '')) : [],
    };
  });

  const bad = [];
  if (errs.length)                  bad.push(`JS error: ${errs[0]}`);
  if (r.slides !== m.slides)        bad.push(`สไลด์ ${r.slides} หน้า (คาด ${m.slides})`);
  if (r.colorSlides !== 8)          bad.push(`สไลด์ลงสี ${r.colorSlides} หน้า (คาด 8)`);
  const expectedStudentSlides = m.slides === EXPECT_SINGLE_SLIDES ? 6 : 2;
  const expectedVideosPerSlide = m.slides === EXPECT_SINGLE_SLIDES ? 2 : 6;
  if (r.studentSlides !== expectedStudentSlides)
    bad.push(`สไลด์นักศึกษา ${r.studentSlides} หน้า (คาด ${expectedStudentSlides})`);
  if (!r.studentSources.every(srcs => new Set(srcs).size === expectedVideosPerSlide))
    bad.push(`จำนวนวิดีโอ AI และนักศึกษาที่มองเห็นต่อหน้าต้องเป็น ${expectedVideosPerSlide}`);
  if (!r.studentText.includes('วิดีโอที่ AI สร้าง') || !r.studentText.includes('นักศึกษารำตาม'))
    bad.push('ขั้นตอนที่ 5 ไม่มีป้ายต้นแบบ AI หรือนักศึกษารำตาม');
  if (m.slides === EXPECT_WIDE_SLIDES && !(r.centerStudentAiHeightFill >= 0.8))
    bad.push(`วิดีโอ AI สไลด์ 43 จอกลางสูงเพียง ${Math.round((r.centerStudentAiHeightFill || 0) * 100)}% ของกรอบ`);
  if (r.overY > 0)                  bad.push(`เลื่อนแนวตั้งได้ ${r.overY}px`);
  if (r.overX > 0)                  bad.push(`เลื่อนแนวนอนได้ ${r.overX}px`);
  if (!r.panes.length)              bad.push('ไม่มี pane ที่แสดงผล');
  if (m.pane && !r.panes.includes(m.pane))
    bad.push(`ไม่พบ pane ${m.pane} (เห็น ${r.panes.join(',') || 'ไม่มี'})`);

  if (bad.length) { fails.push(`${m.name} — ${bad.join(' · ')}`); console.log(`FAIL  ${m.name}: ${bad.join(' · ')}`); }
  else            { console.log(`ok    ${m.name} — ${r.slides} หน้า, pane ${r.panes.join(',')}`); }
  await page.close();
}

// regression: ข้อมูลเลขท่า, modifier key และรายการภาพฟื้นฟู
const regression = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await regression.goto(base, { waitUntil: 'load' });
await regression.waitForTimeout(500);
const rr = await regression.evaluate(() => {
  // innerText ของสไลด์ที่ visibility:hidden เป็นสตริงว่างใน Chromium
  // ใช้ textContent เพื่อตรวจเนื้อหาของทุกหน้า ไม่ใช่เฉพาะหน้าที่กำลังแสดง
  const step1Text = SLIDES.filter(s => s.step === 0).map(s => s.el.textContent).join('\n');
  const step2Text = SLIDES.filter(s => s.step === 1).map(s => s.el.textContent).join('\n');
  const step3Slides = SLIDES.filter(s => s.step === 2);
  const step3Text = step3Slides.map(s => s.el.textContent).join('\n');
  const poseLabels = step3Slides.flatMap(s => [...s.el.querySelectorAll('.chip .nm')]
    .map(n => n.textContent.trim()));
  const beforeDeck = window.NORA.state.deck;
  dispatchEvent(new KeyboardEvent('keydown', { key:'c', code:'KeyC', ctrlKey:true, bubbles:true }));
  return {
    step1HasUndefined: step1Text.includes('undefined'),
    step1HasNaN: step1Text.includes('NaN'),
    step2HasPendingPose: step2Text.includes('ท่าแมงมุมชักไย'),
    restoredCount: RESTORED_PAIRS.length,
    slide17ChipLabels: [...SLIDES[16].el.querySelectorAll('.pane.pC .chip .nm')]
      .map(n => n.textContent.trim()),
    slide17Text: SLIDES[16].el.querySelector('.pane.pC')?.textContent || '',
    slide22Text: SLIDES[21].el.textContent,
    step3HasOldPoseName: step3Text.includes('ท่าจีบปรกหน้า'),
    step3HasHeavenImage: [...document.querySelectorAll('.chip .nm')].some(n =>
      n.textContent.trim() === 'ท่าเทวดา'
      && decodeURIComponent(n.parentElement.querySelector('img')?.getAttribute('src') || '')
        .includes('14_ท่าเทวดา_B-ซ่อมแซม.jpg')),
    step3HasHandPrayerBox: poseLabels.includes('ท่าพนมมือ'),
    beforeDeck,
    afterDeck: window.NORA.state.deck,
  };
});
if(rr.step1HasUndefined) fails.push('ขั้นตอนที่ 1 ยังแสดง undefined แทนเลขท่า');
if(rr.step1HasNaN) fails.push('ช่วงเลขท่าในขั้นตอนที่ 1 ยังแสดง NaN');
if(rr.step2HasPendingPose) fails.push('ขั้นตอนที่ 2 ยังมีท่าแมงมุมชักไย');
if(rr.restoredCount !== 11) fails.push(`ขั้นตอนที่ 2 มี ${rr.restoredCount} ท่า (คาด 11)`);
if(rr.slide17ChipLabels.length !== 2 || rr.slide17ChipLabels.includes('ท่าที่ยังไม่มีชื่อ'))
  fails.push('สไลด์ 17 ยังไม่ได้เหลือเฉพาะกล่องท่าพรหมสี่หน้าและท่าเทวดา');
if(!rr.slide17Text.includes('ประกอบจาก ๒ ท่า'))
  fails.push('สไลด์ 17 ยังระบุจำนวนกล่องท่าที่แสดงไม่เป็น 2 ท่า');
if(rr.afterDeck !== rr.beforeDeck) fails.push('Ctrl+C ยังสั่งเปลี่ยนสถานะม่าน');
if(!rr.slide22Text.includes('ท่าจีบหน้า → ท่าเทวดา → ท่าเขาควาย')) fails.push('สไลด์ 22 ยังไม่ได้เปลี่ยนเป็นท่าจีบหน้า');
if(rr.step3HasOldPoseName) fails.push('ขั้นตอนที่ 3 ยังมีชื่อท่าจีบปรกหน้า');
if(!rr.step3HasHeavenImage) fails.push('ท่าเทวดายังไม่ได้ใช้ภาพใหม่');
if(rr.step3HasHandPrayerBox) fails.push('ยังมีกล่องภาพท่าพนมมือ');
console.log(!rr.step1HasUndefined && !rr.step1HasNaN && !rr.step2HasPendingPose && rr.restoredCount === 11
  && rr.slide17ChipLabels.length === 2 && !rr.slide17ChipLabels.includes('ท่าที่ยังไม่มีชื่อ')
  && rr.slide17Text.includes('ประกอบจาก ๒ ท่า')
  && rr.afterDeck === rr.beforeDeck && !rr.step3HasOldPoseName && rr.step3HasHeavenImage
  && !rr.step3HasHandPrayerBox
  ? 'ok    regression — เลขท่า, Ctrl และภาพฟื้นฟู 11 ท่า'
  : 'FAIL  regression — ' + fails.slice(-9).join(' · '));

// regression: ขั้นตอนถ่ายทอดสู่ผู้รำต้องมีคู่ต้นแบบ AI/นักศึกษา 6 หน้า
// และไฟล์ทั้งสองฝั่งที่ deploy ต้องอ่าน metadata ได้จริงใน Chromium
await regression.waitForFunction(() => {
  const studentSlides = SLIDES.filter(s => s.step === 4 && s.el.querySelector('video'));
  return studentSlides.length === 6
    && studentSlides.every(s => [...s.el.querySelectorAll('video')].every(v => v.readyState >= 1));
});
const student = await regression.evaluate(() => {
  const studentSlides = SLIDES.filter(s => s.step === 4 && s.el.querySelector('video'));
  return {
    count: studentSlides.length,
    twoSourcesEach: studentSlides.every(s => new Set([...s.el.querySelectorAll('video')]
      .map(v => decodeURIComponent(v.getAttribute('src') || ''))).size === 2),
    allPlayable: studentSlides.every(s => [...s.el.querySelectorAll('video')]
      .every(v => Number.isFinite(v.duration) && v.duration > 0)),
    sources: studentSlides.flatMap(s => [...new Set([...s.el.querySelectorAll('video')]
      .map(v => decodeURIComponent(v.getAttribute('src') || '')))]),
    text: studentSlides.map(s => s.el.textContent).join('\n'),
  };
});
if(student.count !== 6) fails.push(`ขั้นตอนที่ 5 มีวิดีโอนักศึกษา ${student.count} หน้า (คาด 6)`);
if(!student.twoSourcesEach) fails.push('บางสไลด์ในขั้นตอนที่ 5ไม่ได้แสดงวิดีโอ AI และนักศึกษาอย่างละหนึ่งไฟล์');
if(!student.allPlayable) fails.push('มีไฟล์วิดีโอ AI หรือนักศึกษาที่ Chromium อ่าน metadata ไม่ได้');
const studentFiles = student.sources.filter(src => /assets\/students\//.test(src));
const generatedFiles = student.sources.filter(src => /assets\/videos\//.test(src));
if(studentFiles.length !== 6 || studentFiles.some(src => !/assets\/students\/นักศึกษา-[1-6]\.mp4$/.test(src)))
  fails.push('ขั้นตอนที่ 5 อ้างวิดีโอนักศึกษาไม่ครบไฟล์ 1–6');
if(generatedFiles.length !== 6) fails.push('ขั้นตอนที่ 5 อ้างวิดีโอ AI ไม่ครบทั้ง 6 คู่');
if(!student.text.includes('วิดีโอที่ AI สร้าง') || !student.text.includes('นักศึกษารำตาม'))
  fails.push('ขั้นตอนที่ 5 ไม่มีป้ายต้นแบบ AI หรือนักศึกษารำตาม');
console.log(student.count === 6 && student.twoSourcesEach && student.allPlayable
  && studentFiles.length === 6 && generatedFiles.length === 6
  && student.text.includes('วิดีโอที่ AI สร้าง') && student.text.includes('นักศึกษารำตาม')
  ? 'ok    student videos — 6 คู่ AI/นักศึกษาและ Chromium อ่านได้ครบ'
  : 'FAIL  student videos — ' + fails.slice(-6).join(' · '));

// regression: เมื่อเวลาหน้าหมด แต่คลิปยังไม่จบรอบแรก ต้องค้างหน้าเดิม
// และ ended ของคลิปทุกตัวจึงปล่อยให้เดินต่อได้
await regression.evaluate(() => NORA.apply({ cmd:'goto', arg:30 }));
await regression.waitForFunction(() => {
  const s = SLIDES[cur];
  return visibleVideos(s).length > 0 && visibleVideos(s).every(v => v.readyState >= 1);
});
const timing = await regression.evaluate(() => {
  const before = cur;
  const vids = visibleVideos(SLIDES[cur]);
  const mediaMs = Math.max(...vids.map(v => v.duration * 1000));
  vids.forEach(v => { v.dataset.firstRound = '0'; v.pause(); });
  t0 = performance.now() - durMs - 1000;
  return { before, mediaMs, durMs, mapCount:Object.keys(VID_DUR).length };
});
await regression.waitForTimeout(250);
const held = await regression.evaluate(() => cur === 29);
await regression.evaluate(() => visibleVideos(SLIDES[cur]).forEach(v => v.dispatchEvent(new Event('ended'))));
await regression.waitForTimeout(250);
const advanced = await regression.evaluate(() => cur === 30);
if(timing.mapCount < 22) fails.push(`โหลดความยาววิดีโอได้เพียง ${timing.mapCount} รายการ`);
if(timing.durMs + 1 < timing.mediaMs + 2000) fails.push('เวลาสไลด์สั้นกว่าคลิปจริงพร้อมระยะเผื่อเริ่มเล่น 2 วินาที');
if(!held) fails.push('สไลด์เปลี่ยนหน้าก่อนวิดีโอจบรอบแรก');
if(!advanced) fails.push('สไลด์ไม่เดินต่อหลังวิดีโอจบรอบแรกครบทุกคลิป');
console.log(timing.mapCount >= 22 && timing.durMs + 1 >= timing.mediaMs + 2000 && held && advanced
  ? 'ok    video timing — รอ ended รอบแรก แล้วจึงเปลี่ยนหน้า'
  : 'FAIL  video timing — ' + fails.slice(-4).join(' · '));
await regression.close();

await browser.close();
server.close();

if (fails.length) { console.error(`\nไม่ผ่าน ${fails.length} โหมด`); process.exit(1); }
console.log(`\nผ่านทั้ง ${MODES.length} โหมด (16:9 ${EXPECT_SINGLE_SLIDES} หน้า · 48:9 ${EXPECT_WIDE_SLIDES} หน้า)`);
