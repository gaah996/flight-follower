import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const path = resolve(process.argv[2] ?? 'scripts/fixtures/replay-nzqn-nzwn.jsonl');
const MAGVAR_DEG = Number(process.env.MAGVAR_DEG ?? 22);
const ALT_OFFSET_FT = Number(process.env.ALT_OFFSET_FT ?? -100);

const lines = readFileSync(path, 'utf8').split('\n').filter(Boolean);

let extended = 0;
const out = lines.map((line) => {
  const t = JSON.parse(line);
  const magnetic = t.heading?.magnetic ?? 0;
  const trueHdg = ((magnetic + MAGVAR_DEG) % 360 + 360) % 360;
  const indicated = Math.max(0, (t.altitude?.msl ?? 0) + ALT_OFFSET_FT);
  extended++;
  return JSON.stringify({
    ...t,
    heading: { magnetic, true: trueHdg },
    track: { magnetic },
    altitude: { msl: t.altitude?.msl ?? 0, indicated },
  });
});

writeFileSync(path, out.join('\n') + '\n');
console.log(`extended ${extended} lines in ${path} (magvar=${MAGVAR_DEG}°, alt offset=${ALT_OFFSET_FT}ft)`);
