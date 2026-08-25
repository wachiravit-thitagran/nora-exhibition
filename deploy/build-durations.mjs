#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(process.argv[2] || path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));
const MEDIA_DIRS = ['assets/videos', 'assets/color', 'assets/drive', 'assets/students'];

export function mp4Duration(file){
  const data = fs.readFileSync(file);
  const at = data.indexOf(Buffer.from('mvhd'));
  if(at < 0) throw new Error(`ไม่พบ mvhd ใน ${file}`);
  const version = data[at + 4];
  const timescale = data.readUInt32BE(at + (version === 1 ? 28 : 16));
  const units = version === 1
    ? Number(data.readBigUInt64BE(at + 32))
    : data.readUInt32BE(at + 20);
  if(!timescale || !units) throw new Error(`อ่าน duration ไม่ได้จาก ${file}`);
  return units / timescale;
}

const durations = {};
for(const relDir of MEDIA_DIRS){
  const dir = path.join(ROOT, relDir);
  if(!fs.existsSync(dir)) continue;
  for(const name of fs.readdirSync(dir).filter(n => n.toLowerCase().endsWith('.mp4')).sort()){
    const rel = path.posix.join(relDir, name);
    const seconds = Number(mp4Duration(path.join(dir, name)).toFixed(3));
    durations[rel] = seconds;
    const id = name.match(/^([0-9a-f]{24})\.mp4$/)?.[1];
    if(id) durations[id] = Math.max(durations[id] || 0, seconds);
  }
}

const output = path.join(ROOT, 'assets', 'durations.json');
fs.writeFileSync(output, JSON.stringify({ generatedBy:'deploy/build-durations.mjs', durations }, null, 2) + '\n');
console.log(`เขียน ${path.relative(ROOT, output)} แล้ว (${Object.keys(durations).length} keys)`);
