import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.argv[2] || process.cwd();
const control = fs.readFileSync(path.join(ROOT, 'control.html'), 'utf8');
const deck = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

const fail = [];
const ok = (condition, message) => {
  console.log((condition ? 'ok   ' : 'พลาด ') + message);
  if(!condition) fail.push(message);
};

const shortcutCard = control.match(/<div class="card" id="stepShortcuts">([\s\S]*?)<\/div>\s*<\/div>/)?.[1] || '';
const args = [...shortcutCard.matchAll(/data-cmd="step"\s+data-arg="([0-4])"/g)].map(m => Number(m[1]));

ok(shortcutCard.includes('ทางลัดไปต้นขั้นตอน'), 'หน้า control มีช่องทางลัดไปต้นขั้นตอน');
ok(args.join(',') === '0,1,2,3,4', 'ทางลัดมีปุ่มครบ 5 ขั้นตอนและเรียงลำดับถูกต้อง');
ok(/case 'step':\s*\{[\s\S]*?SLIDES\.findIndex\(s => s\.step === step\)/.test(deck),
   'จอค้นหาสไลด์แรกจากค่า step ใน SLIDES');

if(fail.length){
  console.error(`\nไม่ผ่าน ${fail.length} ข้อ`);
  process.exitCode = 1;
}else{
  console.log('\nทางลัดขั้นตอนผ่าน contract test');
}
