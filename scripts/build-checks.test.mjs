// 빌드의 원고 검사(build-checks.mjs)가 일부러 틀린 원고를 잡는지 본다. 실제 발행물은 빌드가
// 매번 통과시키므로, 여기서는 검사가 살아 있는지(걸려야 할 때 걸리는지)만 본다.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkContent, dateProblems, checkSelectedFill, checkThemeContrast, checkStickyHover, missingRuns } from "./build-checks.mjs";

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

test("날짜 칸의 요일과 범위를 본다", () => {
  const week = (date) => run({ ko: { week: [doc("week", "2026-W39", weekBody("국내 사안", "일이 있었다.", date))] } });
  assert.equal(week("9월 21일–26일 (월–토)"), "");
  assert.equal(week("9월 21일 (월)~9월 22일 (화)"), "");
  assert.match(week("9월 21일 (화)"), /9\/21 은 월요일이다/);
  assert.match(week("9월 22일–21일 (화–월)"), /시작이 끝보다/);
  assert.match(week("9월 21일"), /날짜를 읽지 못했다/);
});

test("주 경계를 넘는 날짜는 가까운 해로 읽는다", () => {
  assert.deepEqual(dateProblems("12월 31일 (목)", "2027-W01"), []);
  assert.deepEqual(dateProblems("6월 29일–7월 3일 (월–금)", "2026-W27"), []);
  assert.deepEqual(dateProblems("Mar 31–Apr 2 (Tue–Thu)", "2026-W14", "en"), []);
  assert.deepEqual(dateProblems("Sep 21 (Tue)", "2026-W39", "en"), ["9/21 은 Mon이다"]);
});

test("영문판이 원본과 어긋나면 잡는다", () => {
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
