// btc-cent-forecast-01 entry: a shrunk mean-reversion forecaster for Bitcoin's price 240 minutes ahead.
//
// Method (fitted on the kit's practice recording, validated on a time split — see backtest.mjs):
// the score is mean absolute error, so the target is the conditional median of the close at
// at+240min. That median sits close to the checkpoint close, but not on it: over the practice
// window, the last 4 hours' move reverted by about a quarter over the next 4 hours, the last
// day's move reverted slightly too, and the gap to the 12-hour EMA partly persisted. The guess is
//
//   guess = x * exp(-0.02*r60 - 0.26*r240 - 0.15*r1440 + 0.17*emaGap)
//
// in log space, where x is the checkpoint close, rW is the log return over the last W minutes and
// emaGap is log(x / EMA720). The fitted coefficients were shrunk to 75% before shipping: the
// unshrunk fit beat persistence by ~10% of MAE on a thousand pseudo-checkpoints in both time
// directions, and the shrinkage keeps most of that edge while bounding the loss if the final's
// 48 hours behave differently. Pure persistence is the house baseline itself and can never score
// strictly below it, so a disciplined adjustment is the only way to a prize.
//
// Contract (from the kit): read every <id>.in in the input directory — canonical JSON
// {"schema":"makefun/btc-cent-case/v1","case","at","horizon_minutes","markets":[{"id","name",
// "start","prices"}]} with one BTC/USDC market whose prices are one close a minute up to `at` —
// and write <id>.out as {"forecasts":[{"case":"<id>","price":<number>}]}, the price a finite
// number in (0, 10,000,000) on the 5-decimal grid. Runs offline, deterministic, stdlib only.

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const INPUT_DIR = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const OUTPUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

/** The smallest positive price on the grid: one unit of its 5 decimals. */
const MIN_PRICE = 0.00001;
/** The largest grid price below the scorer's exclusive 10,000,000-dollar cap. */
const MAX_PRICE = 9_999_999.99999;

/** Adjustment weights on [r60, r240, r1440, emaGap], fitted then shrunk to 75%. */
const W = [-0.02, -0.26, -0.15, 0.17];
/** EMA span in minutes for the trend gap. */
const EMA_SPAN = 720;

interface CaseMarket {
  id: string;
  prices: number[];
}

interface Case {
  markets: CaseMarket[];
}

/** x kept on the grid's 5 decimals and inside the scorer's (0, 10,000,000). */
const price5 = (x: number): number => Math.round(Math.min(MAX_PRICE, Math.max(MIN_PRICE, x)) * 1e5) / 1e5;

/** The forecast for one market: the checkpoint close, adjusted in log space. */
function forecast(m: CaseMarket): number {
  if (!Array.isArray(m.prices) || m.prices.length === 0) throw new Error(`market ${m.id} has no prices`);
  const p = m.prices;
  const t = p.length - 1;
  const x = p[t] as number;
  if (typeof x !== 'number' || !Number.isFinite(x) || x <= 0) throw new Error(`market ${m.id}'s last price is not a positive finite number`);
  const lx = Math.log(x);
  const logAt = (j: number): number => Math.log(p[Math.max(0, j)] as number);
  const r60 = lx - logAt(t - 60);
  const r240 = lx - logAt(t - 240);
  const r1440 = lx - logAt(t - 1440);
  // EMA of the log price over the whole series, span EMA_SPAN minutes.
  let ema = Math.log(p[0] as number);
  const alpha = 2 / (EMA_SPAN + 1);
  for (let j = 1; j <= t; j++) ema += alpha * (Math.log(p[j] as number) - ema);
  const emaGap = lx - ema;
  const adj = W[0] * r60 + W[1] * r240 + W[2] * r1440 + W[3] * emaGap;
  return price5(x * Math.exp(adj));
}

mkdirSync(OUTPUT_DIR, { recursive: true });
// Every case file, in name order, so two runs write the same bytes.
const inputs = readdirSync(INPUT_DIR).filter((f) => f.endsWith('.in')).sort();
for (const file of inputs) {
  const id = file.slice(0, -'.in'.length);
  const c = JSON.parse(readFileSync(join(INPUT_DIR, file), 'utf8')) as Case;
  if (!Array.isArray(c.markets) || c.markets.length !== 1) throw new Error(`${file} does not hold exactly one market`);
  writeFileSync(join(OUTPUT_DIR, `${id}.out`), `${JSON.stringify({ forecasts: [{ case: id, price: forecast(c.markets[0] as CaseMarket) }] })}\n`);
}
