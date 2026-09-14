// 헤드라인 목록에서 패턴을 미리 정하지 않고 자주 등장한 말을 뽑는다.
//
// 후보를 전수로 모아도, 순위를 매길 때 "내가 떠올린 주제"만 세면 같은 편향이
// 한 단계 뒤에서 되살아난다. 이 도구는 무엇을 셀지 데이터가 정하게 한다.
// RUNBOOK 4절 참고.
//
//   node scripts/rank-topics.mjs <헤드라인파일> [--top 40]
//   node scripts/rank-topics.mjs <헤드라인파일> --covered "용혜인,호르무즈,종부세"
//
// --covered 를 주면 상위 목록 중 선정에 반영되지 않은 것을 경고한다.
// 선정을 마친 뒤 반드시 한 번 돌린다.

import { readFileSync } from "node:fs";

const STOP = new Set(
  `있다 없다 대한 위해 이번 오늘 내일 어제 그리고 하지만 대해 통해 관련 발표 밝혀 밝혔
   말했 전했 나서 나섰 따르 따라 했다 한다 된다 됐다 지난 올해 내년 작년 사람 우리 모두
   다시 처음 단독 속보 종합 영상 사진 현장 기자 뉴스 인터뷰 그래픽 이라며 라며 라고
   대비 최대 최고 최초 무슨 이유 상황 경우 문제 결과 정도 수준 가능 계획 예정 전망
   분석 지적 주장 요구 강조 확인 한국 만원 가능성 이라고 한다는 된다는 대한민국`
    .split(/\s+/)
);
const PARTICLE = /(은|는|이|가|을|를|에|의|도|와|과|로|으로|에서|에게|부터|까지|만|들|씨|측)$/;

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
const top = Number(args[args.indexOf("--top") + 1]) || 40;
const covered = (args[args.indexOf("--covered") + 1] ?? "")
  .split(",").map((s) => s.trim()).filter(Boolean);

if (!file) {
  console.error("usage: node scripts/rank-topics.mjs <헤드라인파일> [--top N] [--covered \"a,b,c\"]");
  process.exit(1);
}

const heads = readFileSync(file, "utf8")
  .split("\n").filter((l) => l.startsWith("- ")).map((l) => l.slice(2).trim());

const freq = new Map();
const sample = new Map();
for (const h of heads) {
  const seen = new Set();
  for (const raw of h.match(/[가-힣]{2,8}/g) ?? []) {
    const t = raw.replace(PARTICLE, "");
    if (t.length < 2 || t.length > 6 || STOP.has(t) || seen.has(t)) continue;
    seen.add(t);
    freq.set(t, (freq.get(t) ?? 0) + 1);
    if (!sample.has(t)) sample.set(t, h);
  }
}

const sorted = [...freq].sort((a, b) => b[1] - a[1]).slice(0, top);
console.log(`헤드라인 ${heads.length}건 · 토큰 ${freq.size}종 · 상위 ${top}개\n`);
for (const [t, n] of sorted) {
  console.log(`${String(n).padStart(3)}  ${t.padEnd(8)} ${sample.get(t).slice(0, 58)}`);
}

if (covered.length) {
  // 선정한 주제의 토큰이 상위 목록의 어느 항목과도 겹치지 않으면 빠뜨린 것이다.
  const miss = sorted.filter(([t]) => !covered.some((c) => t.includes(c) || c.includes(t)));
  console.log(`\n${"=".repeat(60)}`);
  if (!miss.length) {
    console.log("상위 목록이 모두 선정에 반영됐다.");
  } else {
    console.log(`선정에 반영되지 않은 상위 토큰 ${miss.length}개 — 빠뜨린 사안이 없는지 확인한다.\n`);
    for (const [t, n] of miss) console.log(`  ${String(n).padStart(3)}  ${t.padEnd(8)} ${sample.get(t).slice(0, 52)}`);
  }
}
