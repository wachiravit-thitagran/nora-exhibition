import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.argv[2] || process.cwd();
const source = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const fail = [];
const ok = (condition, message) => {
  console.log((condition ? 'ok   ' : 'พลาด ') + message);
  if(!condition) fail.push(message);
};

const durationFile = path.join(ROOT, 'assets', 'durations.json');
const durations = fs.existsSync(durationFile)
  ? JSON.parse(fs.readFileSync(durationFile, 'utf8')).durations || {}
  : {};
const ids = [...source.matchAll(/\['([0-9a-f]{24})','[^']+'\]/g)].map(m => m[1]);
const uniqueIds = [...new Set(ids)];

ok(fs.existsSync(durationFile), 'มี assets/durations.json สำหรับไทม์ไลน์ที่ตรงกันทุกจอ');
ok(uniqueIds.length === 22, 'อ่านรหัสวิดีโอหลักครบ 22 คลิป');
ok(uniqueIds.every(id => Number(durations[id]) > 0), 'durations.json มีความยาวครบทุกวิดีโอหลัก');
ok(/let VID_DUR = \{\};/.test(source), 'player มี state ความยาววิดีโอจากไฟล์กลาง');
ok(/function mediaFloorMs\(s\)/.test(source)
   && /const MEDIA_STARTUP_MS = 2000;/.test(source)
   && /Math\.max\(base, mediaFloorMs\(s\)\)/.test(source),
   'เวลาคงที่ของสไลด์ไม่น้อยกว่าวิดีโอที่ยาวที่สุดและเผื่อเริ่มเล่น 2 วินาที');
ok(/function visibleVideoDurationMs\(s\)[\s\S]*?offsetWidth > 0[\s\S]*?v\.duration/.test(source)
   && /function slideDuration\(s\)[^}]*visibleVideoDurationMs\(s\)/.test(source),
   'โหมดเดินอิสระใช้ metadata ของวิดีโอที่มองเห็น');
ok(/async function boot\(\)[\s\S]*?fetch\([^)]*durations\.json[\s\S]*?buildTimeline\(\)/.test(source),
   'โหลด durations.json ก่อนสร้างไทม์ไลน์');
ok(/function firstRoundComplete\(s\)/.test(source)
   && /p >= 1 && firstRoundComplete\(s\)/.test(source),
   'โหมดเดินอิสระรอวิดีโอที่มองเห็นเล่นจบรอบแรกก่อนเปลี่ยนหน้า');
ok(/function alignVideos\(offMs, now\)[\s\S]*?if\(!SYNC && v\.dataset\.firstRound === '0'\) return;/.test(source),
   'ระหว่างรอบแรกไม่ seek วิดีโอย้อนกลับตามนาฬิกาของสไลด์');

if(fail.length){
  console.error(`\nไม่ผ่าน ${fail.length} ข้อ`);
  process.exitCode = 1;
}else{
  console.log('\nvideo timing contract ผ่านทั้งหมด');
}
