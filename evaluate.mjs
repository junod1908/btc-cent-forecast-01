// Evaluate fixed candidate coefficient sets (no fitting) on: early split, late split,
// and the five true practice checkpoints. Used to pick the shipped coefficients.
import { readFileSync } from 'node:fs';

const KIT = new URL('../btc-cent-forecast-01-kit/input/', import.meta.url).pathname;
const H = 240;

function loadSeries() {
  const out = [];
  for (let i = 0; i < 6; i++) {
    const c = JSON.parse(readFileSync(`${KIT}p0${i}.in`, 'utf8'));
    out.push({ id: c.case, prices: c.markets[0].prices });
  }
  return out;
}

function features(p, t) {
  const x = p[t], lx = Math.log(x);
  const r = (w) => lx - Math.log(p[Math.max(0, t - w)]);
  let ema = Math.log(p[0]);
  const alpha = 2 / (720 + 1);
  for (let j = 1; j <= t; j++) ema += alpha * (Math.log(p[j]) - ema);
  return { x, r60: r(60), r240: r(240), r1440: r(1440), emaGap: lx - ema };
}

const series = loadSeries();
const samples = [];
for (const s of series) {
  const p = s.prices;
  for (let t = 1500; t + H < p.length; t += 15) samples.push({ ...features(p, t), y: p[t + H] });
}
const mid = Math.floor(samples.length / 2);
const early = samples.slice(0, mid), late = samples.slice(mid);
const true5 = [];
for (let i = 0; i < 5; i++) {
  const p = series[i].prices;
  true5.push({ ...features(p, p.length - 1), y: series[i + 1].prices[series[i + 1].prices.length - 1] });
}

const mae = (ss, g) => ss.reduce((a, s) => a + Math.abs(g(s) - s.y), 0) / ss.length;
const withCoef = (c) => (s) => s.x * Math.exp(c[0] * s.r60 + c[1] * s.r240 + c[2] * s.r1440 + c[3] * s.emaGap);

const candidates = {
  'persistence        ': [0, 0, 0, 0],
  'fit-on-all raw     ': [-0.013, -0.375, -0.200, 0.244],
  'fit-on-all x0.8    ': [-0.010, -0.300, -0.160, 0.195],
  'consensus rounded  ': [-0.03, -0.34, -0.20, 0.22],
  'consensus x0.75    ': [-0.0225, -0.255, -0.15, 0.165],
  'revert-240 only    ': [0, -0.34, 0, 0],
  'revert-240 x0.75   ': [0, -0.255, 0, 0],
};
for (const [name, c] of Object.entries(candidates)) {
  const g = withCoef(c);
  console.log(`${name} early $${mae(early, g).toFixed(2)}  late $${mae(late, g).toFixed(2)}  all $${mae(samples, g).toFixed(2)}  true5 $${mae(true5, g).toFixed(2)}`);
}
