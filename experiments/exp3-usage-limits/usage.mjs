// 지난 N시간 동안 한 세션(본 세션 + 하위 에이전트)이 쓴 비용을 API 정가로 환산한다.
//
//   node experiments/exp3-usage-limits/usage.mjs <시간> [세션ID] [프로젝트 기록 폴더]
//
// 단가는 scripts/record-run.mjs 와 같다. 다른 세션·claude.ai 대화의 사용량은 잡지 못한다.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
const hours = +(process.argv[2] ?? 5);
const id = process.argv[3] ?? process.env.CLAUDE_CODE_SESSION_ID;
const base = process.argv[4] ?? "/root/.claude/projects/-home-user-AI-Workspace";
if (!id) { console.error("세션 ID 를 주거나 CLAUDE_CODE_SESSION_ID 가 있어야 한다"); process.exit(1); }
const PRICE = { "claude-opus-5-5": [4, 20, 0.2], "claude-opus-5": [5, 25, 0.5], "claude-sonnet-5": [2, 10, 0.2], "claude-fable-5-1": [10, 50, 0.25], "claude-haiku-4-5": [1, 5, 0.1] };
const files = [join(base, id + ".jsonl")];
const sub = join(base, id, "subagents");
if (existsSync(sub)) for (const f of readdirSync(sub)) if (f.endsWith(".jsonl")) files.push(join(sub, f));
const since = Date.now() - hours * 3600e3;
const seen = new Set();
let main = 0, subs = 0;
for (const f of files) for (const line of readFileSync(f, "utf8").split("\n")) {
  if (!line) continue;
  let e; try { e = JSON.parse(line); } catch { continue; }
  const u = e.message?.usage; if (!u || !e.timestamp || Date.parse(e.timestamp) < since) continue;
  const key = (e.message.id ?? "") + (e.requestId ?? ""); if (seen.has(key)) continue; seen.add(key);
  const m = Object.keys(PRICE).find((k) => (e.message.model ?? "").startsWith(k)) ?? "claude-opus-5-5";
  const [pi, po, pc] = PRICE[m];
  const w = u.cache_creation ?? { ephemeral_5m_input_tokens: u.cache_creation_input_tokens ?? 0 };
  const cost = ((u.input_tokens ?? 0) * pi + (u.output_tokens ?? 0) * po + (u.cache_read_input_tokens ?? 0) * pc
    + (w.ephemeral_5m_input_tokens ?? 0) * pi * 1.25 + (w.ephemeral_1h_input_tokens ?? 0) * pi * 2) / 1e6;
  if (f.includes("/subagents/")) subs += cost; else main += cost;
}
console.log(`지난 ${hours}시간: 본 세션 $${main.toFixed(2)} + 하위 에이전트 $${subs.toFixed(2)} = $${(main + subs).toFixed(2)}`);
