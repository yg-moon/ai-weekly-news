// 국내 번호 바꾸기를 임시 폴더의 작은 원고로 본다. 실제 content 는 건드리지 않는다.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseOrder, renumberWeek, sourceHash } from "./renumber-week.mjs";

const item = (n, title, extra = "") => `### ${n}. ${title}\n\n- **날짜**: 4월 20일 (월)\n- **무슨 일**: ${title} 본문.${extra}\n`;

const KO_W17 = `---
week: 2026-W17
---

## 국내

${item(1, "가 사건")}
${item(2, "나 사건")}
${item(3, "다 사건")}
## 해외

${item(1, "해외 가")}
${item(2, "해외 나")}
## AI

${item(1, "AI 가")}`;

const EN_W17 = (src) => `---
week: 2026-W17
source: ${src}
---

## Korea

${item(1, "Story A")}
${item(2, "Story B")}
${item(3, "Story C")}
## World

${item(1, "World A")}
${item(2, "World B")}
## AI

${item(1, "AI A")}`;

const KO_Q2 = `---
quarter: 2026-Q2
---

## 국내

### 1. 흐름

- **근거**: [W17 국내 2](../../week/2026-W17/#korea-2) / [W17 국내 3](../../week/2026-W17/#korea-3) / [W18 국내 2](../../week/2026-W18/#korea-2)
- **근거**: [W17 해외 2](../../week/2026-W17/#world-2) / [W17 AI 1](../../week/2026-W17/#ai-1)
`;
const EN_Q2 = (src) => `---
quarter: 2026-Q2
source: ${src}
---

## Korea

### 1. Flow

- **Basis**: [W17 Korea 2](../../week/2026-W17/#korea-2) / [W17 Korea 3](../../week/2026-W17/#korea-3) / [W18 Korea 2](../../week/2026-W18/#korea-2)
- **Basis**: [W17 World 2](../../week/2026-W17/#world-2) / [W17 AI 1](../../week/2026-W17/#ai-1)
`;
const KO_W18 = `---
week: 2026-W18
---

## 국내

${item(1, "라 사건", " 앞서 [W17 국내 1](../2026-W17/#korea-1) 참고.")}`;

