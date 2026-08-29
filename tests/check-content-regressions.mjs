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

ok(source.includes('BRISQUE (Blind/Referenceless Image Spatial Quality Evaluator)')
   && source.includes('SSIM (Structural Similarity Index Measure)'),
   'BRISQUE และ SSIM มีคำเต็มภาษาอังกฤษในวงเล็บ');

const heavenFile = '14_ท่าเทวดา_B-ซ่อมแซม.jpg';
ok(fs.existsSync(path.join(ROOT, 'assets', 'compare', heavenFile)),
   'มีไฟล์ภาพท่าเทวดาที่ผู้ใช้ให้มาใน assets/compare');
ok(new RegExp(`'ท่าเทวดา'\\s*:\\s*'${heavenFile}'`).test(source),
   'POSE_IMG จับคู่ท่าเทวดากับภาพใหม่');

const khokwaiFile = '15_ท่าเขาควาย_B-ซ่อมแซม.jpg';
ok(fs.existsSync(path.join(ROOT, 'assets', 'compare', khokwaiFile)),
   'มีไฟล์ภาพท่าเขาควายใหม่ที่คมชัดใน assets/compare');
ok(new RegExp(`book:'ท่าเขาควาย',[^\\n]*fix:'${khokwaiFile}'`).test(source),
   'สไลด์เปรียบเทียบใช้ภาพท่าเขาควายใหม่');
ok(new RegExp(`'ท่าเขาควาย'\\s*:\\s*'${khokwaiFile}'`).test(source)
   && new RegExp(`'เขาควาย'\\s*:\\s*'${khokwaiFile}'`).test(source),
   'สไลด์ลำดับท่าทั้งสองรูปแบบชื่อใช้ภาพท่าเขาควายใหม่');
ok(!/'(?:ท่าเขาควาย|เขาควาย)'\\s*:\\s*'04_ท่าจีบหน้า_B-ซ่อมแซม\\.png'/.test(source),
   'ไม่มีสไลด์ลำดับท่าชี้กลับไปภาพท่าเขาควายเก่า');
ok(source.includes("['6a6d8dfce8c21f9b2fa12af4','ท่าจีบหน้า → ท่าเทวดา → ท่าเขาควาย']"),
   'สไลด์ 22 เปลี่ยนท่าจีบปรกหน้าเป็นท่าจีบหน้า');
ok(/const visiblePoses = poses\.map\(\(nm, k\) => \(\{ nm, k \}\)\)[\s\S]*?\.filter\(\(\{ nm \}\) => nm !== 'ท่าพนมมือ'\)/.test(source)
   && /const chips = visiblePoses\.map\(\(\{ nm, k \}\)/.test(source),
   'ไม่สร้างกล่องภาพสำหรับท่าพนมมือที่ยังไม่มีภาพ');

if(fail.length){
  console.error(`\nไม่ผ่าน ${fail.length} ข้อ`);
  process.exitCode = 1;
}else{
  console.log('\ncontent regression tests ผ่านทั้งหมด');
}
