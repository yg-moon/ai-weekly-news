// 사안별 보도량 셈을 작은 헤드라인 파일로 본다. 네트워크는 쓰지 않는다.
// 입력 형식은 collect-headlines 출력 그대로다.

import { test } from "node:test";
import assert from "node:assert/strict";
import { parseHeadlines, parseDefs, countTopics, outletOf, formatDetail } from "./count-topics.mjs";

const head = (src) => `\n${"=".repeat(70)}\n# ${src}\n${"=".repeat(70)}\n`;

const FRONT = head("front") + `
### 2026-09-29 (화) · 조선일보 A1
- 軍 “DMZ 폭발, 北 지뢰 가능성 매우 높다”
  https://n.news.naver.com/article/newspaper/023/1
- 알맹이 없었던 美中 정상회담
  https://n.news.naver.com/article/newspaper/023/2

### 2026-09-29 (화) · 한겨레 A1
- 합참 “DMZ 사고, 북 지뢰 가능성 매우 높아”
  https://n.news.naver.com/article/newspaper/028/1
- [포토] 지뢰 폭발 현장
  https://n.news.naver.com/article/newspaper/028/2

### 2026-09-30 (수) · 조선일보 A1
- 北 지뢰 도발, 폭발 지점에 최소 4발 묻었다
  https://n.news.naver.com/article/newspaper/023/3

### 2026-10-04 (일) · 연합뉴스 주요뉴스 (신문 없는 날)
- 김여정 "지뢰 자작극" 담화
  https://www.yna.co.kr/view/AKR1
`;

const DOMESTIC = head("domestic") + `
## 2026-09-28 (월) — 2개 묶음

### KBS
- DMZ 지뢰 현장조사
  https://n.news.naver.com/article/056/1
- 연예 기사
  https://n.news.naver.com/article/056/2

### SBS
- 지뢰 폭발 원인
  https://n.news.naver.com/article/055/1

## 2026-09-29 (화) — 1개 묶음

### KBS
- 北 지뢰 가능성
  https://n.news.naver.com/article/056/3
`;

const WORLD = head("world") + `
### 2026-09-28 · Armed conflicts and attacks
- Russian drones strike Kyiv, killing four people. (Reuters) (AP)
  https://www.reuters.com/world/a
  https://apnews.com/article/b
  https://edition.cnn.com/c
- Unrelated flood in Nepal kills dozens of people overnight. (BBC)
  https://www.bbc.co.uk/news/x

### 2026-09-29 · Armed conflicts and attacks
- Russia launches another large drone attack on Kyiv overnight. (The Guardian)
  https://www.theguardian.com/world/2026/sep/29/k

### 2026-09-28 · The Guardian
- Kyiv hit by drones as Russia escalates
  https://www.theguardian.com/world/2026/sep/28/a
- Kyiv residents shelter in metro
  https://www.theguardian.com/world/2026/sep/28/b

### 2026-09-29 · The Guardian
- Zelenskyy visits Kyiv blast site
  https://www.theguardian.com/world/2026/sep/29/c
`;

const AIMEDIA = head("aimedia") + `
### 2026-09-30 (수) · TechCrunch
- OpenAI launches Sora app
  https://techcrunch.com/a
- OpenAI's Sora tops the App Store
  https://techcrunch.com/b

### 2026-09-30 (수) · The Verge
- openai sora 2 app hands on
  https://www.theverge.com/ai-artificial-intelligence/1/x

### 2026-10-01 (목) · TechCrunch
- Sora deepfakes worry experts
  https://techcrunch.com/c
`;

const items = [FRONT, DOMESTIC, WORLD, AIMEDIA].flatMap((t) => parseHeadlines(t, "x"));

test("헤드라인 파일을 소스·날짜·매체별 항목으로 읽는다", () => {
  const front = items.filter((i) => i.kind === "front");
  assert.equal(front.length, 5);
  assert.deepEqual(front[0], { source: "front", kind: "front", day: "2026-09-29", outlet: "조선일보", title: "軍 “DMZ 폭발, 北 지뢰 가능성 매우 높다”", urls: ["https://n.news.naver.com/article/newspaper/023/1"] });
  assert.equal(items.filter((i) => i.kind === "yna")[0].day, "2026-10-04");
  assert.deepEqual(items.filter((i) => i.kind === "click").map((i) => `${i.day} ${i.outlet}`), ["2026-09-28 KBS", "2026-09-28 KBS", "2026-09-28 SBS", "2026-09-29 KBS"]);
  assert.deepEqual(items.find((i) => i.kind === "wiki").urls.map(outletOf), ["reuters.com", "apnews.com", "cnn.com"]);
  assert.equal(outletOf("https://www.bbc.co.uk/news/x"), "bbc.co.uk");
});

