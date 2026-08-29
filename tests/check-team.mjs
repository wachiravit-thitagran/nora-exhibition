import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(process.argv[2] || process.cwd());
const html = readFileSync(resolve(root, 'index.html'), 'utf8');
const failures = [];
const ok = (condition, message) => {
  console.log(`${condition ? 'ok   ' : 'พลาด '} ${message}`);
  if(!condition) failures.push(message);
};

const leadBlock = html.match(/const TEAM_LEADS = \[([\s\S]*?)\n\];/)?.[1] || '';
const memberBlock = html.match(/const TEAM = \[([\s\S]*?)\n\];/)?.[1] || '';
const inOrder = (text, values) => {
  let at = -1;
  return values.every(value => {
    at = text.indexOf(value, at + 1);
    return at >= 0;
  });
};

ok(existsSync(resolve(root, 'assets/team/sinchai.jpg')),
  'มีภาพ รศ. ดร.สินชัย ที่ครอปสำหรับวงกลมแล้ว');
ok(inOrder(leadBlock, [
  'รองศาสตราจารย์ ดร.สินชัย กมลภิวงศ์',
  'ผศ.ธรรมนิตย์ นิคมรัตน์',
]), 'แถวบนเรียง สินชัย → ธรรมนิตย์');
ok(inOrder(memberBlock, [
  'ผศ. ดร.ชิดชนก โชคสุชาติ',
  'วชิรวิทย์ ฐิตะกาญจน์',
  'ภาณุวิชญ์ รักใหม่',
  'คีตศิลป์ คงศรี',
]), 'แถวล่างเรียง ชิดชนก → วชิรวิทย์ → ภาณุวิชญ์ → คีตศิลป์');
ok(!/ผู้ช่วยศาสตราจารย์/.test(leadBlock + memberBlock),
  'ชื่อทีมงานย่อคำนำหน้า ผู้ช่วยศาสตราจารย์ เป็น ผศ.');
ok(/TEAM_LEADS\.map\(p => who\(p, 'lead'\)\)\.join\(''\)/.test(html),
  'วาดหัวหน้าจากรายการ TEAM_LEADS ครบทุกคน');
ok(/TEAM\.map\(p => who\(p\)\)\.join\(''\)/.test(html),
  'วาดสมาชิกแถวล่างจากรายการ TEAM ครบทุกคน');

const attireCredit = html.match(/const CR_ATTIRE = `([\s\S]*?)`;/)?.[1] || '';
ok(attireCredit.includes('ความอนุเคราะห์ภาพเครื่องประดับและเครื่องแต่งกายโนรา')
  && attireCredit.includes('คุณพีรมณฑ์ ชมธวัช'),
  'เครดิตภาพเครื่องประดับและเครื่องแต่งกายระบุคุณพีรมณฑ์ ชมธวัช');
ok(html.includes('${CR_SRC}${CR_ATTIRE}${CR_ORG}'),
  'เครดิตภาพเครื่องแต่งกายอยู่ต่อจากรายการต้นฉบับท่ารำบนจอขวา');
ok(!html.includes('ชมผลงานทั้งหมดได้ที่'),
  'นำข้อความชมผลงานทั้งหมดได้ที่ออกเพื่อเพิ่มพื้นที่');

if(failures.length){
  console.error(`\nไม่ผ่าน ${failures.length} ข้อ`);
  process.exit(1);
}
console.log('\nผ่านทั้งหมด');
