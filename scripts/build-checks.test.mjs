// 빌드의 원고 검사(build-checks.mjs)가 일부러 틀린 원고를 잡는지 본다. 실제 발행물은 빌드가
// 매번 통과시키므로, 여기서는 검사가 살아 있는지(걸려야 할 때 걸리는지)만 본다.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkContent, dateProblems } from "./build-checks.mjs";

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
  assert.match(run({ ko: ko(quarter("일이 있었다. 또 있었다.", "중요하다.")) }), /무슨 일이 2문장/);
  assert.match(run({ ko: ko(quarter("일이 있었다.", "")) }), /왜 중요한가가 없다/);
  assert.match(run({ ko: ko(quarter("일이 있었다.", "하나다. 둘이다. 셋이다.")) }), /왜 중요한가가 3문장/);
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