test("국내: 1면 날·곳, 연합은 따로 건수, 클릭은 [날, 곳]", () => {
  const defs = parseDefs(JSON.stringify([{ field: "korea", topic: "DMZ 지뢰", pattern: "지뢰|DMZ" }]));
  const [k] = countTopics(items, defs).result.korea;
  assert.deepEqual(k, { topic: "DMZ 지뢰", days: 2, outlets: 2, click: [2, 2], yna: 1, articles: 4 });
});

test("정의의 exclude 와 --exclude 가 걸린 제목을 뺀다", () => {
  const defs = parseDefs(JSON.stringify([{ field: "korea", topic: "DMZ 지뢰", pattern: "지뢰", exclude: "^\\[포토\\]" }]));
  const [k] = countTopics(items, defs).result.korea;
  assert.deepEqual([k.days, k.outlets, k.articles], [2, 2, 3]);
  const [g] = countTopics(items, defs, { exclude: "최소 4발" }).result.korea;
  assert.deepEqual([g.days, g.outlets, g.articles], [1, 2, 2]);
});

test("해외: (날짜, 매체) 쌍을 세고 Guardian 은 하루 1곳, 위키가 인용한 Guardian 과도 겹치지 않는다", () => {
  const defs = parseDefs(JSON.stringify([{ field: "world", topic: "키이우 공습", pattern: "Kyiv" }]));
  const [w] = countTopics(items, defs).result.world;
  // 9/28 reuters·apnews·cnn·guardian, 9/29 guardian 하나(위키 인용 + 목록)
  assert.deepEqual(w, { topic: "키이우 공습", days: 2, outlets: 5, media: 4, articles: 5 });
});

test("AI: aimedia 의 날·매체 수, 정렬은 큰 것부터", () => {
  const defs = parseDefs(JSON.stringify([
    { field: "ai", topic: "딥페이크", pattern: "deepfake" },
    { field: "ai", topic: "Sora", pattern: "sora" },
  ]));
  const { result, hits } = countTopics(items, defs);
  assert.deepEqual(result.ai, [
    { topic: "Sora", days: 2, outlets: 2, articles: 4 },
    { topic: "딥페이크", days: 1, outlets: 1, articles: 1 },
  ]);
  assert.match(formatDetail(hits), /## ai Sora \(4건\)\n  A 0930 TechCrunch OpenAI launches Sora app/);
});

test("실험 형식의 TSV 정의를 국내 사안으로 읽는다", () => {
  const defs = parseDefs("K1 DMZ 지뢰 폭발\tDMZ|지뢰\nN 아시안게임\t亞게임|아시안게임\t축구\n", "topics.tsv");
  assert.deepEqual(defs, [
    { field: "korea", topic: "K1 DMZ 지뢰 폭발", pattern: "DMZ|지뢰", exclude: undefined },
    { field: "korea", topic: "N 아시안게임", pattern: "亞게임|아시안게임", exclude: "축구" },
  ]);
  assert.throws(() => parseDefs('[{"field":"econ","topic":"x","pattern":"y"}]'), /field/);
});

test("해외: NPR 묶음은 하루 1곳, 위키가 같은 날 인용한 NPR 과 한 쌍이다", () => {
  const text = head("world") + `
### 2026-09-16 · Business and economy
- The Federal Reserve raises its benchmark interest rate by a quarter point. (NPR)
  https://www.npr.org/2026/09/16/x

### 2026-09-16 · NPR
- The Fed raises interest rates for the first time in over three years
  https://www.npr.org/2026/09/16/a
- How will the Fed's interest rate hike affect costs?
  https://www.npr.org/2026/09/16/b

### 2026-09-17 · NPR
- Mortgage rates jump after the Fed hike
  https://www.npr.org/2026/09/17/c

### 2026-09-17 · The Guardian
- Fed rate rise rattles emerging markets
  https://www.theguardian.com/world/2026/sep/17/d
`;
  const its = parseHeadlines(text, "world");
  assert.deepEqual(its.filter((i) => i.kind === "npr").map((i) => `${i.day} ${i.outlet}`), ["2026-09-16 npr.org", "2026-09-16 npr.org", "2026-09-17 npr.org"]);
  const defs = parseDefs(JSON.stringify([{ field: "world", topic: "연준 인상", pattern: "Fed(eral Reserve)?\\b" }]));
  const { result, hits } = countTopics(its, defs);
  // 9/16 npr.org(위키 인용 + 목록 2건), 9/17 npr.org·theguardian.com
  assert.deepEqual(result.world[0], { topic: "연준 인상", days: 2, outlets: 3, media: 2, articles: 5 });
  assert.match(formatDetail(hits), /  N 0916 npr\.org The Fed raises/);
});
