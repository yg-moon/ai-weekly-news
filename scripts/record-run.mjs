// 이 세션이 한 발행물을 만드는 데 쓴 비용과 시간을 data/runs/<WEEK>.json 으로 쓴다.
// 발행 커밋 직전에 돌린다. RUNBOOK_WEEKLY 14절.
//
//   node scripts/record-run.mjs 2026-W39
//   node scripts/record-run.mjs 2026-W27 --backfill
//
// 비용은 Claude Code 대화 기록(~/.claude/projects/*/*.jsonl)의 토큰을 API 정가로
// 환산한다. 클라우드와 로컬이 같은 형식으로 남기므로 어디서 돌려도 같은 기준이다.
// 세션 조회 값과는 기록 뒤에 나가는 호출만큼만 다르다(2026-09-26 대조).
// 기록은 가장 최근에 고친 대화 기록 하나와 그 세션의 하위 에이전트 기록을 합한다.
// 한 호를 한 세션에서 만들어야 그 세션 전체가 곧 그 호의 기록이 된다.
//
// 읽은 헤드라인은 2절이 /tmp 에 받아 둔 네 목록의 항목 수다. 이 세션이 시작되기
// 전에 만들어진 목록은 다른 주차의 것일 수 있어 세지 않는다.

import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { homedir } from "node:os";

// 달러 / 100만 토큰: 입력, 출력, 캐시 읽기. 캐시 쓰기는 5분이 입력의 1.25배, 1시간이 2배다.
// Opus 5.5 와 Sonnet 5 는 세션 조회 값과 맞춰 확인했다.
const PRICE = {
  "claude-opus-5-5": [4, 20, 0.2],
  "claude-opus-5": [5, 25, 0.5],
  "claude-sonnet-5": [2, 10, 0.2],
  "claude-fable-5-1": [10, 50, 0.25],
  "claude-haiku-4-5": [1, 5, 0.1],
};

const args = process.argv.slice(2);
const week = args.find((a) => /^\d{4}-W\d{2}$/.test(a));
const backfill = args.includes("--backfill");
const given = args.includes("--transcript") ? args[args.indexOf("--transcript") + 1] : null;
if (!week) {
  console.error("사용법: node scripts/record-run.mjs <WEEK> [--backfill] [--transcript <jsonl>]");
  process.exit(1);
}

const fail = (msg) => {
  console.error(`기록하지 않음: ${msg}`);
  process.exit(1);
};

// ---------- 대화 기록 ----------

function latestTranscript() {
  const root = join(homedir(), ".claude", "projects");
  const all = [];
  for (const d of existsSync(root) ? readdirSync(root) : [])
    for (const f of readdirSync(join(root, d)))
      if (f.endsWith(".jsonl")) all.push(join(root, d, f));
  if (!all.length) fail(`${root} 에 대화 기록이 없다`);
  return all.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
}

const main = given ?? latestTranscript();
const subDir = join(dirname(main), basename(main, ".jsonl"), "subagents");
const files = [main, ...(existsSync(subDir) ? readdirSync(subDir).filter((f) => f.endsWith(".jsonl")).map((f) => join(subDir, f)) : [])];

// 한 응답이 여러 줄로 나뉘어 같은 사용량을 되풀이하므로 요청과 메시지로 한 번만 센다.
const calls = new Map();
let started = null;
for (const file of files)
  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (!line) continue;
    let d;
    try {
      d = JSON.parse(line);
    } catch {
      continue;
    }
    if (file === main && d.timestamp && (!started || d.timestamp < started)) started = d.timestamp;
    const m = d.message;
    if (!m?.usage || !m.model || m.model === "<synthetic>") continue;
    calls.set(`${d.requestId}|${m.id}`, { model: m.model, u: m.usage });
  }
if (!calls.size) fail(`${main} 에 사용량이 없다. 대화 기록 형식이 바뀌었는지 본다`);

const tokens = { input: 0, output: 0, cache_read: 0, cache_write: 0 };
const costBy = {};
for (const { model, u } of calls.values()) {
  const p = PRICE[model];
  if (!p) fail(`${model} 의 정가가 PRICE 에 없다`);
  const w = u.cache_creation ?? { ephemeral_5m_input_tokens: u.cache_creation_input_tokens ?? 0 };
  const w5 = w.ephemeral_5m_input_tokens ?? 0;
  const w1 = w.ephemeral_1h_input_tokens ?? 0;
  const t = { input: u.input_tokens ?? 0, output: u.output_tokens ?? 0, cache_read: u.cache_read_input_tokens ?? 0 };
  tokens.input += t.input;
  tokens.output += t.output;
  tokens.cache_read += t.cache_read;
  tokens.cache_write += w5 + w1;
  costBy[model] = (costBy[model] ?? 0) +
    (t.input * p[0] + t.output * p[1] + t.cache_read * p[2] + w5 * p[0] * 1.25 + w1 * p[0] * 2) / 1e6;
}

// ---------- 읽은 헤드라인 ----------

let headlines = 0;
for (const s of ["domestic", "world", "tech", "ai"]) {
  const f = `/tmp/${s}.md`;
  if (!existsSync(f) || statSync(f).mtime < new Date(started)) {
    console.error(`경고: ${f} 가 없거나 이 세션보다 오래됐다. 읽은 헤드라인을 비워 둔다.`);
    headlines = null;
    break;
  }
  headlines += readFileSync(f, "utf8").split("\n").filter((l) => l.startsWith("- ")).length;
}

// ---------- 쓰기 ----------

// 발행물의 시각과 같이 KST 로 적는다.
const kst = (t) =>
  new Date(new Date(t).getTime() + 9 * 3600e3).toISOString().replace(/\.\d+Z$/, "+09:00");

const run = {
  week,
  run: backfill ? "backfill" : "scheduled",
  model: Object.entries(costBy).sort((a, b) => b[1] - a[1])[0][0],
  started: kst(started),
  published: kst(new Date()),
  cost_usd: Math.round(Object.values(costBy).reduce((a, b) => a + b, 0) * 100) / 100,
  headlines,
  tokens,
};

mkdirSync("data/runs", { recursive: true });
writeFileSync(`data/runs/${week}.json`, JSON.stringify(run, null, 2) + "\n");
console.log(`data/runs/${week}.json`);
console.log(JSON.stringify(run));
