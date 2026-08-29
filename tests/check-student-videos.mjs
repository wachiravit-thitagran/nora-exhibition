import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const ROOT = process.argv[2] || process.cwd();
const source = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const fail = [];
const ok = (condition, message) => {
  console.log((condition ? 'ok   ' : 'พลาด ') + message);
  if(!condition) fail.push(message);
};

const pairsBlock = source.match(/const STUDENT_PAIRS = \[[\s\S]*?\n\];/)?.[0] || '';
const pairs = [...pairsBlock.matchAll(/\['([^']+\.mp4)','([a-f0-9]+)'\]/g)]
  .map(([, student, generated]) => [student, generated]);
const expectedPairs = [
  ['นักศึกษา-1.mp4','b193231bf0c77bbdb0ae1660'],
  ['นักศึกษา-2.mp4','6a6d8b704e74c6635728adda'],
  ['นักศึกษา-3.mp4','6a6d8b34c262c1cc3e46a496'],
  ['นักศึกษา-4.mp4','6a9207217bdf762f4ea3c975'],
  ['นักศึกษา-5.mp4','39700d79562e283e5fbae152'],
  ['นักศึกษา-6.mp4','6a6d8eadc262c1cc3e46a4bc'],
];
ok(JSON.stringify(pairs) === JSON.stringify(expectedPairs),
   'จับคู่วิดีโอ AI กับวิดีโอนักศึกษาครบและตรงตามท่ารำทั้ง 6 คลิป');
ok(pairs.length === 6 && pairs.every(([file]) => fs.existsSync(path.join(ROOT, 'assets', 'students', file))),
   'ไฟล์วิดีโอนักศึกษาทั้ง 6 คลิปมีอยู่ใน assets/students');
ok(pairs.length === 6 && pairs.every(([, id]) => fs.existsSync(path.join(ROOT, 'assets', 'videos', id + '.mp4'))),
   'ไฟล์วิดีโอ AI ที่จับคู่ทั้ง 6 รายการมีอยู่ใน assets/videos');
const sha256 = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
ok(fs.existsSync(path.join(ROOT, 'assets', 'videos', 'b193231bf0c77bbdb0ae1660.mp4'))
  && sha256(path.join(ROOT, 'assets', 'videos', 'b193231bf0c77bbdb0ae1660.mp4'))
    === 'b193231bf0c77bbdb0ae16600170483d36dcbd6de34fcca48843fdf3a81ebea6',
  'คลิปนักศึกษา 1 ใช้วิดีโอ AI ท่าจับระบำไปท่าขี้หนอนจากไฟล์แนบ');
ok(fs.existsSync(path.join(ROOT, 'assets', 'videos', '39700d79562e283e5fbae152.mp4'))
  && sha256(path.join(ROOT, 'assets', 'videos', '39700d79562e283e5fbae152.mp4'))
    === '39700d79562e283e5fbae1524f29bcb88d4ae13cf22f71788686d8576a141fe2',
  'คลิปนักศึกษา 5 ใช้วิดีโอ AI ท่าจับระบำไปท่าลงฉากน้อย');
ok(/const STUDENT_AI_TITLES = \{[\s\S]*?['"]?b193231bf0c77bbdb0ae1660['"]?:'ท่าจับระบำ → ท่าขี้หนอน'[\s\S]*?['"]?39700d79562e283e5fbae152['"]?:'ท่าจับระบำ → ท่าลงฉากน้อย'/.test(source),
  'ชื่อวิดีโอ AI เฉพาะคลิป 1 และ 5 แสดงตรงกับท่าที่แก้ไข');

const section = source.match(/\/\* ---- ขั้นที่ 05 ถ่ายทอดสู่ผู้รำ[\s\S]*?\/\* ---- ปิดท้าย:/)?.[0] || '';
ok(/STUDENT_PAIRS\.forEach/.test(section), 'สร้างสไลด์ขั้นตอนที่ 5 จากคู่ AI และนักศึกษา');
ok(/duowide/.test(section), 'วางวิดีโอ AI และนักศึกษาเคียงคู่กัน');
ok(/วิดีโอที่ AI สร้าง/.test(section) && /นักศึกษารำตาม/.test(section),
   'แสดงป้ายกำกับต้นแบบ AI และนักศึกษารำตาม');
ok(/vurl\(generatedId\)/.test(section), 'ใช้วิดีโอ AI ที่จับคู่เป็นต้นแบบในแต่ละสไลด์');
ok(/studentSingle:true/.test(section), 'มีชุดสไลด์เดี่ยวสำหรับโหมด 16:9');
ok(/for\(let i = 0; i < STUDENT_PAIRS\.length; i \+= 3\)/.test(section)
   && /studentWide:true/.test(section),
   'มีชุดสไลด์ผนัง 3 คู่ต่อหน้า รวม 2 หน้า');
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
