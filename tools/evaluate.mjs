// Leave-one-out backtest for main.ts over the comparables in a practice case.
//
//   node tools/evaluate.mjs [caseFile]
//
// caseFile defaults to the kit's p00.in. Every valid comparable (hour 1 present,
// at least 20 of the 24 release-day hours recorded) becomes a target once: a
// synthetic case is written whose `known` is the target's hour 1, whose
// `comparables` are the other comparables, and the shipped ../main.ts is run on
// it as a subprocess, exactly as the grader runs it. The forecast is scored
// against the target's recorded hours 2..24 with the contest's log-scale
// pinball loss; the house persistence baseline is scored on the same items.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const LEVELS = [0.05, 0.25, 0.5, 0.75, 0.95];
const Z = [-1.645, -0.674, 0, 0.674, 1.645];
const here = dirname(fileURLToPath(import.meta.url));
const mainTs = join(here, '..', 'main.ts');
const caseFile = process.argv[2] ??
  '/home/hatch/workspace/makefun/gta6-twitch-ccu-forecast-01-kit/input/p00.in';

const data = JSON.parse(readFileSync(caseFile, 'utf8'));

function dayHours(comp) {
  const start = Date.parse(comp.day_start);
  const hours = new Map();
  for (const pt of comp.hourly ?? []) {
    const delta = (Date.parse(pt.from) - start) / 3_600_000;
    if (Number.isFinite(delta) && delta >= 0 && delta < 24 && Number.isFinite(pt.viewers)) {
      hours.set(Math.floor(delta) + 1, pt.viewers);
    }
  }
  return hours;
}

function pinball(qs, y) {
  const ly = Math.log(Math.max(1, y));
  let total = 0;
  for (let i = 0; i < LEVELS.length; i++) {
    const d = ly - Math.log(Math.max(1e-9, qs[i]));
    total += 2 * Math.max(LEVELS[i] * d, (LEVELS[i] - 1) * d);
  }
  return total / LEVELS.length;
}

const comps = data.comparables.map((c) => ({ raw: c, hours: dayHours(c) }));
const valid = comps.filter((c) => Number.isFinite(c.hours.get(1)) && c.hours.size >= 20);

const subsets = {
  all: () => true,
  'big50 (hour-1 >= 50k)': (t) => t.hours.get(1) >= 50_000,
  'gtalike (>=20k, rolling)': (t) => t.hours.get(1) >= 20_000 &&
    /rolling|midnight local/i.test(t.raw.unlock ?? ''),
};
const sums = {};
const baseSums = {};
const counts = {};
for (const key of Object.keys(subsets)) { sums[key] = 0; baseSums[key] = 0; counts[key] = 0; }

const work = mkdtempSync(join(tmpdir(), 'gta6-loo-'));
const inDir = join(work, 'in');
const outDir = join(work, 'out');
mkdirSync(inDir); mkdirSync(outDir);

for (let i = 0; i < valid.length; i++) {
  const target = valid[i];
  const p1 = Math.max(1, target.hours.get(1));
  const pool = valid.filter((_, j) => j !== i).map((c) => c.raw);
  const synthetic = {
    schema: 'makefun/twitch-ccu-case/v1',
    id: 'loo',
    day_start: target.raw.day_start,
    levels: LEVELS,
    known: [{ hour: 1, viewers: target.hours.get(1) }],
    forecast: Array.from({ length: 23 }, (_, k) => ({ hour: k + 2 })),
    comparables: pool,
  };
  writeFileSync(join(inDir, 'loo.in'), JSON.stringify(synthetic));
  execFileSync('node', [mainTs], {
    env: { ...process.env, MAKEFUN_INPUT_DIR: inDir, MAKEFUN_OUTPUT_DIR: outDir },
    stdio: 'pipe',
  });
  const out = JSON.parse(readFileSync(join(outDir, 'loo.out'), 'utf8'));
  const byHour = new Map(out.hours.map((row) => [row.hour, row.q]));
  for (let h = 2; h <= 24; h++) {
    const y = target.hours.get(h);
    if (y === undefined) continue;
    const loss = pinball(byHour.get(h), y);
    const base = pinball(Z.map((z) => p1 * Math.exp(z * 0.15 * Math.sqrt(h - 1))), y);
    for (const [key, test] of Object.entries(subsets)) {
      if (test(target)) { sums[key] += loss; baseSums[key] += base; counts[key] += 1; }
    }
  }
}

console.log(`LOO over ${valid.length} valid comparables from ${caseFile}`);
for (const key of Object.keys(subsets)) {
  if (counts[key] === 0) continue;
  console.log(`${key}: model ${(sums[key] / counts[key]).toFixed(4)} vs baseline ${(baseSums[key] / counts[key]).toFixed(4)} over ${counts[key]} hour-items`);
}
