// 한 주간호를 만든 세션의 실행 기록을 data/runs/<WEEK>.json 으로 쓴다.
//
//   node scripts/record-run.mjs 2026-W38 /tmp/session.json
//   node scripts/record-run.mjs 2026-W27 /tmp/after.json --since /tmp/before.json
//
// 입력은 get_session 조회 결과를 그대로 저장한 파일이다. 앞뒤에 다른 글자가
// 붙어 있어도 첫 { 부터 마지막 } 까지만 읽는다.
//
// 정기 실행은 그 호만 만든 세션이라 세션 전체가 곧 그 호의 기록이다. 끝난
// 세션만 받는다. 백필은 한 세션에서 여러 호를 만들므로 한 호를 시작하기 전과
// 발행한 뒤에 조회해 두고 --since 로 그 차이만 남긴다. 시작과 종료 시각은
// 두 조회 파일을 저장한 시각이다.
//
// 발행 시각은 `Publish <WEEK>` 커밋에서 읽는다. 그 커밋의 Claude-Session 이
// 입력 세션과 다르면 다른 세션의 기록을 남기는 것이므로 멈춘다.

import { readFileSync, writeFileSync, mkdirSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";

const [week, file, flag, sinceFile] = process.argv.slice(2);
if (!/^\d{4}-W\d{2}$/.test(week ?? "") || !file || (flag && (flag !== "--since" || !sinceFile))) {
  console.error("사용법: node scripts/record-run.mjs <WEEK> <조회 결과> [--since <시작 전 조회 결과>]");
  process.exit(1);
}

const fail = (msg) => {
  console.error(`기록하지 않음: ${msg}`);
  process.exit(1);
};

const read = (path) => {
  const text = readFileSync(path, "utf8");
  const json = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
  return json.ccr ?? json;
};

// 세션 ID 는 session_ 과 cse_ 두 꼴로 나온다. 뒷부분이 같으면 같은 세션이다.
const bare = (id) => id.replace(/^(session|cse)_/, "");

// 발행물의 시각과 같이 KST 로 적는다.
const kst = (t) =>
  new Date(new Date(t).getTime() + 9 * 3600e3).toISOString().replace(/\.\d+Z$/, "+09:00");

const usageOf = (s) => {
  const u = s.external_metadata?.usage;
  if (!u || typeof u.cost_usd !== "number") fail("조회 결과에 사용량이 없다");
  return u;
};

const after = read(file);
const before = sinceFile ? read(sinceFile) : null;
if (before && bare(before.id) !== bare(after.id)) fail("두 조회 결과가 서로 다른 세션이다");
if (!before && after.session_status === "SESSION_STATUS_RUNNING")
  fail("아직 끝나지 않은 세션이다. 정기 실행은 다음 호 발행 때 기록한다");

const log = execFileSync(
  "git",
  ["log", "-1", `--grep=^Publish ${week}`, "--format=%cI%n%(trailers:key=Claude-Session,valueonly)"],
  { encoding: "utf8" }
).trim();
if (!log) fail(`"Publish ${week}" 커밋이 없다`);
const [published, trailer = ""] = log.split("\n");
const committed = trailer.trim().split("/").pop();
if (!committed || bare(committed) !== bare(after.id))
  fail(`발행 커밋의 세션(${committed || "없음"})이 입력 세션(${after.id})과 다르다`);

const a = usageOf(after);
const b = before ? usageOf(before) : {};
const diff = (k) => (a[k] ?? 0) - (b[k] ?? 0);

const run = {
  week,
  run: before ? "backfill" : "scheduled",
  session: after.id,
  model: after.session_context?.model ?? null,
  served_model: after.external_metadata?.last_served_model ?? null,
  started: kst(before ? statSync(sinceFile).mtime : after.created_at),
  published: kst(published),
  ended: kst(before ? statSync(file).mtime : after.updated_at),
  cost_usd: Math.round(diff("cost_usd") * 100) / 100,
  tokens: {
    input: diff("input_tokens"),
    output: diff("output_tokens"),
    cache_read: diff("cache_read_tokens"),
    cache_write: diff("cache_write_tokens"),
  },
};

mkdirSync("data/runs", { recursive: true });
writeFileSync(`data/runs/${week}.json`, JSON.stringify(run, null, 2) + "\n");
console.log(`data/runs/${week}.json`);
console.log(JSON.stringify(run));
