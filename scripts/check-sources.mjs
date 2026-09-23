// 출처 줄을 본다. 세 가지를 짚는다.
//   - 순서: 1차 출처 → 주요 매체 → 보조 매체 (RUNBOOK_WEEKLY 11절)
//   - 국내·해외 항목에 주요 매체가 하나도 없는 것 (8절)
//   - 원문을 받을 수 없는 매체를 쓴 것 (3절, 7절 차단 표)
//
//   node scripts/check-sources.mjs content/week/2026-W38.md
//
// 매체 분류는 RUNBOOK_WEEKLY 7절 표를 읽어서 만든다. 목록을 여기에 한 번 더
// 적으면 7절을 고칠 때마다 두 곳이 어긋난다.

import { readFileSync } from "node:fs";

const section = readFileSync("docs/RUNBOOK_WEEKLY.md", "utf8")
  .split("### 7. 매체")[1]
  .split("### 8.")[0];

// 표 칸 하나를 매체 이름 목록으로 바꾼다. "(15곳)" 같은 괄호는 이름이 아니다.
const cell = (s) =>
  s.split("·").map((x) => x.replace(/\([^)]*\)/g, "").trim()).filter(Boolean);

const main = new Set();
const sub = new Set();
const blocked = new Set();
for (const line of section.split("\n")) {
  const c = line.split("|").map((x) => x.trim());
  if (c.length < 4) continue;
  if (["국내", "해외", "AI"].includes(c[1])) {
    for (const n of cell(c[2])) if (!n.includes("1차 출처")) main.add(n);
    for (const n of cell(c[3])) sub.add(n);
  }
  // 차단 표의 매체도 매체다. 주요 목록에 없으면 보조로 본다.
  // 막힌 쪽(둘째 칸)은 원문을 대조할 수 없으므로 따로 모아 둔다.
  if (/\(40[13]|연결 실패|챌린지|봇 확인/.test(line)) {
    for (const n of [...cell(c[1]), ...cell(c[2])]) sub.add(n);
    for (const n of cell(c[2])) blocked.add(n);
  }
}

// 표 어디에도 없는 이름은 발표 주체의 1차 출처다.
const rank = (n) => {
  const base = n.replace(/\s*\(Wikipedia\)$/, "");
  return main.has(base) ? 1 : sub.has(base) ? 2 : 0;
};
const TIER = ["1차", "주요", "보조"];

let bad = 0;
const flags = [];
const primary = new Map();
for (const file of process.argv.slice(2)) {
  let field = "";
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const h = line.match(/^## (\S+)/);
    if (h) field = h[1];
    if (!line.startsWith("- **출처**")) continue;
    const names = [];
    for (const m of line.matchAll(/\[([^\]]+)\]\(/g))
      if (!names.includes(m[1])) names.push(m[1]);
    const ranks = names.map(rank);
    names.forEach((n, i) => {
      if (ranks[i] === 0) primary.set(n, (primary.get(n) ?? 0) + 1);
    });
    if (ranks.some((r, i) => i && r < ranks[i - 1])) {
      bad++;
      console.log(file + ": " + names.map((n, i) => `${n}(${TIER[ranks[i]]})`).join(" / "));
    }
    // AI 는 연구소 1차 출처가 주요 자리에 있다(7절 표). 국내·해외는 주요 매체가 있어야 한다.
    if (field !== "AI" && !ranks.includes(1))
      flags.push(`${file} [${field}] 주요 매체 없음: ${names.join(" / ")}`);
    // 위키백과 링크는 위키백과를 받은 것이라 인용된 매체가 막혀 있어도 해당하지 않는다.
    for (const n of names)
      if (blocked.has(n)) flags.push(`${file} [${field}] 받을 수 없는 매체: ${n}`);
  }
}
console.log(bad ? `\n순서가 어긋난 항목 ${bad}건` : "순서 어긋남 없음");

if (flags.length) {
  console.log("\n확인할 것 — 주요 매체에서 먼저 찾고(8절), 막힌 매체는 빼고 받아지는 원문으로 대조한다(3절)");
  for (const f of flags) console.log("  " + f);
}

console.log("\n발표 주체로 본 이름 — 매체가 섞여 있으면 7절 표에 넣는다");
for (const [n, c] of [...primary].sort((a, b) => b[1] - a[1]))
  console.log(`  ${n} (${c}회)`);
