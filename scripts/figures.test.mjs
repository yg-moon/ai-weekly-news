// 수치 읽기 규칙(figures.mjs)이 표기마다 맞게 읽는지 본다. 규칙을 고친 뒤 npm test 로 돌린다.
// 사례는 2026-10-03 지난 26개 호에 돌리며 오탐·누락이 났던 표기에서 왔다.

import { test } from "node:test";
import assert from "node:assert/strict";
import { found, itemFigures, koFigures, valuesIn } from "./figures.mjs";

const ko = (t) => koFigures(t).map((f) => f.value);
const item = (t) => itemFigures(t).map((f) => f.raw);
// 본문 한 줄의 첫 수치가 원문 글에서 찾아지는가
const hit = (body, source) => found(itemFigures(body)[0], body, valuesIn(source));

test("한국어 수를 한 덩어리로 읽는다", () => {
  assert.deepEqual(ko("기업가치 8천520억 달러에 1천220억 달러"), [852e9, 122e9]);
  assert.deepEqual(ko("25만2천756마일"), [252756]);
  assert.deepEqual(ko("1조 2천억 원"), [1.2e12]);
  assert.deepEqual(ko("4만5천 명"), [45000]);
  assert.deepEqual(ko("3천 5백 명"), [3500]);
  assert.deepEqual(ko("3,856명에 1,900매"), [3856, 1900]);
  assert.deepEqual(ko("13만 원 이하"), [130000]);
});

test("법 조항의 조는 금액으로 읽지 않는다", () => {
  assert.deepEqual(ko("투표권법 2조를 새로 해석했다"), [2]);
  assert.deepEqual(ko("시가총액 742조 원 증발"), [742e12]);
});

test("영어 표기를 값으로 읽는다", () => {
  const v = (t) => [...valuesIn(t)];
  assert.ok(v("$1.2bn deal").includes(1.2e9));
  assert.ok(v("£750m for shells").includes(750e6));
  assert.ok(v("950M monthly users").includes(950e6));
  assert.ok(v("Qwen3.8-2.4T-A95B").includes(95e9));
  assert.ok(v("seven million barrels a day").includes(7e6));
  assert.ok(v("per million tokens").includes(1e6));
  assert.ok(v("Twenty-two people died").includes(22));
  assert.ok(v("about half a million people").includes(5e5));
  assert.ok(v("five decades ago").includes(50));
  assert.ok(v("Pope Leo XIV").includes(14));
  // 통화 기호 없는 소문자 m 은 미터다
  assert.ok(!v("a 136m bridge").includes(136e6));
});

test("날짜·연도·시각·한 자리 수·모델 번호는 세지 않는다", () => {
  assert.deepEqual(item("21일 오전 2025년 11월 20일 이후 3명이 다쳤다"), []);
  assert.deepEqual(item("오후 7시 29분 가스 폭발"), []);
  assert.deepEqual(item("Opus 5.5와 GPT-5.1, A100"), []);
  assert.deepEqual(item("코스피가 3% 내렸다"), ["3"]);
});

test("반올림하거나 끝자리를 버린 값은 찾은 것으로 본다", () => {
  assert.ok(hit("6.1% 급락", "down 6.12% at close"));
  assert.ok(hit("시가총액 742조 원", "742조7573억원 증발"));
  assert.ok(hit("508㎜ 극한호우", "508.8㎜"));
  assert.ok(hit("약 50만 명이 숨졌다", "about half a million people dead"));
  assert.ok(hit("1300㎞ 넘게 떨어진", "1,327 km away"));
});

test("원문에 없는 값은 찾지 못한다", () => {
  assert.ok(!hit("승객 117명", "carrying 132 passengers and crew"));
  assert.ok(!hit("직원 2,000명", "2,900 workers"));
  assert.ok(!hit("주가가 15% 넘게 올랐다", "shares rose 20%"));
  assert.ok(!hit("갤런당 4.09달러", "more than $4 a gallon"));
});
