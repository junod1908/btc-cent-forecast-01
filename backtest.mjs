// Backtest harness for btc-cent-forecast-01 (dev tool, not part of the graded run).
// Samples pseudo-checkpoints from the kit's practice series: at minute t the forecaster
// sees prices[0..t] and is scored against prices[t+240], exactly like the real cases.
// Compares persistence against a small log-space adjustment model, fitted by MAE with
// coordinate descent, and validated on a time split (fit early -> test late, and reverse).
import { readFileSync } from 'node:fs';

const KIT = new URL('../btc-cent-forecast-01-kit/input/', import.meta.url).pathname;
const H = 240; // horizon minutes

function loadSeries() {
  const out = [];
  for (let i = 0; i < 6; i++) {
    const c = JSON.parse(readFileSync(`${KIT}p0${i}.in`, 'utf8'));
    out.push({ id: c.case, at: c.at, prices: c.markets[0].prices, start: c.markets[0].start });
  }
  return out;
}

// Features at checkpoint index t (uses prices[0..t] only).
function features(p, t) {
  const x = p[t];
  const lp = (j) => Math.log(p[Math.max(0, j)]);
  const lx = Math.log(x);
  const r = (w) => lx - lp(t - w);
  // EMA of log price, span 720 min, computed from the start of the series.
  let ema = Math.log(p[0]);
  const alpha = 2 / (720 + 1);
  for (let j = 1; j <= t; j++) ema += alpha * (Math.log(p[j]) - ema);
  // Realized vol of 1-min log returns over the last 240 min, scaled to the horizon.
  let s = 0, n = 0;
  for (let j = Math.max(1, t - 239); j <= t; j++) { const d = Math.log(p[j]) - Math.log(p[j - 1]); s += d * d; n++; }
  const volH = Math.sqrt(s / Math.max(1, n)) * Math.sqrt(H);
  // Smoothed anchor: median of the last 5 closes.
  const tail = p.slice(Math.max(0, t - 4), t + 1).slice().sort((a, b) => a - b);
  const anchorMed = tail[Math.floor(tail.length / 2)];
  return {
    x, anchorMed,
    r15: r(15), r60: r(60), r240: r(240), r720: r(720), r1440: r(1440),
    emaGap: lx - ema, volH,
  };
}

function buildSamples() {
  const samples = [];
  for (const s of loadSeries()) {
    const p = s.prices;
    for (let t = 1500; t + H < p.length; t += 15) {
      const f = features(p, t);
      samples.push({ ...f, y: p[t + H], caseId: s.id, t });
    }
  }
  return samples;
}

const mae = (samples, guess) => {
  let s = 0;
  for (const sm of samples) s += Math.abs(guess(sm) - sm.y);
  return s / samples.length;
};

// Model: guess = anchor * exp(a*r60 + b*r240 + c*r1440 + d*emaGap), anchor chosen by flag.
function makeGuess(coef, useMedianAnchor) {
  return (sm) => {
    const base = useMedianAnchor ? sm.anchorMed : sm.x;
    const adj = coef[0] * sm.r60 + coef[1] * sm.r240 + coef[2] * sm.r1440 + coef[3] * sm.emaGap;
    return base * Math.exp(adj);
  };
}

function fit(samples, useMedianAnchor) {
  const coef = [0, 0, 0, 0];
  let best = mae(samples, makeGuess(coef, useMedianAnchor));
  let step = 0.2;
  while (step > 0.005) {
    let improved = false;
    for (let k = 0; k < 4; k++) {
      for (const dir of [1, -1]) {
        const trial = coef.slice(); trial[k] += dir * step;
        const v = mae(samples, makeGuess(trial, useMedianAnchor));
        if (v < best - 1e-9) { best = v; coef[k] = trial[k]; improved = true; }
      }
    }
    if (!improved) step /= 2;
  }
  return { coef, mae: best };
}

const samples = buildSamples();
console.log(`samples: ${samples.length}`);
const mid = Math.floor(samples.length / 2);
const early = samples.slice(0, mid), late = samples.slice(mid);

for (const useMed of [false, true]) {
  const name = useMed ? 'median-anchor' : 'last-price   ';
  console.log(`\n== anchor: ${name} ==`);
  console.log(`persistence MAE  early $${mae(early, (s) => s.x).toFixed(2)}  late $${mae(late, (s) => s.x).toFixed(2)}  all $${mae(samples, (s) => s.x).toFixed(2)}`);
  const fE = fit(early, useMed);
  console.log(`fit-on-early coef [${fE.coef.map((v) => v.toFixed(3)).join(', ')}]  train $${fE.mae.toFixed(2)}  test-late $${mae(late, makeGuess(fE.coef, useMed)).toFixed(2)}`);
  const fL = fit(late, useMed);
  console.log(`fit-on-late  coef [${fL.coef.map((v) => v.toFixed(3)).join(', ')}]  train $${fL.mae.toFixed(2)}  test-early $${mae(early, makeGuess(fL.coef, useMed)).toFixed(2)}`);
  const fA = fit(samples, useMed);
  console.log(`fit-on-all   coef [${fA.coef.map((v) => v.toFixed(3)).join(', ')}]  all $${fA.mae.toFixed(2)}`);
}

// The five true practice checkpoints (answer = next case's last close).
const series = loadSeries();
console.log('\n== true practice checkpoints (persistence vs median anchor) ==');
for (let i = 0; i < 5; i++) {
  const p = series[i].prices, ans = series[i + 1].prices[series[i + 1].prices.length - 1];
  const last = p[p.length - 1];
  const tail = p.slice(-5).slice().sort((a, b) => a - b)[2];
  console.log(`${series[i].id}: actual ${ans.toFixed(2)}  persistence err $${Math.abs(last - ans).toFixed(2)}  median5 err $${Math.abs(tail - ans).toFixed(2)}`);
}
