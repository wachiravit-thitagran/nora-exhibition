/** ตรวจว่าหน้าเว็บปล่อยให้ browser ใช้นโยบาย cache ปกติ */
import { readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';

const root = resolve(process.argv[2] || process.cwd());
const files = {
  index: await readFile(join(root, 'index.html'), 'utf8'),
  control: await readFile(join(root, 'control.html'), 'utf8'),
  infradash: await readFile(join(root, 'infradash/index.html'), 'utf8'),
  nginx: await readFile(join(root, 'deploy/nginx.conf'), 'utf8'),
  relay: await readFile(join(root, 'control/server.mjs'), 'utf8'),
};

const failures = [];
function ok(value, label){
  if(value) console.log('ผ่าน ' + label);
  else { console.error('พลาด ' + label); failures.push(label); }
}

for(const [name, source] of Object.entries(files)){
  ok(!/<meta[^>]+http-equiv=["'](?:Cache-Control|Pragma|Expires)["']/i.test(source),
    `${name} ไม่มี meta บังคับปิด cache`);
}

ok(!/add_header\s+(?:Cache-Control|Pragma|Expires)\b/i.test(files.nginx),
  'nginx ไม่บังคับ header ปิด cache สำหรับหน้าเว็บและ assets');
ok(!/page\.url\s*\+\s*sep\s*\+\s*['"]_t=/.test(files.infradash),
  'infradash ไม่เติม timestamp เพื่อหลบ cache');
ok(!Object.entries(files)
  .filter(([name]) => name !== 'relay')
  .some(([, source]) => /cache\s*:\s*['"]no-store['"]/.test(source)),
  'fetch ของหน้าเว็บไม่บังคับข้าม cache');
ok(!/['"]cache-control['"]\s*:\s*['"]no-store['"]/.test(files.relay),
  'API JSON ไม่ส่ง header no-store');

if(failures.length){
  console.error(`\nไม่ผ่าน ${failures.length} จุด`);
  process.exit(1);
}
console.log('\nผ่าน — ไม่มีการบังคับ no-cache ในหน้าเว็บ');
