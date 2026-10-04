import { test } from "node:test";
import assert from "node:assert/strict";
import { itemsOf, findItems, positions } from "./search.mjs";

test("항목을 읽고 출처·근거 줄은 뺀다", () => {
  const items = itemsOf(`
## 국내

### 1. 홈플러스 전 점포 **휴업**

- **날짜**: 7월 13일 (월)
- **무슨 일**: 홈플러스가 [임시휴업](https://example.com)에 들어갔다.
- **왜 중요한가**: 청산 가능성이 커졌다.
- **출처**: [연합뉴스](https://example.com/a)
`);
  assert.deepEqual(items, [{ group: "국내", num: 1, title: "홈플러스 전 점포 휴업", text: "홈플러스가 임시휴업에 들어갔다. 청산 가능성이 커졌다." }]);
});

test("낱말이 모두 든 항목을 제목 일치, 최신순으로 찾는다", () => {
  const entries = [
    ["코스피 폭락", "홈플러스 얘기도 있었다.", "a", ""],
    ["홈플러스 휴업", "전 점포가 문을 닫았다.", "b", ""],
    ["법원, 홈플러스 회생 폐지", "회생절차를 폐지했다.", "c", ""],
  ];
  assert.deepEqual(findItems(entries, "홈플러스").hits.map((e) => e[2]), ["b", "c", "a"]);
  assert.deepEqual(findItems(entries, "홈플러스  회생").hits.map((e) => e[2]), ["c"]);
  assert.deepEqual(findItems(entries, "홈플러스", true).hits.map((e) => e[2]), ["a", "b", "c"]);
  assert.deepEqual(findItems(entries, "  ").hits, []);
  // 제목에 없으면 본문에 많이 나온 항목이 앞이다.
  const body = [["가", "이재명", "x", ""], ["나", "이재명 이재명", "y", ""]];
  assert.deepEqual(findItems(body, "이재명").hits.map((e) => e[2]), ["y", "x"]);
  assert.deepEqual(findItems(body, "이재명", true).hits.map((e) => e[2]), ["x", "y"]);
  assert.deepEqual(findItems([["OpenAI sues", "", "x", ""]], "openai").hits.length, 1);
});

test("영문 낱말은 단어 첫머리에서만, 한글은 낱말 안에서도 찾는다", () => {
  assert.deepEqual(positions("he said ai is aid", "ai"), [8, 14]);
  assert.deepEqual(positions("홈플러스가 휴업", "홈플러스"), [0]);
  assert.deepEqual(positions("u.s.-iran", "iran"), [5]);
  assert.equal(findItems([["Said", "", "x", ""]], "ai").hits.length, 0);
});
