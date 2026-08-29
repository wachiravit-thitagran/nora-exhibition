import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.argv[2] || process.cwd();
const index = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const picker = fs.readFileSync(path.join(ROOT, 'frame-picker.html'), 'utf8');
const fetcher = fs.readFileSync(path.join(ROOT, 'deploy', 'fetch-media.sh'), 'utf8');
const fail = [];
const ok = (condition, message) => {
  console.log((condition ? 'ok   ' : 'พลาด ') + message);
  if (!condition) fail.push(message);
};

const currentTitles = [
  ['6a7b4e69a8615dbe0af2672e', 'ท่าพรหมสี่หน้า → ท่าเทวดา → ท่าที่ยังไม่มีชื่อ'],
  ['6a6d8ef1eab1361e29e30466', 'ท่าย่างสามขุม → ท่าใหม่ (D)'],
  ['6a74c9cac262c1cc3e46a4ce', 'ท่าใหม่ (H) → ท่าเขาควาย → ท่าขุนศรัทธา'],
  ['6a74d6c5eab1361e29e304e5', 'ท่าเขาควาย → ท่าใหม่ (B) → ท่าใหม่ (C) → ท่าใหม่ (H) → ท่าเขาควาย → ท่าใหม่ (B) → ท่าใหม่ (C)  → ท่าใหม่ (H) → ท่าเขาควาย → ท่าขุนศรัทธา'],
  ['6a9207217bdf762f4ea3c975', 'ท่าเขาควาย → ท่าใหม่ (A)'],
];

for (const [id, title] of currentTitles) {
  const row = `['${id}','${title}']`;
  ok(index.includes(row), `index.html ใช้ชื่อปัจจุบันของ ${id}`);
  ok(picker.includes(row), `frame-picker.html ใช้ชื่อปัจจุบันของ ${id}`);
  ok(fetcher.includes(`${id}\t${title}`), `fetch-media.sh ใช้ชื่อปัจจุบันของ ${id}`);
}

const obsolete = '6a74a210e8c21f9b2fa12b24';
ok(!index.includes(`['${obsolete}'`), 'ถอดคลิปที่ไม่อยู่ในรายการเว็บล่าสุดออกจากสไลด์');
ok(!picker.includes(`['${obsolete}'`), 'ถอดคลิปเก่าออกจาก frame picker');
ok(!fetcher.includes(`${obsolete}\t`), 'ถอดคลิปเก่าออกจากรายการดาวน์โหลด');
ok(index.includes("['ท่าใหม่ที่เกิดขึ้น','๘ ท่า (A–H)']"), 'สรุปท่าใหม่เป็น 8 ท่า A–H');
const summaryKpi = index.match(/const KPI = \[([\s\S]*?)\]\n\s*\.map/)?.[1] || '';
ok(summaryKpi.includes("['11','ท่ารำต้นแบบที่ฟื้นฟูแล้ว']")
  && summaryKpi.includes("['22','วิดีโอที่ AI สร้างได้']")
  && summaryKpi.includes("['8','ท่าใหม่ที่เกิดในกระบวนการ']")
  && summaryKpi.includes("['5','ขั้นตอนของกระบวนการ']"),
  'การ์ดตัวเลขสรุปผลงานเป็น 11 ท่าฟื้นฟู 22 วิดีโอ 8 ท่าใหม่ และ 5 ขั้นตอน');

const poseFrames = [
  ['6a791869a8615dbe0af2670b', 0], ['6a791869a8615dbe0af2670b', 1],
  ['6a791869a8615dbe0af2670b', 3], ['6a791869a8615dbe0af2670b', 4],
  ['6a6d8eadc262c1cc3e46a4bc', 2], ['6a6d8ef1eab1361e29e30466', 1],
  ['6a6d8f23e8c21f9b2fa12afb', 1], ['6a74c9cac262c1cc3e46a4ce', 0],
  ['6a74d6c5eab1361e29e304e5', 1], ['6a74d6c5eab1361e29e304e5', 2],
  ['6a74d6c5eab1361e29e304e5', 3], ['6a74d6c5eab1361e29e304e5', 5],
  ['6a74d6c5eab1361e29e304e5', 6], ['6a74d6c5eab1361e29e304e5', 7],
  ['6a77fb5aeab1361e29e304fe', 1],
  ['6a783c54e8c21f9b2fa12b3c', 0], ['6a783c54e8c21f9b2fa12b3c', 1],
  ['6a9207217bdf762f4ea3c975', 1],
];
for (const [id, slot] of poseFrames) {
  ok(fs.existsSync(path.join(ROOT, 'assets', 'poses', `${id}-${slot}.jpg`)),
    `มีเฟรมท่าใหม่ ${id}-${slot}.jpg`);
}

if (fail.length) {
  console.error(`\nไม่ผ่าน ${fail.length} ข้อ`);
  process.exitCode = 1;
} else {
  console.log('\nnew-pose mapping tests ผ่านทั้งหมด');
}
