/**
 * Release-day forecasts from comparable log(viewers / hour-1 viewers) curves.
 * Leave-one-out tuned constants: Gaussian log-size bandwidth 1.0, median scale
 * 1.05, spread 1.0. Valid curves have finite hour-1 viewers and recorded
 * points in at least 20 of the 24 release-day hours.
 * Pools smaller than 5 use equal weights across all valid curves for the hour.
 * Empty pools use lognormal persistence with 0.15 * sqrt(h - 1) spread.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const LEVELS = [0.05, 0.25, 0.5, 0.75, 0.95];
const Z = [-1.645, -0.674, 0, 0.674, 1.645];
const BW = 1.0;
const MED_SCALE = 1.05;
const SPREAD = 1.0;

interface WeightedPoint { r: number; w: number }
interface Comparable {
  day_start: string;
  hourly: { from: string; viewers: number }[];
}

// Dates are interpreted as UTC timestamps supplied by the case schema.
function parseDayHours(comparable: Comparable): Map<number, number> {
  const result = new Map<number, number>();
  const start = typeof comparable.day_start === 'string'
    ? Date.parse(comparable.day_start) : NaN;
  if (!Number.isFinite(start)) return result;
  for (const point of comparable.hourly ?? []) {
    if (!Number.isFinite(point.viewers) || point.viewers < 0) continue;
    const from = typeof point.from === 'string' ? Date.parse(point.from) : NaN;
    if (!Number.isFinite(from)) continue;
    const hour = Math.floor((from - start) / 3_600_000) + 1;
    if (hour >= 1 && hour <= 24) result.set(hour, point.viewers);
  }
  return result;
}

// Input is sorted by r; interpolate between midpoint cumulative positions.
function weightedQuantile(points: WeightedPoint[], tau: number): number {
  const total = points.reduce((sum, point) => sum + point.w, 0);
  let before = 0;
  let previousPosition = 0;
  let previousValue = points[0].r;
  for (let i = 0; i < points.length; i++) {
    const point = points[i];
    const position = (before + point.w / 2) / total;
    if (tau <= position) {
      if (i === 0) return point.r;
      const fraction = (tau - previousPosition) / (position - previousPosition);
      return previousValue + fraction * (point.r - previousValue);
    }
    before += point.w;
    previousPosition = position;
    previousValue = point.r;
  }
  return points[points.length - 1].r;
}

function finishQuantiles(values: number[]): number[] {
  let previous = 0.01;
  return values.map(value => {
    // The cent floor preserves strict positivity even after rounding.
    const rounded = Math.round(Math.min(1e9, Math.max(0.01, value)) * 100) / 100;
    previous = Math.max(previous, rounded);
    return previous;
  });
}

function baselineQuantiles(p1: number, hour: number): number[] {
  return finishQuantiles(Z.map(z => p1 * Math.exp(z * 0.15 * Math.sqrt(hour - 1))));
}

function hourForecast(p1: number, hour: number, curves: Map<number, number>[]): number[] {
  const pool: WeightedPoint[] = [];
  const unweightedPool: WeightedPoint[] = [];
  for (const curve of curves) {
    const v1 = curve.get(1);
    const vh = curve.get(hour);
    if (v1 === undefined || !Number.isFinite(v1) ||
        vh === undefined || !Number.isFinite(vh) || vh <= 0) continue;
    const distance = Math.log(v1) - Math.log(p1);
    const w = Math.exp(-(distance * distance) / (2 * BW * BW));
    const r = Math.log(vh / v1);
    if (Number.isFinite(r)) unweightedPool.push({ r, w: 1 });
    if (Number.isFinite(r) && Number.isFinite(w) && w > 0) pool.push({ r, w });
  }
  if (pool.length < 5) pool.splice(0, pool.length, ...unweightedPool);
  if (pool.length === 0) return baselineQuantiles(p1, hour);
  pool.sort((a, b) => a.r - b.r);
  const med = weightedQuantile(pool, 0.5);
  return finishQuantiles(LEVELS.map(tau => {
    const q = weightedQuantile(pool, tau);
    const adjusted = MED_SCALE * med + SPREAD * (q - med);
    return p1 * Math.exp(adjusted);
  }));
}

const inputDir = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
mkdirSync(outputDir, { recursive: true });
for (const name of readdirSync(inputDir).filter((name: string) => name.endsWith('.in')).sort()) {
  const id = name.slice(0, -3);
  const data = JSON.parse(readFileSync(join(inputDir, name), 'utf8'));
  if (!Array.isArray(data.levels) || data.levels.length !== LEVELS.length ||
      data.levels.some((level: number, i: number) => !Number.isFinite(level) || level !== LEVELS[i])) {
    throw new Error('Expected levels [0.05,0.25,0.5,0.75,0.95]');
  }
  const first = data.known.find((row: { hour: number }) => Number.isFinite(row.hour) && row.hour === 1);
  if (!first || !Number.isFinite(first.viewers)) throw new Error('Missing finite hour-1 known viewers');
  const p1 = Math.max(1, first.viewers);
  const curves = (data.comparables ?? []).map(parseDayHours).filter((curve: Map<number, number>) =>
    Number.isFinite(curve.get(1)) && curve.size >= 20);
  const hours = data.forecast.map((row: { hour: number }) => {
    if (!Number.isFinite(row.hour) || !Number.isInteger(row.hour) || row.hour < 2 || row.hour > 24) {
      throw new Error('Invalid forecast hour');
    }
    return { hour: row.hour, q: hourForecast(p1, row.hour, curves) };
  });
  writeFileSync(join(outputDir, `${id}.out`), JSON.stringify({ hours }));
}
