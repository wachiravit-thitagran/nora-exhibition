import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.argv[2] || process.cwd();
const source = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const fail = [];
const ok = (condition, message) => {
  console.log((condition ? 'ok   ' : 'พลาด ') + message);
  if(!condition) fail.push(message);
};

const scanCell = source.match(/const scanCell = \(p, i\) => \{[\s\S]*?\n\};/)?.[0] || '';
ok(/thNum\(p\.no\)/.test(scanCell) && !/thNum\(p\.n\)/.test(scanCell),
   'ขั้นตอนที่ 1 อ่านเลขท่าจากฟิลด์ no จึงไม่แสดง undefined');
ok(/const rng\s*=\s*thNum\(\+set\[0\]\.no\)[\s\S]*set\[set\.length - 1\]\.no/.test(source),
   'ช่วงเลขท่าในหัวข้อขั้นตอนที่ 1 อ่านจากฟิลด์ no จึงไม่แสดง NaN');

const keyHandler = source.match(/addEventListener\('keydown', e=>\{[\s\S]*?\n\}\);/)?.[0] || '';
ok(/if\(e\.ctrlKey \|\| e\.metaKey \|\| e\.altKey\) return;/.test(keyHandler),
   'คีย์ลัดบนจอไม่ทำงานเมื่อกดร่วมกับ Ctrl, Command หรือ Alt');

ok(/const RESTORED_PAIRS = PAIRS\.filter\(p => !p\.pending\);/.test(source),
   'ขั้นตอนที่ 2 ใช้เฉพาะท่าที่มีภาพฟื้นฟูแล้ว');
ok(/\{ n:'02',[\s\S]*?c:'๑๑ ท่า'/.test(source),
   'สรุปขั้นตอนที่ 2 ระบุจำนวน 11 ท่า');
ok(/for\(let i = 0; i < RESTORED_PAIRS\.length; i \+= 3\)/.test(source),
   'หน้าภาพเปรียบเทียบวนจากรายการฟื้นฟู 11 ท่า');

if(fail.length){
  console.error(`\nไม่ผ่าน ${fail.length} ข้อ`);
  process.exitCode = 1;
}else{
  console.log('\ncontent regression tests ผ่านทั้งหมด');
}
