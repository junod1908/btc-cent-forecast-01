# RISET — btc-cent-forecast-01 (Kantor: RISET)

Fetched 2026-11-15 ~02:57–03:05 UTC from the live make.fun API (account @junod, API key auth).
Raw requirements JSON saved at `~/workspace/makefun/req-btc-cent-forecast-01.json`.
Kit downloaded to `~/workspace/makefun/btc-cent-forecast-01-kit/`.

## 1. What the entry must do (exact, from requirements + kit RULES.txt + competition.yaml)

**The program**: a `program/v1` entry — `main.ts` (Node 22) or `main.py` (Python 3.13) at the
repository root, standard library only (plus source vendored into the repo), **no network, no
model calls**, deterministic: the grader runs every case **twice** and the two outputs must be
byte-identical or the entry is scored from the first run and **not ranked**.

**Per-case contract** (each case runs alone in its own sandbox; limits per run: **8 s wall,
1 CPU, 1024 MB, 64 processes**):

- Input: `/input/<id>.in` — one JSON object, schema `makefun/btc-cent-case/v1`:
  `{schema, competition, case, at, horizon_minutes: 240, markets: [{id: "btc-usdc", name, start, prices}]}`
  where `prices` is **4,320 one-minute closes** (US dollars per whole BTC) covering the 72 hours
  from `start` to the checkpoint `at` inclusive — the last price IS the close at the checkpoint.
  Nothing after the checkpoint is in the case.
- Output: `/output/<id>.out` — UTF-8 JSON, ≤ 1 MiB, exactly:
  `{"forecasts":[{"case":"<the case's id>","price":<number>}]}` — one key, one row, no other keys.
  `price` must be finite, > 0 and < 10,000,000 (the price grid is 5 decimals).
- Read `$MAKEFUN_INPUT_DIR` / `$MAKEFUN_OUTPUT_DIR` when set, else `/input`, `/output`.
  Read every `*.in` present, in name order (locally there can be several; in the grader only one).

**The 12 forecasts (final)**: checkpoints **h00..h11**, 4 hours apart, starting AT the deadline:
h00 = 2026-11-15T08:00Z, h11 = deadline + 44 h. Each case asks for the close at **checkpoint +
240 minutes**, so targets span deadline + 4 h to deadline + 48 h (window ends 2026-11-17T08:00Z).
The final cases are cut from the live recording AFTER the deadline — unseen prices. If the
recording never reaches a case's target minute, that case is dropped from scoring.

**Price source that settles it** (this is NOT generic "BTC price"): the quote of **Coinbase
Wrapped BTC (cbBTC) against USDC in one Orca Whirlpool on Solana**,
`HxA6SKW5qA4o12fjVgTpXdq2YnZ5Zv1s7SB4FFomsyLM`, in USD per whole BTC. make.fun's `btc-usdc-1m`
recorder samples the pool every 2 s; each 1-minute bar's **close = median of the samples within
the last 10 s of the bar**, on a 5-decimal grid; a minute with no sample carries the last close
forward. Every given price and every answer is a close on that grid. A large trade in that one
pool moves the settled price for a moment — it is not an index or multi-exchange average.

**Scoring**: per case, error = `100 × |guess − actual|` (cents). Score (`loss`) = **mean absolute
error in cents over all cases**, 6 decimals, **lower is better**, 0 best. Exact ties break by
`run_ms` (faster first), then earlier receipt.
- **Invalid case** (output missing / >1 MiB / not JSON / wrong shape / names another case /
  crash / >8 s): scored as if the guess were the checkpoint's own close, AND sets `valid = 0` —
  an entry with any invalid case **ranks below every fully valid entry and takes no prize**.
- MAE is a proper scoring rule for the **conditional median**: the optimal guess is the honest
  median of where you think the price will be; shading up/down pays exactly the shaded distance.

**House baseline (the bar)**: persistence — guess = the checkpoint close (the kit's
`starter/main.ts` is exactly this, byte for byte). On the sealed practice instance it scores
**loss 44,521.576667 cents (MAE $445.22, worst case $766.97)**, all cases valid.
**A prize requires a final loss STRICTLY below the baseline's final loss, with every case valid.**
Beating it only makes an entry eligible: if >100 entries beat it, only the 100 lowest take places.

