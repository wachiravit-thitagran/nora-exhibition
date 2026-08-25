import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.argv[2] || process.cwd();
const source = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const expected = [
  ['6a6d8a98e8c21f9b2fa12ae4', 'ท่าขุนศรัทธา → ท่าพรหมสี่หน้า'],
  ['6a6d8ae44e74c6635728add3', 'ท่าครู → ท่าพรหมสี่หน้า'],
  ['6a6d8b34c262c1cc3e46a496', 'ท่าครู → ท่าเหาะเหิน'],
  ['6a6d8b704e74c6635728adda', 'ท่าซัดหวางอก → ท่าขี้หนอน'],
  ['6a6d8ba1e8c21f9b2fa12ae9', 'ท่าพรหมสี่หน้า → ท่าเทวดา'],
  ['6a6d8bdec262c1cc3e46a49e', 'ท่าย่างสามขุม → ท่าขี้หนอน'],
  ['6a6d8d43eab1361e29e3045e', 'ท่าขุนศรัทธา → ท่าครู'],
  ['6a6d8e374e74c6635728ade0', 'ท่าย่างสามขุม → ท่าย่างสามขุม'],
];

const fail = [];
const ok = (condition, message) => {
  console.log((condition ? 'ok   ' : 'พลาด ') + message);
  if(!condition) fail.push(message);
};

const colorIds = source.match(/const COLORIZED_IDS = \[[\s\S]*?\n\];/)?.[0] || '';
ok((colorIds.match(/[0-9a-f]{24}/g) || []).length === expected.length,
   'รายการวิดีโอลงสีมีเฉพาะ 8 ไฟล์ที่พร้อมใช้งาน');
ok(/const COLOR_VIDEOS = VIDEOS\.filter\(\(\[id\]\) => COLORIZED_IDS\.includes\(id\)\);/.test(source),
   'กรองรายการสไลด์ลงสีจากรหัสไฟล์ที่พร้อม');
ok(/if\(CONFIG\.SHOW_COLORIZE\) COLOR_VIDEOS\.forEach/.test(source),
   'สร้างสไลด์ลงสีจากรายการที่กรองแล้ว');

for(const [id, title] of expected){
  ok(source.includes(`['${id}','${title}']`), `ชื่อไฟล์จับคู่กับคลิป “${title}”`);
  const file = path.join(ROOT, 'assets', 'color', id + '.mp4');
  const exists = fs.existsSync(file);
  ok(exists, `มีวิดีโอใส่สี ${id}.mp4`);
  if(exists){
    const head = fs.readFileSync(file).subarray(0, 32).toString('latin1');
    ok(fs.statSync(file).size > 1024 && head.includes('ftyp'), `ไฟล์ ${id}.mp4 เป็น MP4 ที่ไม่ว่าง`);
  }
}

if(fail.length){
  console.error(`\nไม่ผ่าน ${fail.length} ข้อ`);
  process.exitCode = 1;
}else{
  console.log(`\nวิดีโอใส่สีผ่านทั้งหมด ${expected.length} คลิป`);
}
