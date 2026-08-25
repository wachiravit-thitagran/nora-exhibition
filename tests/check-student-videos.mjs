import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.argv[2] || process.cwd();
const source = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const fail = [];
const ok = (condition, message) => {
  console.log((condition ? 'ok   ' : 'พลาด ') + message);
  if(!condition) fail.push(message);
};

const clips = source.match(/const STUDENT_CLIPS = \[[\s\S]*?\n\];/)?.[0] || '';
const files = [...clips.matchAll(/'([^']+\.mp4)'/g)].map(match => match[1]);
ok(files.length === 6, 'ขั้นตอนถ่ายทอดสู่ผู้รำมีวิดีโอนักศึกษา 6 คลิป');
ok(files.length === 6 && files.every(file => fs.existsSync(path.join(ROOT, 'assets', 'students', file))),
   'ไฟล์วิดีโอนักศึกษาทั้ง 6 คลิปมีอยู่ใน assets/students');

const section = source.match(/\/\* ---- ขั้นที่ 05 ถ่ายทอดสู่ผู้รำ[\s\S]*?\/\* ---- ปิดท้าย:/)?.[0] || '';
ok(/STUDENT_CLIPS\.forEach/.test(section), 'สร้างสไลด์ขั้นตอนที่ 5 จากรายการวิดีโอนักศึกษา');
ok(/cmp solo clip/.test(section), 'วิดีโอนักศึกษาแสดงเดี่ยวในสไลด์');
ok(/studentSingle:true/.test(section), 'มีชุดสไลด์เดี่ยวสำหรับโหมด 16:9');
ok(/for\(let i = 0; i < STUDENT_CLIPS\.length; i \+= 3\)/.test(section)
   && /studentWide:true/.test(section),
   'มีชุดสไลด์ผนัง 3 คลิปต่อหน้า รวม 2 หน้า');
ok(!/vurl\(|STUDENT_VIDEOS|วิดีโอที่ AI สร้างได้|duowide/.test(section),
   'ขั้นตอนที่ 5 ไม่แสดงหรือเปรียบเทียบกับวิดีโอ AI');
ok(!/SHOW_CLASSROOM|STUDENT_STILLS|นักเรียนในชั้นเรียน/.test(section),
   'ขั้นตอนที่ 5 ไม่มีสไลด์ห้องเรียนแทรก');
ok(/const WIDE_DECK = BOOT_MODE !== '0';[\s\S]*?SLIDES\.splice\(0, SLIDES\.length,[\s\S]*?studentSingle[\s\S]*?studentWide/.test(source),
   'เลือกชุดสไลด์นักศึกษาตามโหมดก่อน render');
ok(/function setMode\(m\)[\s\S]*?const targetWide = m !== '0';[\s\S]*?targetWide !== WIDE_DECK[\s\S]*?location\.search/.test(source),
   'สลับ 16:9 กับ 48:9 แล้วโหลด timeline ของโหมดใหม่');

if(fail.length){
  console.error(`\nไม่ผ่าน ${fail.length} ข้อ`);
  process.exitCode = 1;
}else{
  console.log('\nstudent video tests ผ่านทั้งหมด');
}