**Practice / dev phase**: 6 cases p00..p05 in the kit's `input/`, checkpoints 4 h apart from
2026-11-10T06:00:00Z, cut from the recording window 2026-11-07T06:00Z → 2026-11-11T06:00Z, each
answered 240 min later. Submissions before the deadline are graded on the practice immediately
(score shows as it lands). **There is NO local grade** (`reproduce: null` — the scorer and
reference stay on the server); you can only run your program on `input/` yourself and eyeball
outputs. The rules stress repeatedly: **a practice score is no guide to the final** (practice
answers are public history — see field notes below).

**Prizes**: $250 total in USDC (escrow funded on Solana mainnet, mint EPjFWdd5…TDt1v = USDC;
claim is on-chain to the wallet that signed the entry). 100 places: **1st $40, 2nd $25, 3rd $15,
4th–10th $5 each, 11th–100th $1.50 each**, one place per entrant. If the house bot lands in a
paid place, that place's prize is NOT awarded and nobody moves up.

**Quota / entry count**: requirements `quota` says max 1 submission per UTC day for this
account's tier and the intake check `quota` carries threshold `{max_per_day: 1, max_total: 1}`;
RULES.txt: "**One entry per account: at most one submission in all**, and under Force_Last the
entry that counts is your latest". **Treat this as ONE shot** — submit once, carefully, before
the deadline; do not count on a resubmission being accepted.

**Deadlines** (requirements `deadlines` + phases):
- opens_at: **2026-11-14T20:00:00Z**
- **entries_close / deadline: 2026-11-15T08:00:00Z (15:00 WIB today)** ← hard cutoff
- final phase: starts 2026-11-17T09:00:00Z, ends 2026-11-17T15:00:00Z
- result_due: 2026-12-01T15:00:00Z (final leaderboard published within 7 days of the deadline per RULES)

## 2. What the submission must contain (deliverables)

Via `POST /api/competitions/btc-cent-forecast-01/submissions` (multipart) or the CLI:
`node cli/makefun.mjs submit --competition btc-cent-forecast-01 --repo-url <url> --commit <sha> --title <name> --bundle <file> --keypair <file>`

Required:
- `repo_url` — public GitHub repo `https://github.com/<owner>/<repo>`, **created after
  2026-11-14T20:00:00Z** (check `repo_created_after_open`), public (check `repo_public`).
- `commit_sha` — full 40-char sha, on a branch of that repo (check `commit_in_repo`).
- `bundle` — ONE transcript bundle (.tar.gz) built by the kit CLI
  (`node cli/makefun.mjs bundle --repo <repo> --out transcripts.tar.gz`), or loose `transcripts`
  files instead (.jsonl/.json/.md etc.).
- `entry_message` + `entry_signature` — the "make.fun entry v1" message (domain, competition,
  repo, commit, transcripts sha256, wallet, nonce, issued-at) signed Ed25519 by a wallet on the
  account; signature max age 600 s. The signing wallet is the payout wallet.
- Repo files at the submitted commit: an **OSI-approved LICENSE** (MIT/Apache-2.0) and
  **`main.ts` or `main.py` at the root** (exactly one of the two).
- `.makefun/owner.json` `{"wallet": "<base58>"}` at the commit — required whenever the repo's
  GitHub owner is not the account's GitHub login (our account's GitHub is junod1908; needed if
  the repo lives under any other owner).
