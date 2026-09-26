// 실험용. 세션이 자기 기록 파일에서 모델·시간·토큰을 읽을 수 있는지 본다.
// 읽기만 한다. 아무것도 쓰지 않는다.
//
//   node scripts/probe-session.mjs
//
// 기록 파일은 <설정 폴더>/projects/<작업 경로>/<세션 ID>.jsonl 이다.
// 한 응답이 내용 블록마다 한 줄씩 기록되어 usage 가 되풀이되므로 message.id 로 한 번만 센다.
// 하위 에이전트 기록은 <세션 ID>/subagents/ 아래에 따로 있다.

import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const roots = [process.env.CLAUDE_CONFIG_DIR, join(homedir(), ".claude")].filter(Boolean);

// 값은 비밀일 수 있어 이름만 낸다.
console.log("env:", Object.keys(process.env).filter((k) => /CLAUDE|ANTHROPIC|SESSION/i.test(k)).sort().join(" ") || "(없음)");
console.log("home:", homedir(), "cwd:", process.cwd());

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith(".jsonl")) out.push(p);
  }
  return out;
}

const files = roots.flatMap((r) => walk(join(r, "projects")));
console.log(`\n기록 파일 ${files.length}개`);
for (const f of files.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs).slice(0, 10))
  console.log(" ", new Date(statSync(f).mtimeMs).toISOString(), statSync(f).size + "B", f);
if (!files.length) {
  for (const r of roots) console.log("  확인한 곳:", join(r, "projects"), existsSync(join(r, "projects")) ? "있음" : "없음");
  process.exit(1);
}

// 세션 ID 가 환경에 있으면 그 파일이 지금 세션이다. 없으면 가장 최근에 쓰인 최상위 기록으로 짐작한다.
// 다른 세션이 몇 초 차이로 쓰고 있을 수 있어 짐작은 틀릴 수 있다.
const tops = files.filter((f) => !f.includes("/subagents/"));
const envId = process.env.CLAUDE_CODE_SESSION_ID;
const byId = envId && tops.find((f) => f.endsWith(`/${envId}.jsonl`));
console.log("\n세션 찾기:", byId ? "CLAUDE_CODE_SESSION_ID" : `최근 파일로 짐작 (환경의 ID: ${envId ?? "없음"})`);
const main = byId || tops.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
const sid = main.split("/").pop().replace(".jsonl", "");
const subs = files.filter((f) => f.includes(`/${sid}/`));

function summarize(list) {
  const seen = new Set();
  const byModel = {};
  let first = null, last = null, lines = 0, costField = false;
  for (const f of list)
    for (const line of readFileSync(f, "utf8").split("\n")) {
      if (!line.trim()) continue;
      lines++;
      let d;
      try { d = JSON.parse(line); } catch { continue; }
      if (d.timestamp) {
        if (!first || d.timestamp < first) first = d.timestamp;
        if (!last || d.timestamp > last) last = d.timestamp;
      }
      if ("costUSD" in d || "total_cost_usd" in d) costField = true;
      const m = d.message;
      if (!m || typeof m !== "object" || !m.usage) continue;
      const key = m.id ?? d.requestId ?? d.uuid;
      if (seen.has(key)) continue;
      seen.add(key);
      const t = (byModel[m.model ?? "?"] ??= { calls: 0, input: 0, cache_write: 0, cache_read: 0, output: 0 });
      t.calls++;
      t.input += m.usage.input_tokens ?? 0;
      t.cache_write += m.usage.cache_creation_input_tokens ?? 0;
      t.cache_read += m.usage.cache_read_input_tokens ?? 0;
      t.output += m.usage.output_tokens ?? 0;
    }
  return { files: list.length, lines, first, last, costField, byModel };
}

console.log("\n세션:", sid);
console.log("본 세션:", JSON.stringify(summarize([main]), null, 2));
console.log("하위 에이전트 포함:", JSON.stringify(summarize([main, ...subs]), null, 2));
