// 출처 줄의 매체 순서를 본다. 1차 출처 → 주요 매체 → 보조 매체 순이어야 한다.
// RUNBOOK_WEEKLY 11절 참고.
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
for (const line of section.split("\n")) {
  const c = line.split("|").map((x) => x.trim());
  if (c.length < 4) continue;
  if (["국내", "해외", "AI"].includes(c[1])) {
    for (const n of cell(c[2])) if (!n.includes("1차 출처")) main.add(n);
    for (const n of cell(c[3])) sub.add(n);
  }
  // 차단 표의 매체도 매체다. 주요 목록에 없으면 보조로 본다.
  if (/\(40[13]|연결 실패|챌린지/.test(line))
    for (const n of [...cell(c[1]), ...cell(c[2])]) sub.add(n);
}

// 표 어디에도 없는 이름은 발표 주체의 1차 출처다.
const rank = (n) => {
  const base = n.replace(/\s*\(Wikipedia\)$/, "");
  return main.has(base) ? 1 : sub.has(base) ? 2 : 0;
};
const TIER = ["1차", "주요", "보조"];

let bad = 0;
const primary = new Map();
for (const file of process.argv.slice(2)) {
  for (const line of readFileSync(file, "utf8").split("\n")) {
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
  }
}
console.log(bad ? `\n순서가 어긋난 항목 ${bad}건` : "순서 어긋남 없음");

console.log("\n발표 주체로 본 이름 — 매체가 섞여 있으면 7절 표에 넣는다");
for (const [n, c] of [...primary].sort((a, b) => b[1] - a[1]))
  console.log(`  ${n} (${c}회)`);
