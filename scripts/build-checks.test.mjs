// 빌드의 원고 검사(build-checks.mjs)가 일부러 틀린 원고를 잡는지 본다. 실제 발행물은 빌드가
// 매번 통과시키므로, 여기서는 검사가 살아 있는지(걸려야 할 때 걸리는지)만 본다.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkContent, dateProblems, checkSelectedFill, checkThemeContrast, checkStickyHover, missingRuns, badSelections } from "./build-checks.mjs";

const GROUPS = { 국내: "korea", 해외: "world", AI: "ai" };
const KINDS = { week: { groups: GROUPS }, quarter: { groups: GROUPS }, year: { groups: GROUPS } };
const TEXT = { ko: { groups: GROUPS }, en: { groups: { Korea: "korea", World: "world", AI: "ai" } } };
const placeOf = (d) => {
  const [y, t] = d.id.split("-");
  if (!t) return { year: y, q: null };
  const n = Number(t.slice(1));
  return { year: y, q: t[0] === "Q" ? n : n <= 13 ? 1 : n <= 26 ? 2 : n <= 39 ? 3 : 4 };
};

// 구획마다 항목 하나씩인 원고. 빌드의 sectionCounts 처럼 구획별 항목 수를 센다.
const doc = (kind, id, body, lang = "ko", meta = {}) => {
  const n = {};
  for (const chunk of body.split(/^## /m).slice(1)) n[chunk.split("\n")[0].trim()] = (chunk.match(/^### /gm) ?? []).length;
  return { kind, id, lang, meta, body, n };
};
const weekBody = (title = "국내 사안", what = "일이 있었다.", date = "9월 21일 (월)") => `
## 국내

### 1. ${title}

- **날짜**: ${date}
- **무슨 일**: ${what}
- **왜 중요한가**: 중요하다.
- **출처**: [연합뉴스](https://example.com/a)
`;
const run = ({ ko = {}, en = {}, content } = {}) => {
  const sets = (s) => ({ week: s.week ?? [], quarter: s.quarter ?? [], year: s.year ?? [] });
  return checkContent({ SETS: { ko: sets(ko), en: sets(en) }, TEXT, KINDS, CONTENT: content, placeOf }).errors.join("\n");
};

test("맞는 원고는 통과한다", () => {
  assert.equal(run({ ko: { week: [doc("week", "2026-W39", weekBody())] } }), "");
});

test("긴 제목과 부제를 잡는다", () => {
  assert.match(run({ ko: { week: [doc("week", "2026-W39", weekBody("아주 긴 제목이 스물여섯 자를 훌쩍 넘어가 버리는 경우의 예시"))] } }), /제목이 길거나/);
  assert.match(run({ ko: { week: [doc("week", "2026-W39", weekBody("사안 — 부제"))] } }), /제목이 길거나/);
});

test("다른 항목을 번호로 가리키면 잡는다", () => {
  assert.match(run({ ko: { week: [doc("week", "2026-W39", weekBody("국내 사안", "앞의 일(국내 2번)과 이어진다."))] } }), /번호로 가리켰다/);
});

test("AI 기업 이름을 한글로 쓰면 잡는다", () => {
  assert.match(run({ ko: { week: [doc("week", "2026-W39", weekBody("국내 사안", "앤트로픽이 발표했다."))] } }), /이름 표기/);
});

test("앞선 호와 다른 사람 이름 표기를 잡는다", () => {
  assert.match(run({ ko: { week: [doc("week", "2026-W39", weekBody("국내 사안", "번햄 총리가 말했다."))] } }), /사람 이름이 앞선 호와 다르게 적혔다: .*"번햄" → "버넘"/);
  assert.equal(run({ ko: { week: [doc("week", "2026-W39", weekBody("국내 사안", "버넘 총리가 말했다."))] } }), "");
});

test("날짜 칸의 요일과 범위를 본다", () => {
  const week = (date) => run({ ko: { week: [doc("week", "2026-W39", weekBody("국내 사안", "일이 있었다.", date))] } });
  assert.equal(week("9월 21일–26일 (월–토)"), "");
  assert.match(week("9월 21일 (월)~9월 22일 (화)"), /형식이 다르다/);
  assert.match(week("9월 21일 (화)"), /9\/21 은 월요일이다/);
  assert.match(week("9월 22일–21일 (화–월)"), /시작이 끝보다/);
  assert.match(week("9월 21일"), /형식이 다르다/);
});

test("주 경계를 넘는 날짜는 가까운 해로 읽는다", () => {
  assert.deepEqual(dateProblems("12월 31일 (목)", "2027-W01"), []);
  assert.deepEqual(dateProblems("6월 29일–7월 3일 (월–금)", "2026-W27"), []);
  assert.deepEqual(dateProblems("Mar 31–Apr 2 (Tue–Thu)", "2026-W14", "en"), []);
  assert.deepEqual(dateProblems("Sep 21 (Tue)", "2026-W39", "en"), ["9/21 은 Mon이다"]);
});

test("영문판이 원본과 어긋나거나 상대 시점을 쓰면 잡는다", () => {
  const dir = mkdtempSync(join(tmpdir(), "checks-"));
  mkdirSync(join(dir, "week"));
  const koBody = weekBody();
  writeFileSync(join(dir, "week", "2026-W39.md"), koBody);
  const hash = createHash("sha256").update(koBody).digest("hex").slice(0, 12);
  const enBody = (what) => `
## Korea

### 1. A Korean story

- **Date**: Sep 21 (Mon)
- **What happened**: ${what}
- **Why it matters**: It matters.
- **Sources**: [Yonhap](https://example.com/a)
`;
  const ko = { week: [doc("week", "2026-W39", koBody)] };
  const en = (what, source = hash) => ({ week: [doc("week", "2026-W39", enBody(what), "en", { source })] });
  assert.equal(run({ ko, en: en("Something happened."), content: dir }), "");
  assert.match(run({ ko, en: en("He said \"no\"."), content: dir }), /곧은 따옴표/);
  assert.match(run({ ko, en: en("Something happened.", "000000000000"), content: dir }), /원본이 바뀌었다/);
  assert.match(run({ ko: { week: [] }, en: en("Something happened."), content: dir }), /한국어 원본이 없다/);
  assert.match(run({ ko, en: en("Prices fell steeply this week."), content: dir }), /상대 시점/);
  assert.equal(run({ ko, en: en("He said, “We will decide next week.”"), content: dir }), "");
});

test("분기호 항목의 모양을 잡는다", () => {
  const week = (id) => doc("week", id, weekBody());
  const quarter = (what, why) => doc("quarter", "2026-Q3", `
## 국내

### 4. 단발 사안

- **무슨 일**: ${what}
- **왜 중요한가**: ${why}
- **근거**: [W39 국내 1](../../week/2026-W39/#korea-1)
`);
  const ko = (q) => ({ week: [week("2026-W39")], quarter: [q] });
  assert.equal(run({ ko: ko(quarter("일이 있었다.", "중요하다.")) }), "");
  assert.equal(run({ ko: ko(quarter("하나다. 둘이다. 셋이다. 넷이다.", "중요하다.")) }), "");
  assert.match(run({ ko: ko(quarter("하나다. 둘이다. 셋이다. 넷이다. 다섯이다.", "중요하다.")) }), /무슨 일이 5문장/);
  assert.match(run({ ko: ko(quarter("일이 있었다.", "")) }), /왜 중요한가가 없다/);
  assert.match(run({ ko: ko(quarter("일이 있었다.", "하나다. 둘이다. 셋이다.")) }), /왜 중요한가가 3문장/);
});

test("분기호 흐름의 전개는 세 문단, 여덟 문장까지다", () => {
  const quarter = (body) => doc("quarter", "2026-Q3", `
## 국내

### 1. 흐름 사안

- **전개**: ${body}
- **왜 중요한가**: 중요하다.
- **근거**: [W38 국내 1](../../week/2026-W38/#korea-1) / [W39 국내 1](../../week/2026-W39/#korea-1)
`);
  const ko = (q) => ({ week: [doc("week", "2026-W38", weekBody()), doc("week", "2026-W39", weekBody())], quarter: [q] });
  assert.equal(run({ ko: ko(quarter("하나다. 둘이다.\n\n  셋이다. 넷이다. 다섯이다.\n\n  여섯이다. 일곱이다. 여덟이다.")) }), "");
  assert.match(run({ ko: ko(quarter("하나다.\n\n  둘이다.")) }), /전개가 2문단/);
  assert.match(run({ ko: ko(quarter("하나다. 둘이다. 셋이다.\n\n  넷이다. 다섯이다. 여섯이다.\n\n  일곱이다. 여덟이다. 아홉이다.")) }), /전개가 9문장/);
});

test("근거 링크가 없는 항목을 가리키면 잡는다", () => {
  const q = doc("quarter", "2026-Q3", `
## 국내

### 4. 단발 사안

- **무슨 일**: 일이 있었다.
- **왜 중요한가**: 중요하다.
- **근거**: [W39 국내 3](../../week/2026-W39/#korea-3)
`);
  assert.match(run({ ko: { week: [doc("week", "2026-W39", weekBody())], quarter: [q] } }), /근거 링크가 가리키는 항목이 없거나/);
});

test("진행 중 분기호의 기준 주와 흐름 수를 본다", () => {
  const flow = (n, a, b) => `
### ${n}. 흐름 사안

- **전개**: 일이 있었다.

일이 이어졌다.

일이 남았다.
- **왜 중요한가**: 중요하다.
- **근거**: [W${a}](../../week/2026-${a}/#korea-1) / [W${b}](../../week/2026-${b}/#korea-1)
`;
  const single = (n, w) => `
### ${n}. 단발 사안

- **무슨 일**: 일이 있었다.
- **왜 중요한가**: 중요하다.
- **근거**: [${w}](../../week/2026-${w}/#korea-1)
`;
  const weeks = ["W27", "W28", "W29", "W30", "W31"].map((w) => doc("week", `2026-${w}`, weekBody()));
  const q = (through, body) => doc("quarter", "2026-Q3", `\n## 국내\n${body}`, "ko", through ? { through } : {});
  const ok = flow(1, "W27", "W28") + single(2, "W29") + single(3, "W30");
  // 흐름이 하나뿐이어도 단발이 2번부터 오면 통과한다.
  assert.equal(run({ ko: { week: weeks, quarter: [q("2026-W30", ok)] } }), "");
  assert.match(run({ ko: { week: weeks, quarter: [q("2026-W29", ok)] } }), /근거 링크가 가리키는 항목이 없거나 범위 밖이다: 2026-Q3 → \.\.\/\.\.\/week\/2026-W30/);
  assert.match(run({ ko: { week: weeks, quarter: [q("2026-W40", ok)] } }), /through 2026-W40 가 그 분기의 주차가 아니다/);
  assert.match(run({ ko: { week: weeks, quarter: [q("2026-W30", single(1, "W29") + flow(2, "W27", "W28"))] } }), /흐름이 단발보다 앞에 오지 않았다/);
  // 연간호는 진행 중인 분기호를 근거로 걸 수 없다.
  const year = doc("year", "2026", `\n## 국내\n${single(4, "Q3").replace("../../week/2026-Q3/", "../../quarter/2026-Q3/")}`);
  assert.match(run({ ko: { week: weeks, quarter: [q("2026-W30", ok)], year: [year] } }), /2026 → \.\.\/\.\.\/quarter\/2026-Q3/);
  assert.equal(run({ ko: { week: weeks, quarter: [q(null, ok)], year: [year] } }), "");
});

test("고른 탭·칩에 배경이 없으면 걸린다", () => {
  const site = mkdtempSync(join(tmpdir(), "site-"));
  writeFileSync(join(site, "index.html"), '<span class="tab on">a</span><span class="yr on">b</span><span class="on">c</span>');
  assert.deepEqual(checkSelectedFill(site, ".tab.on, .yr.on { background:var(--accent); }"), []);
  const out = checkSelectedFill(site, ".tab.on { background:var(--accent); }\n.yr.on { font-weight:700; }");
  assert.equal(out.length, 1);
  assert.match(out[0], /\.yr\.on/);
});

test("화면 색이 바탕에서 흐리면 걸린다", () => {
  const light = ":root { --bg:#fbfbf9; --text:#191918; --dim:#44443f; --muted:#6b6b64; --line:#9c9c95; --press:color-mix(in srgb, var(--line) 35%, var(--bg)); }";
  assert.deepEqual(checkThemeContrast(light), []);
  assert.match(checkThemeContrast(light.replace("#9c9c95", "#e5e5e0")).join(), /선 색/);
  assert.match(checkThemeContrast(light.replace("#6b6b64", "#a0a09a")).join(), /--muted/);
  assert.match(checkThemeContrast(light.replace("35%", "8%")).join(), /눌림 색/);
  const dark = "@media (prefers-color-scheme: dark) { :root { --bg:#151517; --text:#eeeeec; --dim:#b6b6b0; --muted:#8d8d87; --line:#303136; } }";
  assert.match(checkThemeContrast(`${light}\n${dark}`).join(), /선 색 #303136/);
});

test("배경을 바꾸는 호버가 마우스 전용이 아니면 걸린다", () => {
  assert.deepEqual(checkStickyHover("@media (hover:hover) { .a:hover { background:red; } }\n.b:hover { color:red; }"), []);
  assert.match(checkStickyHover(".a:hover, .a[aria-current] { background:red; }").join(), /\.a:hover/);
  assert.match(checkStickyHover("@media (max-width:460px) { .c:hover { background:red; } }").join(), /\.c:hover/);
});

test("실행 기록이 없는 발행물을 잡는다", () => {
  const runs = [{ week: "2026-W40" }, { week: "2026-Q3" }];
  assert.deepEqual(missingRuns(["2026-W40", "2026-Q3", "2026-W40"], runs), []);
  assert.deepEqual(missingRuns(["2026-W41", "2026-W40", "2026-Q4"], runs), ["2026-Q4", "2026-W41"]);
});

test("W41 부터 선정 기록이 모자란 주간호를 잡는다", () => {
  // 보도량이 rank 순으로 줄고, 빠진 후보는 가장 작다.
  const five = [1, 2, 3, 4, 5].map((rank) => ({ topic: `t${rank}`, days: 6 - rank, outlets: 12 - rank, rank })).concat({ topic: "x", days: 1, outlets: 2, out: "단발" });
  const kor = five.map((t) => ({ ...t, click: [0, 0] }));
  const full = { korea: kor, world: five, ai: five };
  assert.deepEqual(badSelections([{ week: "2026-W40" }, { week: "2026-Q4" }, { week: "2026-W41", selection: full }]), []);
  assert.deepEqual(badSelections([{ week: "2026-W41" }]), ["2026-W41: selection 이 없다"]);
  assert.deepEqual(badSelections([{ week: "2026-W42", selection: { ...full, world: [] } }]), ["2026-W42: world 가 비었다"]);
  assert.deepEqual(badSelections([{ week: "2027-W01", selection: { ...full, ai: five.filter((t) => t.rank !== 3) } }]), ["2027-W01: ai 에 rank 3 가 없다"]);
});

test("W41 부터 선정 기록의 형식과 1면 우선 순서를 본다", () => {
  const five = [1, 2, 3, 4, 5].map((rank) => ({ topic: `t${rank}`, days: 6 - rank, outlets: 12 - rank, rank })).concat({ topic: "x", days: 1, outlets: 2, out: "단발" });
  const kor = five.map((t) => ({ ...t, click: [0, 0] }));
  const full = { korea: kor, world: five, ai: five };
  const sel = (over) => [{ week: "2026-W41", selection: { ...full, ...over } }];
  const swap = (list, a, b) => list.map((t) => (t.rank === a ? { ...t, rank: b } : t.rank === b ? { ...t, rank: a } : t));
  assert.deepEqual(badSelections(sel({})), []);

  // 국내 click 이 없거나 모양이 틀리면 걸린다. 해외는 click 을 보지 않는다.
  assert.match(badSelections(sel({ korea: five })).join(), /korea "t1" 에 click/);
  assert.match(badSelections(sel({ korea: kor.map((t) => (t.rank === 2 ? { ...t, click: [1] } : t)) })).join(), /"t2" 에 click/);
  // 빠진 후보에 out 이 없거나, rank 와 out 이 함께 있거나, days·outlets 가 없으면 걸린다.
  assert.match(badSelections(sel({ world: five.map((t) => (t.out ? { topic: t.topic, days: 1, outlets: 2 } : t)) })).join(), /world "x" 에 rank 1~5 와 out 중 하나/);
  assert.match(badSelections(sel({ ai: five.map((t) => (t.rank === 1 ? { ...t, out: "단발" } : t)) })).join(), /ai "t1" 에 rank 1~5 와 out/);
  assert.match(badSelections(sel({ ai: five.map((t) => (t.rank === 1 ? { topic: "t1", rank: 1 } : t)) })).join(), /"t1" 에 days·outlets/);

  // 역전에 over 가 없으면 걸리고, over 가 있으면 통과한다.
  assert.deepEqual(badSelections(sel({ world: swap(five, 1, 2) })), ['2026-W41: world rank 1 "t2" 에 over 가 없다. 더 크게 다뤄진 "t1" 가 rank 2 다']);
  assert.deepEqual(badSelections(sel({ world: swap(five, 1, 2).map((t) => (t.rank === 1 ? { ...t, over: "되돌리기 어려움" } : t)) })), []);
  // 빠진 후보가 더 크면 실린 항목마다 over 가 있어야 한다.
  const bigOut = five.map((t) => (t.out ? { ...t, outlets: 20 } : t));
  assert.equal(badSelections(sel({ ai: bigOut })).length, 5);
  assert.match(badSelections(sel({ ai: bigOut })).join(), /"x" 가 빠졌다/);
  // 국내는 1면 신문 수와 날 수가 같으면 클릭의 곳, 날 순으로 가른다.
  const tie = (click1, click2) => kor.map((t) => (t.rank === 1 ? { ...t, days: 3, outlets: 9, click: click1 } : t.rank === 2 ? { ...t, days: 3, outlets: 9, click: click2 } : t));
  assert.deepEqual(badSelections(sel({ korea: tie([1, 5], [4, 4]) })), []);
  assert.match(badSelections(sel({ korea: tie([4, 4], [1, 5]) })).join(), /korea rank 1 "t1" 에 over 가 없다/);
  assert.match(badSelections(sel({ korea: tie([2, 5], [3, 5]) })).join(), /korea rank 1 "t1" 에 over 가 없다/);
  assert.deepEqual(badSelections(sel({ korea: tie([3, 5], [3, 5]) })), []);

  // W40 이전은 형식이 달라도 보지 않는다.
  assert.deepEqual(badSelections([{ week: "2026-W40", selection: { korea: five, world: swap(five, 1, 2), ai: [] } }]), []);
});