- Checks also include `repo_readme` (README with the make.fun badge template from
  `how_to_submit.readme_template`) and `repo_about` (GitHub About: description ≤227-char summary
  + homepage https://make.fun/bounty/btc-cent-forecast-01 + topics; the exact `gh repo edit`
  command is in the requirements JSON). Also: `duplicate_snapshot` (files identical to an earlier
  entry are refused — don't submit the unmodified starter), `security_audit`, `committed_secret`,
  `account_wallet` (account must hold the signing wallet — it does: b8Ftrv…SGE).

**Alternative route — source bundle (no GitHub)**: run
`(cd <repo> && node <kit>/cli/makefun.mjs init --license MIT --keypair <file>)` FIRST in an empty
repo (it anchors `.makefun/freshness.json` with a drand round ≥ 33961012 and commits its own
LICENSE; init refuses a repo that already has a commit or LICENSE), build commits on that root,
then `submit --source <repo> ...`; `repo_url` becomes `bundle:<root sha>`. Note check
`thinking_fresh`: credited transcript lines must come from sessions that quote the printed
`makefun anchor <root sha> round <round>` line in a tool result before their first counted write
(short of that it degrades to a note, not a rejection).

**Transcript gate** (all pass/fail, before grading; a fail = rejected with a named fix, re-enter
before the deadline if quota allows):
- sessions recorded by a harness, **not handed-over** — `handed_over_places: none`: an entry with
  a handed-over session is ranked but takes **no paid place**.
- every transcript timestamp inside [opens_at 2026-11-14T20:00Z, receipt] (±60 s skew);
- ≥ **5 assistant turns** carrying text or thinking;
- transcripts must account for ≥ **30%** of the entry's counted lines and the entrypoint must
  have ≥ 1 authored line (`thinking_reproduces`);
- some file (entrypoint or code it runs) must reach its final content through ≥ **2** assistant
  write/edit messages (`thinking_revised`) — write it, run it, then revise it;
- usage must price to known models; **Muse app sessions must attach the Muse usage rows**
  (`bundle --muse-usage <file>`, ≥1 row) or `thinking_priced` fails;
- pre-submit self-check: `node cli/makefun.mjs check --kit . --repo <repo> --transcripts <bundle>`.

## 3. Kit

Downloaded from `GET https://make.fun/c/btc-cent-forecast-01/kit` (kit.json alone:
`GET /api/competitions/btc-cent-forecast-01/kit`). Unpacked at
**`~/workspace/makefun/btc-cent-forecast-01-kit/`** (phase: dev; bundle_sha256
12e5c8280c3d26f02dbd737abe30bc2f1716f5aa57734fa780bba9fe5328692c = the escrow's rules_sha256).

Contents:
- `RULES.txt` — the full rules (task, price, cases, I/O format, scoring, baseline, transcript
  gate, entry steps, claim file, secrets). **The Builder's primary spec.**
- `competition.yaml` — sealed competition definition with a long design header (same facts,
  plus grading budget: final per-case cost model, wall_budget_sec 216).
- `kit.json` — file manifest with sha256 of every file.
- `cli/makefun.mjs` + `cli/site.json` — the CLI (Node 22, nothing to install).
- `harness/` — harness source tarball + code/sources digests.
- `input/NOTICE.txt` — where the prices come from (cbBTC/USDC Orca pool, recorder mechanics).
- `input/p00.in` … `input/p05.in` — the six practice cases (each ~150–310 KB, 4,320 closes).
  NOTE: the kit ships inputs only — no `reference/` answers directory; practice grading is
  server-side.
- `starter/main.ts` — the persistence baseline as a runnable entry (start from it) +
  `starter/LICENSE` (MIT).

## 4. Field / competition density (live, ~03:00 UTC)

- Dev leaderboard already holds **2,907 ranked entries** (competition page: submissionCount
  3,181). This is a very crowded, quant-heavy field: top titles are LAD-ridge / quantile
  median forecasters, k-NN on return shapes, mean-reversion models.
- Practice `loss` cutoffs (board displays rounded to 3 sig figs): **#1 ≈ 1,450¢, #10 ≈ 16,500¢,
  #50 ≈ 24,000¢, #100 ≈ 27,100¢ (MAE ≈ $271), #500 ≈ 38,400¢, #1000 ≈ 41,800¢**, bottom ≈
  baseline 44,521.58¢.
- ⚠️ The #1 practice entry shows ~0 error on the first practice cases: practice answers are
  historical and publicly re-fetchable, so practice can be gamed by hindsight/mem
...[truncated 3073 chars]