const RUN = {
  week: "2026-W17",
  selection: {
    korea: [
      { topic: "가 사건", days: 3, click: [7, 10], rank: 1, over: "x" },
      { topic: "나 사건", days: 1, click: [3, 6], rank: 2 },
      { topic: "다 사건", days: 2, click: [2, 4], rank: 3, review: "빼야" },
      { topic: "빠진 사건", days: 4, click: [1, 1], out: "재검토: 실었어야", replaces: 3 },
    ],
    world: [{ topic: "해외 가", rank: 1 }],
  },
};

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "renumber-"));
  const w = (p, t) => { mkdirSync(join(root, p, ".."), { recursive: true }); writeFileSync(join(root, p), t); };
  w("content/week/2026-W17.md", KO_W17);
  w("content/en/week/2026-W17.md", EN_W17(sourceHash(Buffer.from(KO_W17))));
  w("content/week/2026-W18.md", KO_W18);
  w("content/quarter/2026-Q2.md", KO_Q2);
  w("content/en/quarter/2026-Q2.md", EN_Q2(sourceHash(Buffer.from(KO_Q2))));
  w("data/runs/2026-W17.json", JSON.stringify(RUN, null, 2) + "\n");
  const r = (p) => readFileSync(join(root, p), "utf8");
  return { root, r, done: () => rmSync(root, { recursive: true, force: true }) };
}
const headings = (text, section) =>
  text.split(/^## /m).find((s) => s.startsWith(section)).match(/^### .*$/gm);

test("순서는 1..n 이 한 번씩이어야 한다", () => {
  assert.deepEqual(parseOrder("3,1,2", 3), [3, 1, 2]);
  assert.deepEqual(parseOrder(" 2, 1 ", 2), [2, 1]);
  assert.throws(() => parseOrder("1,2,2", 3), /한 번씩/);
  assert.throws(() => parseOrder("0,1,2", 3), /한 번씩/);
  assert.throws(() => parseOrder("1,2", 3), /항목 수/);
  assert.throws(() => parseOrder("1,a,3", 3), /숫자/);
  const f = fixture();
  try {
    assert.throws(() => renumberWeek({ root: f.root, week: "2026-W17", orderText: "1,2,3,4,5" }), /항목 수/);
    // 한·영 항목 수가 다르면 멈춘다.
    writeFileSync(join(f.root, "content/en/week/2026-W17.md"), EN_W17("x").replace(/### 3\.[\s\S]*?(?=## World)/, ""));
    assert.throws(() => renumberWeek({ root: f.root, week: "2026-W17", orderText: "3,1,2" }), /한·영/);
  } finally { f.done(); }
});

test("국내 묶음 순서와 번호를 바꾸고 다른 구획은 그대로 둔다", () => {
  const f = fixture();
  try {
    renumberWeek({ root: f.root, week: "2026-W17", orderText: "3,1,2" });
    const ko = f.r("content/week/2026-W17.md"), en = f.r("content/en/week/2026-W17.md");
    assert.deepEqual(headings(ko, "국내"), ["### 1. 다 사건", "### 2. 가 사건", "### 3. 나 사건"]);
    assert.deepEqual(headings(en, "Korea"), ["### 1. Story C", "### 2. Story A", "### 3. Story B"]);
    // 국내 구획 밖은 바이트 그대로다.
    const outside = (t) => [t.slice(0, t.indexOf("## 국내")), t.slice(t.indexOf("## 해외"))];
    assert.deepEqual(outside(ko), outside(KO_W17));
    assert.equal(en.slice(en.indexOf("## World")), EN_W17("").slice(EN_W17("").indexOf("## World")));
    // 본문은 제목과 함께 옮겨지고, 길이는 그대로다.
    assert.match(ko, /### 1\. 다 사건\n\n- \*\*날짜\*\*: 4월 20일 \(월\)\n- \*\*무슨 일\*\*: 다 사건 본문\.\n\n### 2\. 가 사건/);
    assert.equal(ko.length, KO_W17.length);
    // 영문판 source 는 새 원본 해시다.
    assert.match(en, new RegExp(`^source: ${sourceHash(readFileSync(join(f.root, "content/week/2026-W17.md")))}$`, "m"));
  } finally { f.done(); }
});

test("그 주의 국내 링크는 앵커와 글자를 함께 고치고, 다른 주·구획 링크는 두며 영문 source 를 맞춘다", () => {
  const f = fixture();
  try {
    const { plan, text } = renumberWeek({ root: f.root, week: "2026-W17", orderText: "3,1,2" });
    const q = f.r("content/quarter/2026-Q2.md"), qe = f.r("content/en/quarter/2026-Q2.md");
    // 옛 2 → 새 3, 옛 3 → 새 1
    assert.match(q, /\[W17 국내 3\]\(\.\.\/\.\.\/week\/2026-W17\/#korea-3\) \/ \[W17 국내 1\]\(\.\.\/\.\.\/week\/2026-W17\/#korea-1\) \/ \[W18 국내 2\]\(\.\.\/\.\.\/week\/2026-W18\/#korea-2\)/);
    assert.match(qe, /\[W17 Korea 3\]\(\.\.\/\.\.\/week\/2026-W17\/#korea-3\) \/ \[W17 Korea 1\]\(\.\.\/\.\.\/week\/2026-W17\/#korea-1\) \/ \[W18 Korea 2\]\(\.\.\/\.\.\/week\/2026-W18\/#korea-2\)/);
    assert.match(q, /\[W17 해외 2\]\(\.\.\/\.\.\/week\/2026-W17\/#world-2\) \/ \[W17 AI 1\]\(\.\.\/\.\.\/week\/2026-W17\/#ai-1\)/);
    // 다른 주간호의 링크도 고친다(옛 1 → 새 2).
    assert.match(f.r("content/week/2026-W18.md"), /\[W17 국내 2\]\(\.\.\/2026-W17\/#korea-2\)/);
    assert.match(qe, new RegExp(`^source: ${sourceHash(Buffer.from(q))}$`, "m"));
    // 고친 링크마다 글자 → 가리키는 제목이 나오고, 전후 제목이 같다.
    assert.equal(plan.links.filter((l) => l.changed).length, 5);
    for (const l of plan.links) assert.equal(l.before, l.after);
    assert.match(text, /content\/quarter\/2026-Q2\.md: W17 국내 1 → 다 사건/);
    assert.match(text, /content\/en\/quarter\/2026-Q2\.md: W17 Korea 3 → Story B/);
    assert.doesNotMatch(text, /다름!/);
  } finally { f.done(); }
});

test("rank 는 새 순위, rank_was 는 처음 순위이고 replaces 와 다른 칸은 그대로다", () => {
  const f = fixture();
  try {
    renumberWeek({ root: f.root, week: "2026-W17", orderText: "3,1,2" });
    const raw = f.r("data/runs/2026-W17.json");
    const k = JSON.parse(raw).selection.korea;
    assert.deepEqual(k.map((x) => [x.rank, x.rank_was]), [[2, 1], [3, 2], [1, 3], [undefined, undefined]]);
    assert.equal(k[3].replaces, 3);
    assert.deepEqual(Object.keys(k[0]), ["topic", "days", "click", "rank", "rank_was", "over"]);
    assert.equal(JSON.parse(raw).selection.world[0].rank, 1);
    assert.ok(raw.endsWith("}\n") && raw.includes('\n        "rank_was": 1,\n') && raw.includes('"review": "빼야"'));
    // 한 번 더 바꿔도 rank_was 는 처음 순위다. 3,1,2 를 세 번 하면 처음으로 돌아온다.
    renumberWeek({ root: f.root, week: "2026-W17", orderText: "3,1,2" });
    renumberWeek({ root: f.root, week: "2026-W17", orderText: "3,1,2" });
    const k3 = JSON.parse(f.r("data/runs/2026-W17.json")).selection.korea;
    assert.deepEqual(k3.map((x) => [x.rank, x.rank_was]), [[1, 1], [2, 2], [3, 3], [undefined, undefined]]);
    assert.equal(f.r("content/week/2026-W17.md"), KO_W17);
    assert.equal(f.r("content/quarter/2026-Q2.md"), KO_Q2);
  } finally { f.done(); }
});

test("같은 순서로 다시 돌리면 아무 파일도 바뀌지 않고, --dry-run 은 쓰지 않는다", () => {
  const f = fixture();
  try {
    const files = ["content/week/2026-W17.md", "content/en/week/2026-W17.md", "content/quarter/2026-Q2.md",
      "content/en/quarter/2026-Q2.md", "content/week/2026-W18.md", "data/runs/2026-W17.json"];
    const snap = () => files.map(f.r);
    const before = snap();
    const dry = renumberWeek({ root: f.root, week: "2026-W17", orderText: "2,3,1", dryRun: true });
    assert.ok(dry.plan.writes.size > 0);
    assert.match(dry.text, /dry-run/);
    assert.deepEqual(snap(), before);
    const same = renumberWeek({ root: f.root, week: "2026-W17", orderText: "1,2,3" });
    assert.equal(same.plan.writes.size, 0);
    assert.deepEqual(snap(), before);
    // 바꾼 뒤 같은 순서(1,2,3)를 다시 돌려도 그대로다.
    renumberWeek({ root: f.root, week: "2026-W17", orderText: "2,3,1" });
    const after = snap();
    assert.equal(renumberWeek({ root: f.root, week: "2026-W17", orderText: "1,2,3" }).plan.writes.size, 0);
    assert.deepEqual(snap(), after);
  } finally { f.done(); }
});

test("원래부터 source 가 맞지 않던 영문판은 덮지 않고 알린다", () => {
  const f = fixture();
  try {
    writeFileSync(join(f.root, "content/en/quarter/2026-Q2.md"), EN_Q2("000000000000"));
    const { plan } = renumberWeek({ root: f.root, week: "2026-W17", orderText: "3,1,2" });
    assert.match(f.r("content/en/quarter/2026-Q2.md"), /^source: 000000000000$/m);
    assert.ok(plan.warnings.some((w) => w.includes("en/quarter/2026-Q2.md") && w.includes("원래부터")));
  } finally { f.done(); }
});
